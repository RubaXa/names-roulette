import { ref } from 'vue'

export const toasts = ref([])
let _id = 0

export function toast(msg, type = '') {
  const id = ++_id
  toasts.value.push({ id, msg, type })
  setTimeout(() => {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }, 3200)
}
