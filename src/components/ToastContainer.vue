<template>
  <Teleport to="body">
    <div id="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast-item"
        :class="t.type"
      >{{ t.msg }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { toasts } from '@/composables/useToast.js'
</script>
