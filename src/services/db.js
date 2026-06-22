import { openDB } from 'idb'
import { L, safeUid } from './logger.js'

let _db

export async function getDB() {
  if (_db) return _db
  _db = await openDB('names-roulette', 3, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('spaces', { keyPath: 'id' })
        const votes = db.createObjectStore('votes', { keyPath: 'key' })
        votes.createIndex('bySpace', 'spaceId')
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true })
        db.createObjectStore('names', { keyPath: 'name' })
      }
      if (oldVersion < 2) tx.objectStore('names').clear()
      if (oldVersion < 3) tx.objectStore('names').clear()
    },
  })
  return _db
}

export async function dbSaveSpace(space) {
  L('db#saveSpace', 'id=' + space.id?.slice(0, 8))
  const db = await getDB()
  await db.put('spaces', space)
}

export async function dbGetSpace(id) {
  const db = await getDB()
  const s = await db.get('spaces', id)
  L('db#getSpace', 'id=' + id?.slice(0, 8), s ? 'HIT' : 'MISS')
  return s
}

export async function dbGetMySpaces(uid) {
  const db = await getDB()
  const all = await db.getAll('spaces')
  const result = all
    .filter(s => s.creatorUid === uid || s.joinedUids?.includes(uid))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  L('db#getMySpaces', 'uid=' + safeUid(uid), 'found=' + result.length)
  return result
}

export async function dbSaveVote(spaceId, name, score) {
  const db = await getDB()
  await db.put('votes', { key: `${spaceId}::${name}`, spaceId, name, score, updatedAt: Date.now() })
}

export async function dbGetVotes(spaceId) {
  const db = await getDB()
  const idx = db.transaction('votes').store.index('bySpace')
  const rows = await idx.getAll(spaceId)
  const map = {}
  rows.forEach(r => { map[r.name] = r.score })
  return map
}

export async function dbGetVotesOrdered(spaceId) {
  const db = await getDB()
  const idx = db.transaction('votes').store.index('bySpace')
  const rows = await idx.getAll(spaceId)
  rows.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
  const map = {}
  rows.forEach(r => { map[r.name] = r.score })
  return { map, ordered: rows }
}

export async function dbDeleteVote(spaceId, name) {
  const db = await getDB()
  await db.delete('votes', `${spaceId}::${name}`)
}

export async function dbAddOutbox(entry) {
  L('db#outbox', 'add type=' + entry.type)
  const db = await getDB()
  await db.add('outbox', { ...entry, createdAt: Date.now(), attempts: 0 })
}
