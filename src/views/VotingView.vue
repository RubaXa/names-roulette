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
        <!-- Ghost overlay: the voted card swiping OUT, or (on "Назад") the prior card sliding back IN.
             During a rewind the real front card is hidden until the ghost lands → no duplicate. -->
        <div v-if="flyingCard" class="card-wrap" :class="flyingCard.anim" :style="{ zIndex: 6 }">
          <div class="name-card" :style="cardBg(flyingCard.card)">
            <div class="card-image" :style="{ backgroundImage: `url('${imgUrl(flyingCard.card.name)}')` }"></div>
            <div class="card-overlay"></div>
            <div class="card-content">
              <div class="card-name">{{ flyingCard.card.name }}</div>
              <div v-if="flyingCard.card.meaning" class="card-meaning">{{ flyingCard.card.meaning }}</div>
              <div v-if="flyingCard.card.origin" class="card-origin">{{ flyingCard.card.origin }}</div>
              <div v-if="(flyingCard.card.meaning || flyingCard.card.origin) && (flyingCard.card.nicknames?.length || flyingCard.card.funFact)" class="card-divider"></div>
              <div v-if="flyingCard.card.nicknames?.length" class="card-nicknames">👥 {{ flyingCard.card.nicknames.join(' · ') }}</div>
              <div v-if="flyingCard.card.funFact" class="card-fact">{{ flyingCard.card.funFact }}</div>
            </div>
          </div>
        </div>

        <!-- Live stack: front + up to 2 behind, keyed by NAME so promotion never remounts -->
        <div
          v-for="(card, i) in stack"
          :key="card.name"
          class="card-wrap"
          :class="['depth-' + i, i === 0 && 'card-current']"
          :style="{ zIndex: 5 - i, visibility: (i === 0 && isRewinding) ? 'hidden' : null }"
        >
          <div class="name-card" :style="cardBg(card)">
            <div class="card-image" :style="{ backgroundImage: `url('${imgUrl(card.name)}')` }"></div>
            <div class="card-overlay"></div>
            <div v-if="i === 0" class="card-top-btns">
              <button class="card-top-btn card-back-btn" :disabled="!history.length || isAnimating" @click="goBack">← Назад</button>
              <button v-if="isReviewing" class="card-top-btn card-skip-btn" data-testid="card-forward" :disabled="isAnimating" @click="advanceKeep">Вперёд →</button>
            </div>
            <div class="card-content">
              <div class="card-name">{{ card.name }}</div>
              <div v-if="card.meaning" class="card-meaning">{{ card.meaning }}</div>
              <div v-if="card.origin" class="card-origin">{{ card.origin }}</div>
              <div v-if="(card.meaning || card.origin) && (card.nicknames?.length || card.funFact)" class="card-divider"></div>
              <div v-if="card.nicknames?.length" class="card-nicknames">👥 {{ card.nicknames.join(' · ') }}</div>
              <div v-if="card.funFact" class="card-fact">{{ card.funFact }}</div>
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
            @click="advanceCard(r.score, $event)"
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
// @invariant Swipe deck: `stack` renders the top 3 queued cards in a v-for keyed by NAME, so when a
//   vote removes the front name the cards behind are REUSED (not remounted) — they just change their
//   depth-N class and glide one slot forward via the .card-wrap transform transition. The voted card
//   is copied into `flyingCard`, a ghost overlay that animates out (.swipe-*) at the same time, so
//   leave + advance overlap into one motion. Keying by position instead caused remounts → pop-in +
//   image reflash, which is the jerk/flicker we fixed.
// @invariant Direction by score: 4,5 → swipe-right · 3 → swipe-up · 1,2 → swipe-left (see swipeDir).
// @invariant Images are preloaded a few cards ahead (preloadImg watcher) so a photo is cached before
//   its card surfaces — no flash when a card rises into view.
// @invariant Review mode (after "← Назад"): goBack() removes the last vote from memory (kept in IDB),
//   re-queues that name, sets pendingReview. Then isReviewing=true → the card shows a "Вперёд →"
//   button (advanceKeep, re-confirms the same score) and the prior rating button is highlighted.
//   Tapping a different rating overwrites via advanceCard.

import { ref, computed, watch, onMounted } from 'vue'
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
const flyingCard = ref(null) // { card, dir } — ghost of the just-voted card animating out
const isAnimating = ref(false)

// @purpose How long the ghost stays mounted = the swipe animation duration (must match the
//   .swipe-* / .card-wrap transitions in style.css). Vote persistence does NOT wait for this.
const FLY_MS = 420

const user = currentUser

const activeNames = computed(() => getNamesByGroups(space.value?.nameGroups || ['all']))

