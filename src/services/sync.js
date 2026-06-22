import { L, safeUid } from './logger.js'
import { fbDb, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, serverTimestamp, query, where } from '@/firebase/config.js'
import { dbGetSpace, dbSaveSpace, dbGetMySpaces, dbAddOutbox, getDB } from './db.js'

let _user = null
let _draining = false

export function setSyncUser(user) {
  _user = user
}

export async function drainOutbox() {
  if (!_user) return { status: 'no-user', remaining: 0 }
  if (_draining || window._blockSync) {
    L('sync#drain', 'skip draining=' + _draining + ' blocked=' + !!window._blockSync)
    const db = await getDB()
    const remaining = (await db.getAll('outbox')).length
    return { status: window._blockSync ? 'blocked' : 'ok', remaining }
  }
  _draining = true
  L('sync#drain', 'start uid=' + safeUid(_user.uid))
  try {
    const db = await getDB()
    const entries = await db.getAll('outbox')
    if (!entries.length) {
      L('sync#drain', 'outbox empty')
      return { status: 'ok', remaining: 0 }
    }

    const votesBySpace = {}
    const others = []
    entries.forEach(e => {
      if (e.type === 'VOTE') {
        if (!votesBySpace[e.spaceId]) votesBySpace[e.spaceId] = []
        votesBySpace[e.spaceId].push(e)
      } else {
        others.push(e)
      }
    })

    const done = []

    for (const [spaceId, votes] of Object.entries(votesBySpace)) {
      const merged = {}
      votes.forEach(v => { merged[v.name] = v.score })
      try {
        await setDoc(
          doc(fbDb, 'spaces', spaceId, 'votes', _user.uid),
          { votes: merged, updatedAt: serverTimestamp() },
          { merge: true }
        )
        votes.forEach(v => done.push(v.id))
        L('sync#drain', 'VOTE batch ok spaceId=' + spaceId.slice(0, 8) + ' count=' + votes.length)
      } catch (e) {
        L('sync#drain', 'VOTE batch error spaceId=' + spaceId.slice(0, 8), e.message)
      }
    }

    for (const entry of others) {
      try {
        if (entry.type === 'SPACE_CREATE') {
          await setDoc(doc(fbDb, 'spaces', entry.spaceId), entry.data)
        } else if (entry.type === 'SPACE_UPDATE') {
          await updateDoc(doc(fbDb, 'spaces', entry.spaceId), entry.data)
        } else if (entry.type === 'MEMBER_JOIN') {
          await setDoc(doc(fbDb, 'spaces', entry.spaceId, 'members', _user.uid), entry.data, { merge: true })
        } else if (entry.type === 'USER_SPACE_LINK') {
          await setDoc(doc(fbDb, 'users', _user.uid, 'spaces', entry.spaceId), { at: serverTimestamp() }, { merge: true })
        } else {
          L('sync#drain', 'UNKNOWN type=' + entry.type)
          done.push(entry.id)
          continue
        }
        done.push(entry.id)
        L('sync#drain', entry.type + ' ok spaceId=' + entry.spaceId?.slice(0, 8))
      } catch (e) {
        L('sync#drain', entry.type + ' error', e.message)
      }
    }

    await Promise.all(done.map(id => db.delete('outbox', id)))
    const remaining = entries.length - done.length
    L('sync#drain', 'done remaining=' + remaining)
    return { status: remaining ? 'error' : 'ok', remaining }
  } finally {
    _draining = false
  }
}

