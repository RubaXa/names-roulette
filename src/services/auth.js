import { L } from './logger.js'
import { fbAuth, gProvider, signInWithPopup, fbSignOut, onAuthStateChanged as _onAuthStateChanged } from '@/firebase/config.js'

export async function signIn() {
  L('auth', 'signIn attempt')
  try {
    await signInWithPopup(fbAuth, gProvider)
    L('auth', 'signIn success')
  } catch (e) {
    L('auth', 'signIn error', e.code, e.message)
    if (e.code !== 'auth/popup-closed-by-user') throw e
  }
}

export async function signOut() {
  L('auth', 'signOut')
  await fbSignOut(fbAuth)
}

export function onAuthStateChanged(callback) {
  return _onAuthStateChanged(fbAuth, callback)
}

export function getE2EUser() {
  const param = new URLSearchParams(location.search).get('e2e_user')
  if (!param || !['localhost', '127.0.0.1'].includes(location.hostname)) return null
  try { return JSON.parse(atob(param)) } catch (_) { return null }
}
