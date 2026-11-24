<script setup lang="ts">
import { computed } from 'vue'
import { formatDecimal } from '../utils/money'

const props = withDefaults(
  defineProps<{
    /** The rate as a decimal string, for example "3712.46". Never a float. */
    rate: string
    /** Decimal places to show. Shorter rates are padded, so nothing is rounded. */
    places: number
    /**
     * Widest fraction in the column, in digits. The fraction is given this much
     * room, so rates with 2 and with 4 places line up on the decimal point.
     */
    alignPlaces?: number
  }>(),
  { alignPlaces: undefined },
)

const parts = computed(() => {
  const [whole = '', fraction = ''] = formatDecimal(props.rate, props.places).split('.')
  return { whole, fraction }
})
</script>

<template>
  <span class="ds-rate">
    <span class="ds-rate__whole">{{ parts.whole }}</span
    ><span class="ds-rate__fraction" :data-align="alignPlaces">{{ parts.fraction ? `.${parts.fraction}` : '' }}</span>
  </span>
</template>

<style lang="scss">
.ds-rate {
  display: inline-flex;
  align-items: baseline;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;

  &__fraction {
    display: inline-block;
    text-align: left;

    // Room for the point and up to eight digits. Set by attribute, not by inline style.
    @for $places from 1 through 8 {
      &[data-align='#{$places}'] {
        min-width: #{$places + 1}ch;
      }
    }
  }
}
</style>