export async function syncSpacesFromFirestore(uid) {
  L('sync#fetch', 'start uid=' + safeUid(uid))
  let hadNew = false

  // Step 1: spaces created by this user
  try {
    const q = query(collection(fbDb, 'spaces'), where('creatorUid', '==', uid))
    const snap = await getDocs(q)
    L('sync#fetch', 'creatorUid query returned=' + snap.size)
    for (const d of snap.docs) {
      const existing = await dbGetSpace(d.id)
      const data = d.data()
      const updated = {
        id: d.id, ...data,
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
        joinedUids: data.joinedUids || [uid],
      }
      if (!existing) {
        await dbSaveSpace(updated)
        hadNew = true
      } else if (data.deleted !== existing.deleted || data.status !== existing.status) {
        await dbSaveSpace({ ...existing, ...updated })
        hadNew = true
      }
    }
  } catch (e) { L('sync#fetch', 'step1 error', e.message) }

  // Step 2: spaces joined from another device
  try {
    const linksSnap = await getDocs(collection(fbDb, 'users', uid, 'spaces'))
    for (const linkDoc of linksSnap.docs) {
      const existing = await dbGetSpace(linkDoc.id)
      if (!existing) {
        const spaceSnap = await getDoc(doc(fbDb, 'spaces', linkDoc.id))
        if (spaceSnap.exists()) {
          const data = spaceSnap.data()
          const space = {
            id: spaceSnap.id, ...data,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
            joinedUids: data.joinedUids || [],
          }
          if (!space.joinedUids.includes(uid)) space.joinedUids.push(uid)
          await dbSaveSpace(space)
          hadNew = true
        }
      }
    }
  } catch (e) { L('sync#fetch', 'step2 error', e.message) }

  // Step 2b: detect spaces deleted by their creator
  try {
    const allSpaces = await dbGetMySpaces(uid)
    for (const space of allSpaces.filter(s => s.creatorUid !== uid && !s.deleted)) {
      try {
        const snap = await getDoc(doc(fbDb, 'spaces', space.id))
        if (!snap.exists() || snap.data().deleted) {
          await dbSaveSpace({ ...space, deleted: true, status: 'deleted' })
          hadNew = true
        }
      } catch (_) {}
    }
  } catch (e) { L('sync#fetch', 'step2b error', e.message) }

  // Step 3: sync vote progress for all known spaces
  try {
    const allSpaces = await dbGetMySpaces(uid)
    for (const space of allSpaces) {
      try {
        const vSnap = await getDoc(doc(fbDb, 'spaces', space.id, 'votes', uid))
        if (vSnap.exists()) {
          const count = Object.keys(vSnap.data().votes || {}).length
          if (count !== (space._progress || 0)) {
            space._progress = count
            await dbSaveSpace(space)
            hadNew = true
          }
        }
      } catch (e) { L('sync#fetch', 'progress error id=' + space.id.slice(0, 8), e.message) }
    }
  } catch (e) { L('sync#fetch', 'step3 error', e.message) }

  L('sync#fetch', 'done hadNew=' + hadNew)
  return hadNew
}

export async function updateSpace(spaceId, data) {
  const space = await dbGetSpace(spaceId)
  if (space) { Object.assign(space, data); await dbSaveSpace(space) }
  await dbAddOutbox({ type: 'SPACE_UPDATE', spaceId, data })
  drainOutbox()
}

export async function deleteSpace(spaceId) {
  const uid = _user?.uid
  try {
    await updateDoc(doc(fbDb, 'spaces', spaceId), { deleted: true, status: 'deleted' })
  } catch (e) {
    L('deleteSpace', 'Firestore update failed', e.message)
  }
  if (uid) {
    await deleteDoc(doc(fbDb, 'spaces', spaceId, 'votes', uid)).catch(() => {})
    await deleteDoc(doc(fbDb, 'spaces', spaceId, 'members', uid)).catch(() => {})
    await deleteDoc(doc(fbDb, 'users', uid, 'spaces', spaceId)).catch(() => {})
  }
  await deleteDoc(doc(fbDb, 'spaces', spaceId)).catch(() => {})

  const db = await getDB()
  await db.delete('spaces', spaceId)
  const tx = db.transaction('votes', 'readwrite')
  const keys = await tx.store.index('bySpace').getAllKeys(spaceId)
  await Promise.all(keys.map(k => tx.store.delete(k)))
  await tx.done
}