const votingQueue = computed(() => {
  const voted = new Set(Object.keys(votes.value))
  const byName = Object.fromEntries(activeNames.value.map(n => [n.name, n]))
  return shuffledQueue.value.filter(n => !voted.has(n) && byName[n]).map(n => byName[n])
})

const currentCard = computed(() => votingQueue.value[0] || null)
// @purpose The visible deck: front card + up to 2 behind. Keyed by name in the template.
const stack = computed(() => votingQueue.value.slice(0, 3))
const total = computed(() => activeNames.value.length)
const votedCount = computed(() => Object.keys(votes.value).length)
const isDone = computed(() => isLoaded.value && total.value > 0 && votingQueue.value.length === 0)
const progressPct = computed(() => total.value ? (votedCount.value / total.value * 100).toFixed(1) : 0)
const isCreator = computed(() => space.value?.creatorUid === user.value?.uid)
// @purpose True when the current card is the one we stepped back to review — drives "Вперёд →"
//   button visibility and the highlighted rating. See goBack/advanceKeep.
const isReviewing = computed(() => !!pendingReview.value && pendingReview.value.name === currentCard.value?.name)
// @purpose True while a "Назад" rewind ghost is sliding the prior card back in — used to hide the
//   real (identical) front card underneath until the ghost lands, so they don't briefly double up.
const isRewinding = computed(() => !!flyingCard.value && flyingCard.value.anim.startsWith('rewind'))

function cardBg(nameData) {
  const all = getNamesByGroups(['all'])
  const idx = all.findIndex(n => n.name === nameData.name)
  const [c1, c2] = CARD_BG[Math.abs(idx) % CARD_BG.length]
  return { background: `linear-gradient(145deg,${c1},${c2})` }
}

function imgUrl(name) {
  return `${import.meta.env.BASE_URL}data/images/${encodeURIComponent(name)}.jpg`
}

// @purpose Warm the browser cache for upcoming card photos so they paint instantly when a card
//   rises into view (cards use CSS background-image, which otherwise loads on first reveal → flash).
const _preloaded = new Set()
function preloadImg(name) {
  if (!name || _preloaded.has(name)) return
  _preloaded.add(name)
  new Image().src = imgUrl(name)
}
watch(votingQueue, q => q.slice(0, 5).forEach(c => preloadImg(c.name)), { immediate: true })

// @purpose Map a score to its swipe direction: positive → right, neutral → up, negative → left.
function swipeDir(score) {
  return score >= 4 ? 'swipe-right' : score === 3 ? 'swipe-up' : 'swipe-left'
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

// @purpose Vote on the current card and swipe it away. Triggered directly by a rating tap (no confirm).
// @invariant The queue advances (and the vote persists) IMMEDIATELY — the FLY_MS wait only keeps the
//   ghost overlay alive for the animation. So the stack glides forward in the same beat the ghost flies.
async function advanceCard(score, ev) {
  if (isAnimating.value || !currentCard.value) return
  // Drop focus so the tapped button doesn't stay visually engaged on the next card (touch :focus).
  ev?.currentTarget?.blur?.()
  isAnimating.value = true
  const card = currentCard.value
  pendingReview.value = null
  history.value.push({ name: card.name, score })

  flyingCard.value = { card, anim: swipeDir(score) }
  votes.value = { ...votes.value, [card.name]: score } // removes name from queue → stack shifts forward
  saveVote(card.name, score) // persist now, don't wait for the animation

  await new Promise(r => setTimeout(r, FLY_MS))
  flyingCard.value = null
  isAnimating.value = false
}

// @purpose "Вперёд →" in review mode: re-confirm the previous score unchanged and move on.
async function advanceKeep() {
  if (isAnimating.value || !pendingReview.value || !currentCard.value) return
  isAnimating.value = true
  const card = currentCard.value
  const { name, originalScore } = pendingReview.value
  pendingReview.value = null
  history.value.push({ name, score: originalScore })

  flyingCard.value = { card, anim: swipeDir(originalScore) }
  votes.value = { ...votes.value, [name]: originalScore }
  saveVote(name, originalScore)

  await new Promise(r => setTimeout(r, FLY_MS))
  flyingCard.value = null
  isAnimating.value = false
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
// @invariant The returning card slides back IN from the side it left (rewind-* ghost, mirror of the
//   swipe-out), while the card it interrupts recedes one slot — the reverse of an advance.
function goBack() {
  if (!history.value.length || isAnimating.value) return
  isAnimating.value = true
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

  // Slide the returning card back in from the direction it originally flew out.
  const byName = Object.fromEntries(activeNames.value.map(n => [n.name, n]))
  flyingCard.value = { card: byName[last.name], anim: swipeDir(last.score).replace('swipe', 'rewind') }
  setTimeout(() => { flyingCard.value = null; isAnimating.value = false }, FLY_MS)
}
</script>
