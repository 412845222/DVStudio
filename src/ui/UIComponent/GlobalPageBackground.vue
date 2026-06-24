<template>
  <div
    class="gpb-container"
    :class="['gpb-variant-' + variant]"
    aria-hidden="true"
  >
    <div class="gpb-grid"></div>
    <div class="gpb-radial"></div>
    <div class="gpb-glow gpb-glow-1"></div>
    <div class="gpb-glow gpb-glow-2"></div>
    <div class="gpb-glow gpb-glow-3"></div>
    <div class="gpb-scanline-top"></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /**
   * Visual variant:
   * - 'default': balanced (settings, studio, etc.)
   * - 'workflow': subdued/professional (AI workflow canvas)
   * - 'project-list': vibrant (matches original project list design)
   */
  variant?: 'default' | 'workflow' | 'project-list'
}>()
</script>

<style lang="css">
@import "../../styles/global-page-background.css";
</style>
