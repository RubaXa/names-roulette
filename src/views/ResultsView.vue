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
      <div class="pen-grid">
        <div class="pen-card">
          <div class="pen-hd">
            <span class="pen-lbl pen-lbl-pop">Популярность</span>
            <span class="pen-val">{{ penaltyPop }}%</span>
          </div>
          <input class="pen-range" type="range" min="0" max="100" step="1" v-model.number="penaltyPop" />
          <div class="pen-sub">Анна (0.95), Мария (0.88)…</div>
        </div>
        <div class="pen-card">
          <div class="pen-hd">
            <span class="pen-lbl pen-lbl-dis">Вето-голос</span>
            <span class="pen-val">{{ penaltyDissent }}%</span>
          </div>
          <input class="pen-range" type="range" min="0" max="100" step="1" v-model.number="penaltyDissent" />
          <div class="pen-sub">Штраф за каждую оценку «1»</div>
        </div>
        <div class="pen-card">
          <div class="pen-hd">
            <span class="pen-lbl pen-lbl-sig">Разброс мнений</span>
            <span class="pen-val">{{ penaltySigma }}%</span>
          </div>
          <input class="pen-range" type="range" min="0" max="100" step="1" v-model.number="penaltySigma" />
          <div class="pen-sub">[1,5,1,5] хуже [3,3,4,4]</div>
        </div>
        <div class="pen-card">
          <div class="pen-hd">
            <span class="pen-lbl pen-lbl-len">Длина имени</span>
            <span class="pen-val">{{ penaltyLen }}%</span>
          </div>
          <input class="pen-range" type="range" min="0" max="100" step="1" v-model.number="penaltyLen" />
          <div class="pen-sub">Идеал 5–7 букв; Ия (2), Анастасия (9)</div>
        </div>
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
            <div class="lik-mid">
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
              <div v-if="item.p.pop > 0.05 || item.p.dis > 0.05 || item.p.sig > 0.05 || item.p.len > 0.05" class="pchips">
                <span v-if="item.p.pop > 0.05" class="pchip pchip-pop">pop −{{ item.p.pop.toFixed(1) }}</span>
                <span v-if="item.p.dis > 0.05" class="pchip pchip-dis">veto −{{ item.p.dis.toFixed(1) }}</span>
                <span v-if="item.p.sig > 0.05" class="pchip pchip-sig">σ −{{ item.p.sig.toFixed(1) }}</span>
                <span v-if="item.p.len > 0.05" class="pchip pchip-len">len −{{ item.p.len.toFixed(1) }}</span>
              </div>
            </div>
            <div class="lik-score">
              {{ item.score.toFixed(1) }}
              <div v-if="item.score < item.avg - 0.05" class="lik-avg">{{ item.avg.toFixed(1) }}</div>
            </div>
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
                  <th class="heat-th">Score</th>
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
                  <td class="heat-td-avg" :title="item.score < item.avg - 0.05 ? 'avg: '+item.avg.toFixed(1) : ''">
                    <span :class="{ 'heat-penalized': item.score < item.avg - 0.05 }">{{ item.score.toFixed(1) }}</span>
                  </td>
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
            <div class="strip-mid">
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
              <div v-if="item.p.pop > 0.05 || item.p.dis > 0.05 || item.p.sig > 0.05 || item.p.len > 0.05" class="pchips">
                <span v-if="item.p.pop > 0.05" class="pchip pchip-pop">pop −{{ item.p.pop.toFixed(1) }}</span>
                <span v-if="item.p.dis > 0.05" class="pchip pchip-dis">veto −{{ item.p.dis.toFixed(1) }}</span>
                <span v-if="item.p.sig > 0.05" class="pchip pchip-sig">σ −{{ item.p.sig.toFixed(1) }}</span>
                <span v-if="item.p.len > 0.05" class="pchip pchip-len">len −{{ item.p.len.toFixed(1) }}</span>
              </div>
            </div>
            <div class="strip-score">
              {{ item.score.toFixed(1) }}
              <div v-if="item.score < item.avg - 0.05" class="strip-avg">{{ item.avg.toFixed(1) }}</div>
            </div>
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
// Four penalty sliders (0–100% each) — all affect only sort order; raw vote cells always show actual scores:
//   @invariant score = avg − pPop − pDis − pSig − pLen (clamped to 0)
//   pPop = (penaltyPop/100)     * popularity    * 2.0  — Анна (0.95), Мария (0.88) drop first
//   pDis = (penaltyDissent/100) * dissentCount  * 0.8  — штраф за каждую оценку «1» от участника
//   pSig = (penaltySigma/100)   * sigma         * 0.9  — [1,5,1,5] хуже [3,3,4,4]
//   pLen = (penaltyLen/100)     * max(0,|len−6|) * 0.28 — идеал 5–7 букв; Ия (2), Анастасия (9) теряют
//   `avg` always shown unmodified for context; active chips (pop/dis/σ/len) show each penalty's contribution.

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { currentUser } from '@/composables/useAuth.js'
import { dbGetSpace } from '@/services/db.js'
import { loadNames, getNames } from '@/services/names.js'
import { fbDb, getDocs, collection } from '@/firebase/config.js'
import { RATINGS, RATING_COLORS, clampScore } from '@/utils.js'
import { toast } from '@/composables/useToast.js'

// @purpose Fixed color palette for participant dots in strip view (cycled by participant index).
const PTCOLS = ['#7c5cbf', '#1a9e8f', '#c05a2a', '#2980b9', '#8e44ad']

const route = useRoute()
const router = useRouter()
const spaceId = route.params.id

const space = ref(null)
const loading = ref(true)
const mainTab = ref('rating')
const vizMode = ref('likert')
const penaltyPop     = ref(0)
const penaltyDissent = ref(0)
const penaltySigma   = ref(0)
const penaltyLen     = ref(0)
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
 * @purpose Aggregate all participant votes into a ranked list, sorted by penalised score.
 * @invariant `avg` is always the raw unpenalised average — used for display and chip labels.
 * @invariant `score` = avg − pPop − pDis − pSig − pLen — used only for sort order.
 * @invariant `p` carries each penalty's numerical contribution for chip display.
 * @invariant `popularity` from names_enriched.json (0–1 float, real demographic data).
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
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length
      const popularity = byName[name]?.popularity ?? 0.1
      const sigma = scores.length > 1
        ? Math.sqrt(scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length)
        : 0
      const dissentCount = scores.filter(s => s === 1).length
      const lenDev = Math.max(0, Math.abs(name.length - 6))

      const pPop = (penaltyPop.value     / 100) * popularity   * 2.0
      const pDis = (penaltyDissent.value / 100) * dissentCount * 0.8
      const pSig = (penaltySigma.value   / 100) * sigma        * 0.9
      const pLen = (penaltyLen.value     / 100) * lenDev       * 0.28
      const score = Math.max(0, avg - pPop - pDis - pSig - pLen)
      return { name, origin: byName[name]?.origin || '', avg, score, voteCounts, total: scores.length, p: { pop: pPop, dis: pDis, sig: pSig, len: pLen } }
    })
    .sort((a, b) => b.score - a.score)
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
