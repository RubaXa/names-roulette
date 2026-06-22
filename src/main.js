import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { initAuth, currentUser } from './composables/useAuth.js'
import { drain } from './composables/useSync.js'
import { dbGetVotes, dbGetMySpaces, getDB } from './services/db.js'
import './style.css'

initAuth()

const app = createApp(App)
app.use(router)
app.mount('#app')

// E2E helpers — localhost only
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.__e2e = {
    get state() { return { user: currentUser.value } },
    getVotes: (sid) => dbGetVotes(sid),
    getOutbox: async () => { const db = await getDB(); return db.getAll('outbox') },
    getSpaces: (uid) => dbGetMySpaces(uid),
    blockSync: (v) => { window._blockSync = v },
  }
}

window.addEventListener('online', () => {
  import('./composables/useToast.js').then(({ toast }) => toast('Соединение восстановлено', 'ok'))
  drain()
})
document.addEventListener('visibilitychange', () => { if (!document.hidden) drain() })
