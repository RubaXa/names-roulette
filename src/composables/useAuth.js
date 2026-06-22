import { ref, watch } from 'vue'
import { onAuthStateChanged, getE2EUser } from '@/services/auth.js'
import { setSyncUser } from '@/services/sync.js'
import { L, safeUid } from '@/services/logger.js'

export const currentUser = ref(null)
export const authReady = ref(false)

let _initialized = false

export function initAuth() {
  if (_initialized) return
  _initialized = true

  const e2eUser = getE2EUser()
  if (e2eUser) {
    currentUser.value = e2eUser
    setSyncUser(e2eUser)
    authReady.value = true
    L('auth', 'E2E user uid=' + safeUid(e2eUser.uid))
    return
  }

  onAuthStateChanged(user => {
    L('auth', 'state change uid=' + safeUid(user?.uid))
    currentUser.value = user
    setSyncUser(user)
    authReady.value = true
  })
}

export function waitForAuth() {
  if (authReady.value) return Promise.resolve()
  return new Promise(resolve => {
    const unwatch = watch(authReady, ready => {
      if (ready) { unwatch(); resolve() }
    })
  })
}
