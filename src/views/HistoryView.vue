<template>
  <div>
    <NavBar title="История оценок" :back-path="`/space/${spaceId}`" />
    <div class="inner-view view">
      <div style="font-size:13px;color:var(--t2);margin-bottom:4px">{{ voted.length }} из {{ total }} оценено</div>
      <div class="hist-list">
        <div
          v-for="n in voted"
          :key="n.name"
          class="hist-item"
          @click="revote(n.name)"
        >
          <div class="hist-name">{{ n.name }}</div>
          <div v-if="n.origin" style="font-size:11px;color:var(--t2)">{{ n.origin }}</div>
          <div class="hist-score">{{ RATINGS[clampScore(n.score) - 1].emoji }}</div>
          <div class="hist-lbl">{{ RATINGS[clampScore(n.score) - 1].label }}</div>
        </div>
        <div v-if="!voted.length" class="empty-state">
          <div class="empty-icon">🗳</div>
          <p class="empty-text">Ещё нет оценок</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { dbGetSpace, dbGetVotes, dbDeleteVote } from '@/services/db.js'
import { loadNames, getNamesByGroups, getNames } from '@/services/names.js'
import { RATINGS, clampScore } from '@/utils.js'

const route = useRoute()
const router = useRouter()
const spaceId = route.params.id

const space = ref(null)
const votesMap = ref({})

const activeNames = computed(() => getNamesByGroups(space.value?.nameGroups || ['all']))
const total = computed(() => activeNames.value.length)

const voted = computed(() => {
  const names = getNames()
  const byName = Object.fromEntries(names.map(n => [n.name, n]))
  return Object.entries(votesMap.value)
    .map(([name, score]) => ({ ...(byName[name] || { name }), score }))
    .sort((a, b) => b.score - a.score)
})

onMounted(async () => {
  await loadNames()
  space.value = await dbGetSpace(spaceId)
  if (!space.value) { router.replace('/'); return }
  votesMap.value = await dbGetVotes(spaceId)
})

async function revote(name) {
  await dbDeleteVote(spaceId, name)
  router.push(`/space/${spaceId}`)
}
</script>
