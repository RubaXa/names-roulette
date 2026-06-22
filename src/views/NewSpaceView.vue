<template>
  <div>
    <NavBar title="Новое голосование" back-path="/" />
    <div class="new-space-view view">
      <div class="page-title">Новое голосование</div>

      <div class="form-group">
        <label class="lbl">Название сессии</label>
        <input class="inp" id="inp-title" type="text" v-model="title" placeholder="Наш список имён" maxlength="80" autofocus>
      </div>

      <div class="form-group">
        <label class="lbl">Пол</label>
        <div class="gender-row">
          <button class="gender-btn active" id="btn-female"><span class="g-emoji">👧</span>Девочки</button>
          <button class="gender-btn" id="btn-male" disabled><span class="g-emoji">👦</span>Мальчики<br><small style="font-size:10px;opacity:.5">скоро</small></button>
        </div>
        <div class="gender-note">{{ activeCount }} имён из реестра Москвы 2015–2026</div>
      </div>

      <div class="form-group origin-filter">
        <label class="origin-filter-label">Категории имён</label>
        <div class="origin-chips">
          <label
            v-for="g in groupCounts"
            :key="g.key"
            class="origin-chip"
            :class="{ checked: checkedGroups.has(g.key) }"
          >
            <input type="checkbox" :value="g.key" :checked="checkedGroups.has(g.key)" @change="toggleGroup(g.key)">
            {{ g.label }} <span class="chip-count">{{ g.count }}</span>
          </label>
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-create" @click="createSpace">
        Создать — {{ activeCount }} имён
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { currentUser } from '@/composables/useAuth.js'
import { drain } from '@/composables/useSync.js'
import { dbSaveSpace, dbAddOutbox } from '@/services/db.js'
import { ORIGIN_GROUPS, getNamesByGroups, loadNames, getNames } from '@/services/names.js'
import { genId } from '@/utils.js'
import { serverTimestamp } from '@/firebase/config.js'

const router = useRouter()
const title = ref('')
const checkedGroups = ref(new Set(ORIGIN_GROUPS.map(g => g.key)))

const groupCounts = computed(() => {
  const names = getNames()
  return ORIGIN_GROUPS.map(g => {
    const s = new Set(g.origins)
    return { ...g, count: names.filter(n => s.has(n.origin)).length }
  })
})

const selectedKeys = computed(() => {
  const all = checkedGroups.value.size === ORIGIN_GROUPS.length
  return all ? ['all'] : [...checkedGroups.value]
})

const activeCount = computed(() => {
  return getNamesByGroups(selectedKeys.value).length
})

function toggleGroup(key) {
  const next = new Set(checkedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  checkedGroups.value = next
}

onMounted(() => loadNames())

async function createSpace() {
  const user = currentUser.value
  if (!user) return
  const id = genId()
  const spaceData = {
    id,
    title: title.value.trim() || 'Наш список имён',
    status: 'active',
    gender: 'female',
    nameGroups: selectedKeys.value,
    creatorUid: user.uid,
    creatorName: user.displayName || '',
    createdAt: Date.now(),
  }
  await dbSaveSpace(spaceData)
  await dbAddOutbox({ type: 'SPACE_CREATE', spaceId: id, data: { ...spaceData, createdAt: serverTimestamp() } })
  await dbAddOutbox({ type: 'USER_SPACE_LINK', spaceId: id })
  drain()
  router.push(`/space/${id}`)
}
</script>
