<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DsAmount, DsBanner, DsButton, DsCopyButton, DsStatusBadge, formatDecimal, statusLabel } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { formatDateTime, ratePlaces } from '@/lib/format'
import { api } from '@/lib/http'
import { newCorrelationId } from '@/lib/ids'
import { findRoute, routeLabel } from '@/lib/routes'
import type { Payout } from '@/lib/types'
import { usePayoutsStore, type PayoutRow } from '@/stores/payouts'

const props = defineProps<{ payout: PayoutRow }>()

const store = usePayoutsStore()
const busy = ref<'check' | 'retry' | null>(null)
const notice = ref<{ tone: 'success' | 'danger'; text: string; correlationId?: string } | null>(null)

watch(
  () => props.payout.id,
  () => {
    notice.value = null
    busy.value = null
  },
)

const route = computed(() => findRoute(props.payout.routeId))
const rateText = computed(() => formatDecimal(props.payout.rate, ratePlaces(route.value?.rate)))
const canRetry = computed(() => props.payout.status === 'failed' && props.payout.failure?.retryable === true)

async function act(kind: 'check' | 'retry') {
  if (busy.value) return
  busy.value = kind
  notice.value = null
  const correlationId = newCorrelationId()
  const path = `/api/payouts/${props.payout.id}/${kind === 'check' ? 'status-check' : 'retry'}`
  const result = await api.request<Payout>({ method: 'POST', path, correlationId })
  busy.value = null
  if (result.kind === 'ok') {
    store.replace(result.data)
    notice.value =
      kind === 'check'
        ? { tone: 'success', text: `Status confirmed: ${statusLabel(result.data.status).toLowerCase()}. The payment was made once.` }
        : { tone: 'success', text: 'Retry accepted. The payout is processing again.' }
  } else {
    notice.value = {
      tone: 'danger',
      text:
        result.kind === 'error'
          ? `${result.error.message} (${result.status})`
          : 'No answer from the API. Nothing has changed on this payout. Try the action again.',
      correlationId,
    }
  }
}
</script>

<template>
  <div class="detail" data-testid="payout-detail">
    <div class="detail__status">
      <DsStatusBadge :status="payout.awaitingConfirmation ? 'awaiting_confirmation' : payout.status" />
      <span class="muted">Updated {{ formatDateTime(payout.updatedAt) }}</span>
    </div>

    <DsBanner v-if="payout.awaitingConfirmation" tone="info" title="Accepted, not yet in the list">
      <p>The API accepted this payout. The list it serves has not caught up yet, so this row comes from the answer to your submit.</p>
    </DsBanner>

    <DsBanner v-if="payout.status === 'outcome_unknown'" tone="unknown" title="We could not confirm this payout">
      <p>Do not resend. Check status first: a resend could pay the beneficiary twice.</p>
      <template #actions>
        <DsButton variant="primary" :loading="busy === 'check'" @click="act('check')">Check status</DsButton>
      </template>
    </DsBanner>

    <DsBanner v-if="payout.failure" tone="danger" :title="payout.failure.message">
      <p>
        Code <code>{{ payout.failure.code }}</code
        >. {{ payout.failure.nextStep }}
      </p>
      <p v-if="!payout.failure.retryable" class="muted">Retrying the same instruction will not help.</p>
      <template v-if="canRetry" #actions>
        <DsButton variant="primary" :loading="busy === 'retry'" @click="act('retry')">Retry payout</DsButton>
      </template>
    </DsBanner>

    <DsBanner v-if="notice" :tone="notice.tone" announce="status">
      <p>{{ notice.text }}</p>
      <p v-if="notice.correlationId" class="detail__id">
        Correlation ID <span class="mono">{{ notice.correlationId }}</span>
        <DsCopyButton :value="notice.correlationId" label="Copy correlation ID" />
      </p>
    </DsBanner>

    <section aria-labelledby="detail-amounts">
      <h3 id="detail-amounts">Amounts</h3>
      <dl class="kv">
        <dt>Beneficiary receives</dt>
        <dd>
          <DsAmount :minor="payout.target.amountMinor" :currency="payout.target.currency" :decimals="decimalsOf(payout.target.currency)" />
        </dd>
        <dt>You send</dt>
        <dd>
          <DsAmount :minor="payout.source.amountMinor" :currency="payout.source.currency" :decimals="decimalsOf(payout.source.currency)" />
        </dd>
        <dt>Fee</dt>
        <dd>
          <DsAmount :minor="payout.fee.amountMinor" :currency="payout.fee.currency" :decimals="decimalsOf(payout.fee.currency)" />
        </dd>
        <dt>Rate</dt>
        <dd class="num">1 {{ payout.source.currency }} = {{ rateText }} {{ payout.target.currency }}</dd>
        <dt>Route</dt>
        <dd>{{ route ? routeLabel(route) : payout.routeId }}</dd>
        <dt>Purpose code</dt>
        <dd>{{ payout.purposeCode ?? 'Not required' }}</dd>
      </dl>
    </section>

    <section aria-labelledby="detail-beneficiary">
      <h3 id="detail-beneficiary">Beneficiary</h3>
      <dl class="kv">
        <dt>Name</dt>
        <dd>{{ payout.beneficiary.name }}</dd>
        <dt>Bank</dt>
        <dd>{{ payout.beneficiary.bank }}</dd>
        <dt>{{ route?.account.label ?? 'Account' }}</dt>
        <dd class="mono mono--wrap">{{ payout.beneficiary.account }}</dd>
        <dt>Your reference</dt>
        <dd class="mono">{{ payout.reference }}</dd>
      </dl>
    </section>

    <section aria-labelledby="detail-timeline">
      <h3 id="detail-timeline">Status history</h3>
      <ol class="detail__timeline">
        <li v-for="(event, index) in payout.timeline" :key="index">
          <span class="detail__when num muted">{{ formatDateTime(event.at) }}</span>
          <span>
            <DsStatusBadge :status="event.status" />
            <span v-if="event.note" class="detail__note">{{ event.note }}</span>
          </span>
        </li>
      </ol>
    </section>

    <section aria-labelledby="detail-ids">
      <h3 id="detail-ids">Identifiers</h3>
      <dl class="kv">
        <dt>Idempotency key</dt>
        <dd class="detail__id">
          <span class="mono">{{ payout.idempotencyKey }}</span>
          <DsCopyButton :value="payout.idempotencyKey" label="Copy idempotency key" />
        </dd>
        <dt>Correlation ID</dt>
        <dd class="detail__id">
          <span class="mono">{{ payout.correlationId }}</span>
          <DsCopyButton :value="payout.correlationId" label="Copy correlation ID" />
        </dd>
        <dt>{{ payout.target.currency === 'USDC' ? 'Transaction hash' : 'Bank trace' }}</dt>
        <dd v-if="payout.externalReference && ['sent', 'completed', 'returned'].includes(payout.status)" class="detail__id">
          <span class="mono">{{ payout.externalReference }}</span>
          <DsCopyButton :value="payout.externalReference" label="Copy external reference" />
        </dd>
        <dd v-else class="muted">None yet</dd>
      </dl>
    </section>
  </div>
</template>

<style lang="scss">
.detail {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  font-size: var(--font-size-sm);

  section {
    display: grid;
    gap: var(--space-2);
  }

  h3 {
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-divider);
    font-size: var(--font-size-sm);
  }

  &__status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  &__id {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;

    .mono {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  &__timeline {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: var(--space-2);
      align-items: start;
    }
  }

  &__note {
    display: block;
    margin-top: 2px;
    color: var(--color-muted);
  }
}
</style>
