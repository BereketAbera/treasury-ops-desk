<script setup lang="ts">
import { computed } from 'vue'
import { DsAmount, DsButton, DsCountdown, formatDecimal } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { ratePlaces } from '@/lib/format'
import { findRoute } from '@/lib/routes'
import type { Payout, Quote } from '@/lib/types'

// The rate box of the payout form: the held rate with its countdown, or, once a submit has gone out
// with it, the rate that submit used. A countdown runs only while the rate can still be used.

const props = defineProps<{
  quote: Quote | null
  quoteState: 'none' | 'loading' | 'active' | 'expired' | 'failed'
  quoteError: { message: string; correlationId: string } | null
  /** A submit went out and the form is locked: no new rate can be asked for, and the countdown stops. */
  locked: boolean
  /** Set once the payout is accepted. The countdown gives way to the rate that was used. */
  accepted: Payout | null
}>()

const emit = defineEmits<{
  getRate: []
  /** The held rate ran out. */
  expired: []
}>()

const shown = computed(() => {
  if (props.accepted) return props.accepted
  return props.quote && (props.locked || props.quoteState === 'active') ? props.quote : null
})

const rateText = computed(() => {
  const terms = shown.value
  if (!terms) return ''
  const rate = formatDecimal(terms.rate, ratePlaces(findRoute(terms.routeId)?.rate))
  return `1 ${terms.source.currency} = ${rate} ${terms.target.currency}`
})
</script>

<template>
  <section class="payout__rate" aria-labelledby="rate-heading">
    <div class="payout__rate-head">
      <h2 id="rate-heading">Rate</h2>
      <span v-if="accepted" class="payout__rate-used payout__rate-used--accepted" data-testid="rate-used">Accepted at this rate</span>
      <span v-else-if="locked && quote" class="payout__rate-used" data-testid="rate-used">Submitted at this rate</span>
      <DsCountdown
        v-else-if="!locked && quote && (quoteState === 'active' || quoteState === 'expired')"
        :expires-at="quote.expiresAt"
        label="Held for"
        expired-label="Rate expired"
        data-testid="rate-countdown"
        @expired="emit('expired')"
      />
    </div>

    <dl v-if="shown" class="kv" data-testid="quote">
      <dt>Rate</dt>
      <dd class="num">{{ rateText }}</dd>
      <dt>Beneficiary receives</dt>
      <dd><DsAmount :minor="shown.target.amountMinor" :currency="shown.target.currency" :decimals="decimalsOf(shown.target.currency)" /></dd>
      <dt>You send</dt>
      <dd><DsAmount :minor="shown.source.amountMinor" :currency="shown.source.currency" :decimals="decimalsOf(shown.source.currency)" /></dd>
      <dt>Fee</dt>
      <dd><DsAmount :minor="shown.fee.amountMinor" :currency="shown.fee.currency" :decimals="decimalsOf(shown.fee.currency)" /></dd>
    </dl>
    <p v-else-if="quoteState === 'expired'" class="payout__rate-note payout__rate-note--warn" role="alert" data-testid="rate-expired">
      The rate expired, so Submit is locked. Refresh the rate to continue.
    </p>
    <p v-else-if="quoteState === 'failed' && quoteError" class="payout__rate-note payout__rate-note--warn" role="alert">
      {{ quoteError.message }} Correlation ID <span class="mono">{{ quoteError.correlationId }}</span>
    </p>
    <p v-else-if="locked" class="payout__rate-note muted">Locked until this submit is resolved.</p>
    <p v-else class="payout__rate-note muted">Choose a route and enter an amount, then get a rate. A rate is held for 30 seconds.</p>

    <DsButton
      v-if="!accepted"
      id="payout-get-rate"
      :variant="quoteState === 'active' ? 'secondary' : 'primary'"
      icon="refresh"
      :loading="quoteState === 'loading'"
      :disabled="locked"
      data-testid="get-rate"
      @click="emit('getRate')"
    >
      {{ quoteState === 'none' || quoteState === 'loading' ? 'Get rate' : 'Refresh rate' }}
    </DsButton>
  </section>
</template>
