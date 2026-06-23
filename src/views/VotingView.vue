<template>
  <NavBar :title="space?.title || 'Голосование'" back-path="/" :show-sync="true" :compact="true" />

  <!-- Done -->
  <div v-if="isDone" class="done-view view">
      <div class="done-icon">🎉</div>
      <div class="done-title">Вы оценили все {{ total }} имён!</div>
      <div class="done-sub">Результаты откроются, когда организатор завершит голосование</div>
      <div class="done-actions">
        <button class="btn btn-ghost btn-full" @click="router.push(`/space/${spaceId}/history`)">Посмотреть мои оценки</button>
        <button v-if="isCreator" class="btn btn-primary btn-full" @click="router.push(`/space/${spaceId}/admin`)">Панель организатора</button>
      </div>
    </div>

    <!-- Voting -->
    <div v-else-if="currentCard" class="voting-view view">
      <div class="voting-top">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>
        <div class="progress-text">{{ votedCount }}/{{ total }}</div>
        <RouterLink
          :to="`/space/${spaceId}/history`"
          class="history-link"
          :data-nav="`/space/${spaceId}/history`"
        >История</RouterLink>
        <RouterLink
          v-if="isCreator"
          :to="`/space/${spaceId}/admin`"
          class="history-link"
          :data-nav="`/space/${spaceId}/admin`"
        >⚙</RouterLink>
      </div>

      <div class="card-deck">
        <!-- Next card (behind) -->
        <div v-if="nextCard" :key="nextCard.name" class="card-wrap card-next" :class="{ rising: nextRising }">
          <div class="name-card" :style="cardBg(nextCard)">
            <div class="card-image" :style="{ backgroundImage: `url('${imgUrl(nextCard.name)}')` }"></div>
            <div class="card-overlay"></div>
            <div class="card-content">
              <div class="card-name">{{ nextCard.name }}</div>
            </div>
          </div>
        </div>

        <!-- Current card (front) -->
        <div class="card-wrap card-current">
          <div :key="currentCard.name" class="name-card" :class="flyClass" :style="cardBg(currentCard)">
            <div class="card-image" :style="{ backgroundImage: `url('${imgUrl(currentCard.name)}')` }"></div>
            <div class="card-overlay"></div>
            <div class="card-top-btns">
              <button class="card-top-btn card-back-btn" :disabled="!history.length || isAnimating" @click="goBack">← Назад</button>
              <button v-if="isReviewing" class="card-top-btn card-skip-btn" data-testid="card-forward" :disabled="isAnimating" @click="advanceKeep">Вперёд →</button>
            </div>
            <div class="card-content">
              <div class="card-name">{{ currentCard.name }}</div>
              <div v-if="currentCard.meaning" class="card-meaning">{{ currentCard.meaning }}</div>
              <div v-if="currentCard.origin" class="card-origin">{{ currentCard.origin }}</div>
              <div v-if="(currentCard.meaning || currentCard.origin) && (currentCard.nicknames?.length || currentCard.funFact)" class="card-divider"></div>
              <div v-if="currentCard.nicknames?.length" class="card-nicknames">👥 {{ currentCard.nicknames.join(' · ') }}</div>
              <div v-if="currentCard.funFact" class="card-fact">{{ currentCard.funFact }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="rating-section">
        <div class="rating-grid">
          <button
            v-for="r in RATINGS"
            :key="r.score"
            class="r-btn"
            :class="{ active: isReviewing && pendingReview.originalScore === r.score }"
            :disabled="isAnimating"
            @click="advanceCard(r.score)"
          >
            <span class="r-emoji">{{ r.emoji }}</span>
            <span class="r-lbl">{{ r.label }}</span>
          </button>
        </div>
      </div>
    </div>

  <!-- Loading -->
  <div v-else class="loading-screen">
    <div class="spinner"></div>
  </div>
</template>

<script setup>
// @file: Voting page — shows name cards one by one; user picks a rating 1–5, card animates out.
// @consumers: router/index.js (route /space/:id/vote)
//
// Vue 3 fragment: no outer <div> wrapper — NavBar, .done-view, .voting-view, .loading-screen are
// direct flex children of #app. Without this flex:1 on .view doesn't expand the card to fill height.
//
// isLoaded guard: onMounted loads names asynchronously, so at entry total > 0 but shuffledQueue = [].
// Without the guard isDone = (total > 0 && queue.length === 0) = true for one frame → flash of "done" screen.
// @invariant isLoaded is set to true only AFTER shuffledQueue is built; isDone checks isLoaded first.
//
// Voting mechanic (Tinder-style, mirrors legacy index.legacy.html — DO NOT add a "Next"/"Skip" button):
// @invariant Tapping a rating (.r-btn) INSTANTLY advances — advanceCard(score) flies the card away.
//   There is NO "Далее"/confirm step and NO "Пропустить"/skip button; both were spec violations.
// @invariant Two-card deck: .card-next sits behind .card-current; on advance current flies out
//   (fly-right for score≥4, fly-down for score≤3) while next .rising-s into place (CSS .25s).
// @invariant Review mode (after "← Назад"): goBack() removes the last vote from memory (kept in IDB),
//   re-queues that name, sets pendingReview. Then isReviewing=true → the card shows a "Вперёд →"
//   button (advanceKeep, re-confirms the same score) and the prior rating button is highlighted.
//   Tapping a different rating overwrites via advanceCard.

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { currentUser } from '@/composables/useAuth.js'
import { drain } from '@/composables/useSync.js'
import { dbGetSpace, dbSaveSpace, dbGetVotes, dbGetVotesOrdered, dbSaveVote, dbAddOutbox, dbDeleteVote } from '@/services/db.js'
import { loadNames, getNamesByGroups } from '@/services/names.js'
import { RATINGS, CARD_BG, shuffle, genId } from '@/utils.js'
import { fbDb, doc, getDoc, setDoc, serverTimestamp } from '@/firebase/config.js'

const route = useRoute()
const router = useRouter()
const spaceId = route.params.id

const space = ref(null)
const votes = ref({})       // { name: score } — loaded from IDB
const history = ref([])     // [{ name, score }]
const pendingReview = ref(null) // { name, originalScore }
const shuffledQueue = ref([])
const isLoaded = ref(false)
const flyClass = ref(null)
const nextRising = ref(false)
const isAnimating = ref(false)

const user = currentUser

const activeNames = computed(() => getNamesByGroups(space.value?.nameGroups || ['all']))

const votingQueue = computed(() => {
  const voted = new Set(Object.keys(votes.value))
  const byName = Object.fromEntries(activeNames.value.map(n => [n.name, n]))
  return shuffledQueue.value.filter(n => !voted.has(n) && byName[n]).map(n => byName[n])
})

const currentCard = computed(() => votingQueue.value[0] || null)
const nextCard = computed(() => votingQueue.value[1] || null)
const total = computed(() => activeNames.value.length)
const votedCount = computed(() => Object.keys(votes.value).length)
const isDone = computed(() => isLoaded.value && total.value > 0 && votingQueue.value.length === 0)
const progressPct = computed(() => total.value ? (votedCount.value / total.value * 100).toFixed(1) : 0)
const isCreator = computed(() => space.value?.creatorUid === user.value?.uid)
// @purpose True when the current card is the one we stepped back to review — drives "Вперёд →"
//   button visibility and the highlighted rating. See goBack/advanceKeep.
const isReviewing = computed(() => !!pendingReview.value && pendingReview.value.name === currentCard.value?.name)

function cardBg(nameData) {
  const all = getNamesByGroups(['all'])
  const idx = all.findIndex(n => n.name === nameData.name)
  const [c1, c2] = CARD_BG[Math.abs(idx) % CARD_BG.length]
  return { background: `linear-gradient(145deg,${c1},${c2})` }
}

function imgUrl(name) {
  return `${import.meta.env.BASE_URL}data/images/${encodeURIComponent(name)}.jpg`
}

onMounted(async () => {
  const names = await loadNames()

  // Load or fetch space
  let sp = await dbGetSpace(spaceId)
  if (!sp) {
    try {
      const snap = await getDoc(doc(fbDb, 'spaces', spaceId))
      if (snap.exists()) {
        const data = snap.data()
        if (data.deleted) { router.replace('/'); return }
        sp = { id: snap.id, ...data, createdAt: data.createdAt?.toMillis?.() || Date.now() }
        if (!sp.joinedUids) sp.joinedUids = []
        if (!sp.joinedUids.includes(user.value.uid)) sp.joinedUids.push(user.value.uid)
        await dbSaveSpace(sp)
        await dbAddOutbox({
          type: 'MEMBER_JOIN', spaceId,
          data: { displayName: user.value.displayName, photoURL: user.value.photoURL, joinedAt: serverTimestamp(), progress: 0 },
        })
        await dbAddOutbox({ type: 'USER_SPACE_LINK', spaceId })
        drain()
      }
    } catch (_) {}
  }
  if (!sp || sp.deleted) { router.replace('/'); return }
  space.value = sp

  // Load votes from IDB
  votes.value = await dbGetVotes(spaceId)

  // Merge from Firestore (cross-device)
  try {
    const fsSnap = await getDoc(doc(fbDb, 'spaces', spaceId, 'votes', user.value.uid))
    if (fsSnap.exists()) {
      const fsVotes = fsSnap.data().votes || {}
      let added = 0
      for (const [name, score] of Object.entries(fsVotes)) {
        if (!(name in votes.value)) {
          votes.value = { ...votes.value, [name]: score }
          await dbSaveVote(spaceId, name, score)
          added++
        }
      }
      if (added > 0) {
        const sp2 = await dbGetSpace(spaceId)
        if (sp2) { sp2._progress = Object.keys(votes.value).length; await dbSaveSpace(sp2) }
      }
    }
  } catch (_) {}

  // Reconstruct history from IDB (ordered by vote time) — survives page refresh
  const { ordered } = await dbGetVotesOrdered(spaceId)
  history.value = ordered.map(r => ({ name: r.name, score: r.score }))

  // Build shuffled queue
  const active = getNamesByGroups(sp.nameGroups || ['all'])
  shuffledQueue.value = shuffle(active.map(n => n.name))
  isLoaded.value = true
})

// @purpose Vote on the current card and fly it away. Triggered directly by a rating tap (no confirm step).
// @invariant dir = score≥4 ? 'right' : 'down' (matches RATINGS ❤️/👍 → right, 😐/👎/❌ → down).
// @invariant 320ms matches the legacy flyAndAdvance finish timeout (fly-right .28s / fly-down .30s + margin).
async function advanceCard(score) {
  if (isAnimating.value || !currentCard.value) return
  isAnimating.value = true
  const name = currentCard.value.name
  pendingReview.value = null
  history.value.push({ name, score })

  const dir = score >= 4 ? 'right' : 'down'
  flyClass.value = 'fly-' + dir
  nextRising.value = true

  await new Promise(r => setTimeout(r, 320))

  // Advance queue by marking as voted
  votes.value = { ...votes.value, [name]: score }
  flyClass.value = null
  nextRising.value = false
  isAnimating.value = false

  // Persist (fire and forget)
  saveVote(name, score)
}

// @purpose "Вперёд →" in review mode: re-confirm the previous score unchanged and move on.
async function advanceKeep() {
  if (isAnimating.value || !pendingReview.value) return
  isAnimating.value = true
  const { name, originalScore } = pendingReview.value
  pendingReview.value = null
  history.value.push({ name, score: originalScore })

  flyClass.value = 'fly-right'
  nextRising.value = true

  await new Promise(r => setTimeout(r, 320))

  votes.value = { ...votes.value, [name]: originalScore }
  flyClass.value = null
  nextRising.value = false
  isAnimating.value = false

  saveVote(name, originalScore)
}

async function saveVote(name, score) {
  await dbSaveVote(spaceId, name, score)
  await dbAddOutbox({ type: 'VOTE', spaceId, name, score })
  drain()
  const sp = await dbGetSpace(spaceId)
  if (sp) { sp._progress = Object.keys(votes.value).length; await dbSaveSpace(sp) }
}

// @purpose "← Назад": step back to the previously voted card to review/change it.
// @invariant The vote stays in IDB; only removed from the in-memory `votes` so the name re-enters
//   the queue at the front with pendingReview set (→ isReviewing → "Вперёд →" + highlighted rating).
function goBack() {
  if (!history.value.length || isAnimating.value) return
  if (pendingReview.value) {
    votes.value = { ...votes.value, [pendingReview.value.name]: pendingReview.value.originalScore }
    pendingReview.value = null
  }
  const last = history.value.pop()
  pendingReview.value = { name: last.name, originalScore: last.score }
  const { [last.name]: _, ...rest } = votes.value
  votes.value = rest
  // Put the name back at front of queue
  shuffledQueue.value = [last.name, ...shuffledQueue.value.filter(n => n !== last.name)]
}
</script>
