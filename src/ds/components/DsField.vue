<script setup lang="ts">
import { computed, useId } from 'vue'
import DsIcon from './DsIcon.vue'

const props = withDefaults(
  defineProps<{
    label: string
    /** Help text shown under the label. */
    hint?: string
    /** Error text. When set, the control is marked invalid and described by it. */
    error?: string
    required?: boolean
    /** ID for the control. One is made when omitted. */
    id?: string
  }>(),
  { hint: undefined, error: undefined, required: false, id: undefined },
)

defineSlots<{
  /** The control. Bind `id`, `describedBy` and `invalid` to it. */
  default(props: { id: string; describedBy: string | undefined; invalid: boolean; required: boolean }): unknown
}>()

const autoId = useId()
const controlId = computed(() => props.id ?? `field-${autoId}`)
const hintId = computed(() => `${controlId.value}-hint`)
const errorId = computed(() => `${controlId.value}-error`)
const describedBy = computed(() => {
  const ids = [props.hint ? hintId.value : null, props.error ? errorId.value : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
})
</script>

<template>
  <div class="ds-field" :class="{ 'ds-field--invalid': Boolean(error) }">
    <label class="ds-field__label" :for="controlId">
      {{ label }}
      <span v-if="!required" class="ds-field__optional">optional</span>
    </label>
    <p v-if="hint" :id="hintId" class="ds-field__hint">{{ hint }}</p>
    <slot :id="controlId" :described-by="describedBy" :invalid="Boolean(error)" :required="required" />
    <p v-if="error" :id="errorId" class="ds-field__error">
      <DsIcon name="x-circle" :size="14" />
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<style lang="scss">
.ds-field {
  display: grid;
  gap: var(--space-1);
  min-width: 0;

  &__label {
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-sm);
  }

  &__optional {
    margin-left: var(--space-1);
    color: var(--color-muted);
    font-weight: var(--font-weight-regular);
    font-size: var(--font-size-xs);
  }

  &__hint {
    margin: 0;
    color: var(--color-muted);
    font-size: var(--font-size-xs);
  }

  &__error {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    margin: 0;
    color: var(--color-danger-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);

    .ds-icon {
      margin-top: 2px;
    }
  }
}
</style>
