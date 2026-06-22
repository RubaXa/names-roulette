<template>
  <nav :class="['nav', compact && 'nav-compact']">
    <div class="nav-left">
      <button v-if="backPath !== null" class="nav-back" @click="router.push(backPath)">‹</button>
      <span class="nav-title">{{ title }}</span>
    </div>
    <div class="nav-right">
      <button v-if="showDebug" class="debug-btn" :class="{ 'has-error': hasError }" @click="copyLogs" title="Копировать логи">🐞</button>
      <SyncDot v-if="showSync" />
      <div v-if="user" class="nav-avatar" @click="onAvatarClick" :title="user.displayName || ''">
        <img v-if="user.photoURL" :src="user.photoURL" alt="">
        <template v-else>{{ avatarInitials }}</template>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import SyncDot from './SyncDot.vue'
import { currentUser } from '@/composables/useAuth.js'
import { signOut } from '@/services/auth.js'
import { LOG_BUFFER } from '@/services/logger.js'
import { toast } from '@/composables/useToast.js'
import { initials } from '@/utils.js'

const props = defineProps({
  title: { type: String, default: '' },
  backPath: { type: String, default: null },
  showSync: { type: Boolean, default: true },
  showDebug: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
})

const router = useRouter()
const user = currentUser
const hasError = ref(false)

const avatarInitials = computed(() => initials(user.value?.displayName))

async function copyLogs() {
  hasError.value = false
  try {
    await navigator.clipboard.writeText(LOG_BUFFER.join('\n'))
    toast(`Логи скопированы (${LOG_BUFFER.length})`, 'ok')
  } catch (_) {
    toast('Clipboard недоступен', 'error')
  }
}

function onAvatarClick() {
  if (confirm(`Выйти из аккаунта?\n${user.value?.displayName || user.value?.email}`)) {
    signOut().then(() => router.push('/login'))
  }
}
</script>
