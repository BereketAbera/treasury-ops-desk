<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { DsIcon } from '@/ds'
import { SCENARIOS, type ScenarioId } from '@/mocks/scenario'
import { useSimulateStore } from '@/stores/simulate'

const simulate = useSimulateStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const toggle = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)

async function show() {
  open.value = true
  await nextTick()
  panel.value?.querySelector<HTMLInputElement>('input:checked')?.focus()
}

function hide(returnFocus: boolean) {
  open.value = false
  if (returnFocus) toggle.value?.focus()
}

function onDocumentPointer(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) hide(false)
}

function choose(id: ScenarioId) {
  simulate.set(id)
}

onMounted(() => document.addEventListener('mousedown', onDocumentPointer))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentPointer))
</script>

<template>
  <div ref="root" class="simulate" @keydown.esc="hide(true)">
    <button
      ref="toggle"
      type="button"
      class="ds-button ds-button--secondary ds-button--md simulate__toggle"
      :class="{ 'simulate__toggle--armed': !simulate.isNormal }"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="simulate-panel"
      data-testid="simulate-toggle"
      @click="open ? hide(false) : show()"
    >
      <DsIcon name="sliders" />
      <span>Simulate: {{ simulate.scenario.label }}</span>
      <DsIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="12" />
    </button>

    <div v-show="open" id="simulate-panel" ref="panel" class="simulate__panel">
      <fieldset class="simulate__group">
        <legend class="simulate__legend">Simulate</legend>
        <p class="simulate__intro">
          The API is a mock running in this browser. Choose what it does next, then follow the link under your choice.
        </p>
        <div
          v-for="scenario in SCENARIOS"
          :key="scenario.id"
          class="simulate__option"
          :class="{ 'simulate__option--on': simulate.current === scenario.id }"
        >
          <input
            :id="`simulate-${scenario.id}`"
            type="radio"
            name="simulate"
            :value="scenario.id"
            :checked="simulate.current === scenario.id"
            :aria-describedby="`simulate-${scenario.id}-watch`"
            @change="choose(scenario.id)"
          />
          <div class="simulate__text">
            <label :for="`simulate-${scenario.id}`" class="simulate__label">{{ scenario.label }}</label>
            <p :id="`simulate-${scenario.id}-watch`" class="simulate__watch">{{ scenario.watch }}</p>
            <RouterLink
              v-if="simulate.current === scenario.id"
              :to="scenario.tryPath"
              class="simulate__try"
              @click="hide(false)"
            >
              {{ scenario.tryLabel }}
            </RouterLink>
          </div>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.simulate {
  &__toggle--armed:not(:disabled) {
    border-color: var(--color-warning-text);
    background: var(--color-warning-tint);
    color: var(--color-warning-text);

    &:hover {
      background: var(--color-warning-tint);
    }
  }

  &__panel {
    position: absolute;
    top: calc(100% + 4px);
    right: var(--space-5);
    z-index: 30;
    width: min(460px, calc(100vw - 32px));
    max-height: min(76vh, 640px);
    overflow: auto;
    padding: var(--space-4);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-overlay);
  }

  &__group {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  &__legend {
    padding: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  &__intro {
    margin-bottom: var(--space-2);
    color: var(--color-muted);
    font-size: var(--font-size-sm);
  }

  &__option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-md);

    input {
      flex: none;
      width: 16px;
      height: 16px;
      margin: 2px 0 0;
      accent-color: var(--color-primary);
    }

    &--on {
      background: var(--color-row-selected);
    }
  }

  &__text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  &__label {
    font-weight: var(--font-weight-bold);
    cursor: pointer;
  }

  &__watch {
    color: var(--color-muted);
    font-size: var(--font-size-sm);
  }

  &__try {
    justify-self: start;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }
}

@media (max-width: t.$breakpoint-phone) {
  .simulate__panel {
    left: var(--space-4);
    right: var(--space-4);
    width: auto;
  }
}
</style>
