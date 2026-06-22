import { createRouter, createWebHashHistory } from 'vue-router'
import { authReady, currentUser, waitForAuth } from '@/composables/useAuth.js'

const routes = [
  { path: '/',                      component: () => import('@/views/HomeView.vue') },
  { path: '/login',                 component: () => import('@/views/LoginView.vue') },
  { path: '/new-space',             component: () => import('@/views/NewSpaceView.vue') },
  { path: '/space/:id',             component: () => import('@/views/VotingView.vue') },
  { path: '/space/:id/admin',       component: () => import('@/views/AdminView.vue') },
  { path: '/space/:id/history',     component: () => import('@/views/HistoryView.vue') },
  { path: '/space/:id/results',     component: () => import('@/views/ResultsView.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  await waitForAuth()

  if (to.path !== '/login' && !currentUser.value) {
    if (to.path !== '/') sessionStorage.setItem('pendingRoute', '#' + to.fullPath)
    return '/login'
  }

  if (to.path === '/login' && currentUser.value) {
    const pending = sessionStorage.getItem('pendingRoute')
    if (pending) {
      sessionStorage.removeItem('pendingRoute')
      return pending.replace(/^#/, '') || '/'
    }
    return '/'
  }
})

export default router
