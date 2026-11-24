<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DsIcon from './DsIcon.vue'

const props = withDefaults(
  defineProps<{
    /** When the countdown ends, in epoch milliseconds. */
    expiresAt: number
    /** Seconds left at which the countdown turns to its warning look. */
    warnAt?: number
    /** Text before the time, for example "Rate held for". */
    label?: string
    expiredLabel?: string
    /** Clock source, replaceable in tests. */
    now?: () => number
  }>(),
  { warnAt: 10, label: undefined, expiredLabel: 'Expired', now: undefined },
)

const emit = defineEmits<{
  /** Fired once, when the time runs out. */
  expired: []
}>()

const clock = () => (props.now ? props.now() : Date.now())
const remainingMs = ref(Math.max(0, props.expiresAt - clock()))
let timer: ReturnType<typeof setInterval> | null = null
let announced = false

function stop() {
  if (timer !== null) clearInterval(timer)
  timer = null
}

function tick() {
  remainingMs.value = Math.max(0, props.expiresAt - clock())
  if (remainingMs.value === 0) {
    stop()
    if (!announced) {
      announced = true
      emit('expired')
    }
  }
}

function start() {
  stop()
  announced = false
  tick()
  if (remainingMs.value > 0) timer = setInterval(tick, 250)
}

watch(() => props.expiresAt, start, { immediate: true })
onBeforeUnmount(stop)

const seconds = computed(() => Math.ceil(remainingMs.value / 1000))
const expired = computed(() => remainingMs.value === 0)
const display = computed(() => {
  const minutes = Math.floor(seconds.value / 60)
  return `${minutes}:${String(seconds.value % 60).padStart(2, '0')}`
})
const state = computed(() => (expired.value ? 'expired' : seconds.value <= props.warnAt ? 'warning' : 'running'))
</script>

<template>
  <span class="ds-countdown" :class="`ds-countdown--${state}`" role="timer" aria-live="off" :data-state="state">
    <DsIcon :name="expired ? 'alert-triangle' : 'clock'" :size="14" />
    <template v-if="expired">{{ expiredLabel }}</template>
    <span v-else class="ds-countdown__time">{{ label ? `${label} ` : '' }}{{ display }}</span>
  </span>
</template>

<style lang="scss">
.ds-countdown {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-info-tint);
  color: var(--color-info-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  white-space: nowrap;

  &--warning,
  &--expired {
    background: var(--color-warning-tint);
    color: var(--color-warning-text);
  }

  &__time {
    font-variant-numeric: tabular-nums;
  }
}
</style>
