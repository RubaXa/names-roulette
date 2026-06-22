<template>
  <div>
    <NavBar title="Результаты" :back-path="isCreator ? `/space/${spaceId}/admin` : '/'" />
    <div class="results-view view">
      <div class="results-head">
        <div class="results-title">{{ space?.title }}</div>
        <div class="results-sub">Голосование завершено</div>
      </div>

      <template v-if="isCreator">
        <div class="tabs">
          <button class="tab" :class="{ on: activeTab === 'aggregate' }" @click="activeTab = 'aggregate'">Общий рейтинг</button>
          <button class="tab" :class="{ on: activeTab === 'breakdown' }" @click="activeTab = 'breakdown'">По участникам</button>
        </div>
      </template>

      <div id="results-content">
        <div v-if="loading" class="loading-screen" style="min-height:200px"><div class="spinner"></div></div>
        <template v-else-if="activeTab === 'aggregate'">
          <div v-for="(item, i) in aggregated" :key="item.name" class="res-item">
            <div class="res-rank">{{ i + 1 }}</div>
            <div class="res-body">
              <div class="res-name">{{ item.name }}<span v-if="item.origin" class="res-origin">{{ item.origin }}</span></div>
              <div class="res-bar">
                <div v-for="(seg, j) in item.segments" :key="j" class="res-seg" :style="{ width: seg.pct + '%', background: RATING_COLORS[j] }"></div>
              </div>
              <div class="res-votes">
                <span v-for="r in RATINGS.slice().reverse()" :key="r.score" class="res-vote-chip">
                  {{ r.emoji }} {{ item.voteCounts[r.score] || 0 }}
                </span>
              </div>
            </div>
            <div class="res-score">{{ item.avg.toFixed(1) }}</div>
          </div>
          <div v-if="!aggregated.length" class="empty-state"><div class="empty-icon">📊</div><p class="empty-text">Нет данных</p></div>
        </template>
        <template v-else>
          <div v-for="bd in breakdown" :key="bd.uid" class="bd-card">
            <div class="bd-title">{{ bd.uid === user?.uid ? '👤 Вы' : 'Участник' }}</div>
            <div v-for="([name, score]) in bd.votes" :key="name" class="bd-row">
              <span style="font-size:14px;font-weight:500">{{ name }}</span>
              <span style="font-size:18px">{{ RATINGS[clampScore(score) - 1].emoji }}</span>
            </div>
            <div v-if="!bd.votes.length" style="font-size:13px;color:var(--t2)">Нет понравившихся имён</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { currentUser } from '@/composables/useAuth.js'
import { dbGetSpace } from '@/services/db.js'
import { loadNames, getNamesByGroups, getNames } from '@/services/names.js'
import { fbDb, doc, getDoc, getDocs, collection } from '@/firebase/config.js'
import { RATINGS, RATING_COLORS, clampScore } from '@/utils.js'
import { toast } from '@/composables/useToast.js'

const route = useRoute()
const router = useRouter()
const spaceId = route.params.id

const space = ref(null)
const loading = ref(true)
const activeTab = ref('aggregate')
const allVotes = ref({}) // { uid: { name: score } }
const user = currentUser

const isCreator = computed(() => space.value?.creatorUid === user.value?.uid)

const aggregated = computed(() => {
  const names = getNames()
  const byName = Object.fromEntries(names.map(n => [n.name, n]))
  const scoreMap = {}
  for (const votes of Object.values(allVotes.value)) {
    for (const [name, score] of Object.entries(votes)) {
      if (!scoreMap[name]) scoreMap[name] = []
      scoreMap[name].push(score)
    }
  }
  return Object.entries(scoreMap)
    .map(([name, scores]) => {
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length
      const voteCounts = {}
      scores.forEach(s => { voteCounts[s] = (voteCounts[s] || 0) + 1 })
      const segments = RATINGS.map(r => ({ pct: ((voteCounts[r.score] || 0) / scores.length * 100) }))
      return { name, origin: byName[name]?.origin || '', avg, voteCounts, segments }
    })
    .sort((a, b) => b.avg - a.avg)
})

const breakdown = computed(() =>
  Object.entries(allVotes.value).map(([uid, votes]) => ({
    uid,
    votes: Object.entries(votes).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]),
  }))
)

onMounted(async () => {
  await loadNames()
  space.value = await dbGetSpace(spaceId)
  if (!space.value) { router.replace('/'); return }
  if (space.value.status !== 'closed') {
    toast('Результаты будут доступны после завершения', 'error')
    router.replace(`/space/${spaceId}`)
    return
  }

  try {
    const votesSnap = await getDocs(collection(fbDb, 'spaces', spaceId, 'votes'))
    const map = {}
    votesSnap.docs.forEach(d => { map[d.id] = d.data().votes || {} })
    allVotes.value = map
  } catch (_) {}
  loading.value = false
})
</script>
