<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import DsIcon from './DsIcon.vue'

const props = defineProps<{
  /** The text placed on the clipboard. */
  value: string
  /** What is being copied, for the accessible name: "Copy correlation ID". */
  label: string
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
  } catch {
    // Clipboard access can be refused. Fall back to a selection the user can copy by hand.
    const area = document.createElement('textarea')
    area.value = props.value
    area.setAttribute('readonly', '')
    area.className = 'ds-visually-hidden'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  copied.value = true
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1600)
}

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <button type="button" class="ds-copy" :aria-label="label" :title="label" @click.stop="copy">
    <DsIcon :name="copied ? 'check' : 'copy'" :size="14" />
    <span class="ds-visually-hidden" role="status">{{ copied ? 'Copied' : '' }}</span>
  </button>
</template>

<style lang="scss">
.ds-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;

  &:hover {
    background: var(--color-row-hover);
  }
}
</style>
