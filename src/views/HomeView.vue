<!--
  @file: Home page — space list + create flow.
  Uses an inline <nav> instead of <NavBar> component: home has a unique tab-bar nav and doesn't need
  backPath or SyncDot, so reusing NavBar would require extra prop-drilling for no benefit.
-->
<template>
  <div>
    <nav class="nav">
      <div class="nav-left"><span class="nav-title">✨ Назовём</span></div>
      <div class="nav-right">
        <button class="debug-btn" @click="copyLogs" title="Копировать логи">🐞</button>
        <SyncDot />
        <div v-if="user" class="nav-avatar" @click="onAvatarClick" :title="user.displayName || ''">
          <img v-if="user.photoURL" :src="user.photoURL" alt="">
          <template v-else>{{ avatarInitials }}</template>
        </div>
      </div>
    </nav>

    <div class="home-view view">
      <button class="home-create" @click="router.push('/new-space')">
        <div>
          <div class="home-create-text">Новое голосование</div>
          <div class="home-create-sub">Поделитесь ссылкой с семьёй</div>
        </div>
        <div class="home-create-icon">🎴</div>
      </button>

      <div class="home-tabs">
        <button class="home-tab" :class="{ active: tab === 'participating' }" @click="tab = 'participating'">
          Участвую{{ participatingSpaces.length ? ` (${participatingSpaces.length})` : '' }}
        </button>
        <button class="home-tab" :class="{ active: tab === 'mine' }" @click="tab = 'mine'">
          Мои голосования{{ mySpaces.length ? ` (${mySpaces.length})` : '' }}
        </button>
      </div>

      <div class="space-list">
        <template v-if="shownSpaces.length">
          <template v-if="tab === 'mine'">
            <div v-for="s in shownSpaces" :key="s.id" class="space-card" @click="router.push(`/space/${s.id}/admin`)">
              <div>
                <div class="space-card-name">{{ s.title }}</div>
                <div class="space-card-meta">
                  <span class="status-pill" :class="s.status === 'active' ? 'status-active' : 'status-closed'">
                    {{ s.status === 'active' ? '● Открыт' : '○ Закрыт' }}
                  </span>
                  <span>👥 {{ s._memberCount !== undefined ? s._memberCount : '?' }}</span>
                  <span v-if="s._avgProgress !== undefined">📊 {{ Math.round(s._avgProgress) }}%</span>
                </div>
              </div>
              <span class="space-chevron">›</span>
            </div>
          </template>
          <template v-else>
            <div v-for="s in shownSpaces" :key="s.id" class="space-card" @click="router.push(`/space/${s.id}`)">
              <div>
                <div class="space-card-name">{{ s.title }}</div>
                <div class="space-card-meta">
                  <span class="status-pill" :class="s.status === 'active' ? 'status-active' : 'status-closed'">
                    {{ s.status === 'active' ? '● Открыт' : '○ Закрыт' }}
                  </span>
                  <span v-if="s.creatorUid === user?.uid">👑 Автор</span>
                  <span v-if="s._progress">{{ s._progress }} оценено</span>
                </div>
              </div>
              <span class="space-chevron">›</span>
            </div>
          </template>
        </template>
        <div v-else class="empty-state">
          <div class="empty-icon">🎴</div>
          <p class="empty-text">{{ emptyText }}</p>
        </div>
      </div>

      <div class="home-footer"><a href="chart.html">📈 Аналитика имён 2015–2026</a></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import SyncDot from '@/components/SyncDot.vue'
import { currentUser } from '@/composables/useAuth.js'
import { syncHome, drain } from '@/composables/useSync.js'
import { dbGetMySpaces } from '@/services/db.js'
import { signOut } from '@/services/auth.js'
import { LOG_BUFFER } from '@/services/logger.js'
import { toast } from '@/composables/useToast.js'
import { initials } from '@/utils.js'
import { loadNames as _loadNames } from '@/services/names.js'

const router = useRouter()
const user = currentUser
const tab = ref('participating')
const spaces = ref([])
let _syncInterval = null

const avatarInitials = computed(() => initials(user.value?.displayName))
const mySpaces = computed(() => spaces.value.filter(s => s.creatorUid === user.value?.uid))
const participatingSpaces = computed(() => spaces.value)
const shownSpaces = computed(() => tab.value === 'mine' ? mySpaces.value : participatingSpaces.value)
const emptyText = computed(() =>
  tab.value === 'mine'
    ? 'Вы ещё не создавали голосований.\nНажмите «Новое голосование» выше.'
    : 'Нет активных голосований.\nСоздайте своё или попросите прислать ссылку.'
)

async function loadSpaces() {
  if (!user.value) return
  const all = await dbGetMySpaces(user.value.uid)
  spaces.value = all.filter(s => !s.deleted)
}

async function runSync() {
  if (!user.value) return
  const hadNew = await syncHome(user.value.uid)
  if (hadNew) await loadSpaces()
}

onMounted(async () => {
  await _loadNames()
  await loadSpaces()
  drain()
  runSync()
  _syncInterval = setInterval(runSync, 30_000)
})

onUnmounted(() => {
  clearInterval(_syncInterval)
})

async function copyLogs() {
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
