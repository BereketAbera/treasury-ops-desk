<script setup lang="ts">
import { ICONS, type IconName } from './icons'

withDefaults(
  defineProps<{
    name: IconName
    /** Pixel size of the square icon. */
    size?: number
    /** Give a title only when the icon stands alone with no text next to it. */
    title?: string
  }>(),
  { size: 16, title: undefined },
)
</script>

<template>
  <svg
    class="ds-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="title ? 'img' : undefined"
    :aria-label="title"
    :aria-hidden="title ? undefined : 'true'"
    focusable="false"
  >
    <path v-for="(d, index) in ICONS[name]" :key="index" :d="d" />
  </svg>
</template>

<style lang="scss">
.ds-icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
