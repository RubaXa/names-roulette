<template>
  <div
    class="sync-dot"
    :class="syncStatus !== 'ok' ? syncStatus : ''"
    :title="dotTitle"
  ></div>
</template>

<script setup>
import { computed } from 'vue'
import { syncStatus, pendingCount } from '@/composables/useSync.js'

const dotTitle = computed(() => {
  if (syncStatus.value === 'ok') return 'Синхронизировано'
  if (syncStatus.value === 'pending') return `Синхронизируется (${pendingCount.value})...`
  return `Не синхронизировано (${pendingCount.value})`
})
</script>
