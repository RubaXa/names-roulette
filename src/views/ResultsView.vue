<template>
  <NavBar title="Результаты" :back-path="isCreator ? `/space/${spaceId}/admin` : '/'" />
  <div class="results-view view">
    <div class="results-head">
      <div class="results-title">{{ space?.title }}</div>
      <div class="results-sub">Голосование завершено</div>
    </div>

    <template v-if="isCreator">
      <div class="tabs">
        <button class="tab" :class="{ on: mainTab === 'rating' }" @click="mainTab = 'rating'">Рейтинг</button>
        <button class="tab" :class="{ on: mainTab === 'breakdown' }" @click="mainTab = 'breakdown'">По участникам</button>
      </div>
    </template>

    <template v-if="mainTab === 'rating' && !loading">
      <div class="penalty-ctrl">
        <div class="penalty-label">
          <span>Штраф за отрицательные голоса</span>
          <span>×{{ penalty.toFixed(1) }}</span>
        </div>
        <input class="pen-range" type="range" min="0" max="2" step="0.1" v-model.number="penalty" />
      </div>
      <div class="viz-switch">
        <button class="viz-btn" :class="{ on: vizMode === 'likert' }" @click="vizMode = 'likert'">≡ Ликерт</button>
        <button class="viz-btn" :class="{ on: vizMode === 'heat' }" @click="vizMode = 'heat'">⊞ Карта</button>
        <button class="viz-btn" :class="{ on: vizMode === 'strip' }" @click="vizMode = 'strip'">· Точки</button>
      </div>
    </template>

    <div id="results-content">
      <div v-if="loading" class="loading-screen" style="min-height:200px"><div class="spinner"></div></div>

      <template v-else-if="mainTab === 'rating'">
        <div v-if="!aggregated.length" class="empty-state"><div class="empty-icon">📊</div><p class="empty-text">Нет данных</p></div>

        <!-- A: Diverging Likert — each segment = one participant, neg left / pos right -->
        <template v-else-if="vizMode === 'likert'">
          <div v-for="(item, i) in aggregated" :key="item.name" class="lik-row">
            <div class="lik-rank">{{ i + 1 }}</div>
            <div class="lik-name" :title="item.name">
              {{ item.name }}<span v-if="item.origin" class="lik-origin"> · {{ item.origin }}</span>
            </div>
            <div class="lik-bar-wrap">
              <div class="lik-neg-half">
                <template v-for="uid in participants" :key="'n'+uid">
                  <div class="lik-seg"
                    :class="{ 'lik-empty': !(allVotes[uid]?.[item.name] <= 2 && allVotes[uid]?.[item.name]) }"
                    :style="{ width: (100/participants.length)+'%', background: (allVotes[uid]?.[item.name] <= 2 && allVotes[uid]?.[item.name]) ? RATING_COLORS[allVotes[uid][item.name]-1] : undefined }"
                    :title="allVotes[uid]?.[item.name] ? (uid===user?.uid?'Вы':'Участник')+': '+RATINGS[allVotes[uid][item.name]-1].label : ''" />
                </template>
              </div>
              <div class="lik-center"></div>
              <div class="lik-pos-half">
                <template v-for="uid in participants" :key="'p'+uid">
                  <div class="lik-seg"
                    :class="{ 'lik-empty': !(allVotes[uid]?.[item.name] >= 3) }"
                    :style="{ width: (100/participants.length)+'%', background: allVotes[uid]?.[item.name] >= 3 ? RATING_COLORS[allVotes[uid][item.name]-1] : undefined }"
                    :title="allVotes[uid]?.[item.name] ? (uid===user?.uid?'Вы':'Участник')+': '+RATINGS[allVotes[uid][item.name]-1].label : ''" />
                </template>
              </div>
            </div>
            <div class="lik-score">{{ item.avg.toFixed(1) }}</div>
          </div>
        </template>

        <!-- B: Heat map — names × participants grid -->
        <template v-else-if="vizMode === 'heat'">
          <div class="heat-scroll">
            <table class="heat-table">
              <thead>
                <tr>
                  <th class="heat-th heat-th-rank">#</th>
                  <th class="heat-th heat-th-name">Имя</th>
                  <th v-for="uid in participants" :key="uid" class="heat-th">{{ uid === user?.uid ? 'Вы' : 'Уч.' }}</th>
                  <th class="heat-th">Avg</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, i) in aggregated" :key="item.name" class="heat-tr">
                  <td class="heat-td-rank">{{ i + 1 }}</td>
                  <td class="heat-td-name">{{ item.name }}<span v-if="item.origin" class="heat-origin"> · {{ item.origin }}</span></td>
                  <td v-for="uid in participants" :key="uid" class="heat-td-cell">
                    <div v-if="allVotes[uid]?.[item.name]" class="heat-cell"
                      :style="{ background: RATING_COLORS[allVotes[uid][item.name]-1] }">
                      {{ RATINGS[allVotes[uid][item.name]-1].emoji }}
                    </div>
                    <div v-else class="heat-cell heat-cell-empty">—</div>
                  </td>
                  <td class="heat-td-avg">{{ item.avg.toFixed(1) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- C: Strip plot — dots on 1–5 axis per participant -->
        <template v-else>
          <div v-for="(item, i) in aggregated" :key="item.name" class="strip-row">
            <div class="strip-rank">{{ i + 1 }}</div>
            <div class="strip-name" :title="item.name">{{ item.name }}</div>
            <div class="strip-axis">
              <div v-for="n in 5" :key="n" class="strip-tick" :style="{ left: (n-1)/4*100+'%' }"></div>
              <div class="strip-avg-line" :style="{ left: ((item.avg-1)/4*100)+'%' }"></div>
              <div v-for="(uid, j) in participants" :key="uid"
                class="strip-dot"
                :style="{
                  left: ((allVotes[uid]?.[item.name] || 3)-1)/4*100+'%',
                  background: PTCOLS[j % PTCOLS.length],
                  top: (2 + j * 5) + 'px',
                }"
                :title="allVotes[uid]?.[item.name] ? (uid===user?.uid?'Вы':'Участник')+': '+RATINGS[allVotes[uid][item.name]-1].label : '—'" />
            </div>
            <div class="strip-score">{{ item.avg.toFixed(1) }}</div>
          </div>
        </template>
      </template>

      <!-- Breakdown by participant -->
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
</template>

<script setup>
// @file: Results page — shows closed-space voting results with 3 switchable visualizations.
// @consumers: router/index.js (route /space/:id/results)
//
// Visualization modes (vizMode):
//   'likert' — diverging bar per name: neg votes (1-2) left of center, pos (3-5) right; each segment = one participant.
//   'heat'   — grid table: rows = names sorted by score, columns = participants, cell = emoji on score-colored bg.
//   'strip'  — dot plot: each name is a 1–5 axis, each participant is a colored dot at their score position.
//
// Penalty slider (penalty, 0–2):
//   @invariant Applies only to scores ≤ 2: effectiveScore = max(0, raw - penalty).
//   Affects ranking order but not the raw vote cells shown in heat/strip/likert.

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { currentUser } from '@/composables/useAuth.js'
import { dbGetSpace } from '@/services/db.js'
import { loadNames, getNames } from '@/services/names.js'
import { fbDb, getDocs, collection } from '@/firebase/config.js'
import { RATINGS, RATING_COLORS, clampScore } from '@/utils.js'
import { toast } from '@/composables/useToast.js'

// @purpose Fixed color palette for participant dots in strip/heat views (cycled by participant index).
const PTCOLS = ['#7c5cbf', '#1a9e8f', '#c05a2a', '#2980b9', '#8e44ad']

const route = useRoute()
const router = useRouter()
const spaceId = route.params.id

const space = ref(null)
const loading = ref(true)
const mainTab = ref('rating')
const vizMode = ref('likert')
const penalty = ref(0)
const allVotes = ref({}) // { uid: { name: score } } — loaded from Firestore subcollection votes/
const user = currentUser

const isCreator = computed(() => space.value?.creatorUid === user.value?.uid)

/**
 * @purpose Ordered participant UID list — current user always first for consistent column ordering.
 * @invariant Order is stable across re-renders as long as allVotes keys don't change.
 */
const participants = computed(() => {
  const uids = Object.keys(allVotes.value)
  const me = user.value?.uid
  return me && uids.includes(me) ? [me, ...uids.filter(u => u !== me)] : uids
})

/**
 * @purpose Aggregate all participant votes into a ranked list with penalty-adjusted average.
 * @invariant penalty only reduces scores ≤ 2 — scores 3–5 are never penalised.
 * @invariant Sorted descending by penalty-adjusted avg; raw voteCounts reflect original scores for display.
 */
const aggregated = computed(() => {
  // #region START_AGGREGATE_SCORES
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
      const voteCounts = {}
      scores.forEach(s => { voteCounts[s] = (voteCounts[s] || 0) + 1 })
      const effectiveScores = scores.map(s => s <= 2 ? Math.max(0, s - penalty.value) : s)
      const avg = effectiveScores.reduce((s, v) => s + v, 0) / effectiveScores.length
      return { name, origin: byName[name]?.origin || '', avg, voteCounts, total: scores.length }
    })
    .sort((a, b) => b.avg - a.avg)
  // #endregion END_AGGREGATE_SCORES
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
