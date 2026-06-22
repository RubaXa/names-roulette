import { ref } from 'vue'
import { drainOutbox as _drain, syncSpacesFromFirestore } from '@/services/sync.js'

export const syncStatus = ref('ok')
export const pendingCount = ref(0)

export async function drain() {
  const result = await _drain()
  if (result && result.status !== 'no-user') {
    syncStatus.value = result.remaining > 0 ? 'pending' : result.status === 'error' ? 'error' : 'ok'
    pendingCount.value = result.remaining
  }
}

const HOME_SYNC_INTERVAL = 30_000
let _lastSync = 0

export async function syncHome(uid) {
  const now = Date.now()
  if (now - _lastSync < HOME_SYNC_INTERVAL) return false
  _lastSync = now
  return syncSpacesFromFirestore(uid)
}

export function resetSyncTimer() {
  _lastSync = 0
}
