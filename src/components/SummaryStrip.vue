<script setup lang="ts">
import { computed } from 'vue'
import { DsAmount, DsIcon, STATUS_LOOK, type StatusName } from '@/ds'
import { CURRENCY_CODES, decimalsOf, type CurrencyCode } from '@/lib/currencies'
import type { PayoutRow } from '@/stores/payouts'

const props = defineProps<{
  /** Every instruction, for the counts by status. */
  all: PayoutRow[]
  /** The rows the filters leave, for the totals by currency. */
  shown: PayoutRow[]
  loading: boolean
}>()

interface Group {
  key: string
  label: string
  look: StatusName
  statuses: string[]
}

const GROUPS: Group[] = [
  { key: 'approval', label: 'Awaiting approval', look: 'awaiting_approval', statuses: ['awaiting_approval'] },
  { key: 'progress', label: 'Processing or sent', look: 'processing', statuses: ['processing', 'sent'] },
  { key: 'completed', label: 'Completed', look: 'completed', statuses: ['completed'] },
  { key: 'attention', label: 'Failed, rejected or returned', look: 'failed', statuses: ['failed', 'rejected', 'returned'] },
  { key: 'unknown', label: 'Outcome unknown', look: 'outcome_unknown', statuses: ['outcome_unknown'] },
]

const counts = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    count: props.all.filter((row) => group.statuses.includes(row.status)).length,
    tone: STATUS_LOOK[group.look].tone,
    icon: STATUS_LOOK[group.look].icon,
  })),
)

// Totals are kept per currency. Amounts in different currencies are never added together.
const totals = computed(() => {
  const sums = new Map<CurrencyCode, { minor: bigint; rows: number }>()
  for (const row of props.shown) {
    const current = sums.get(row.target.currency) ?? { minor: 0n, rows: 0 }
    sums.set(row.target.currency, { minor: current.minor + BigInt(row.target.amountMinor), rows: current.rows + 1 })
  }
  return CURRENCY_CODES.filter((code) => sums.has(code)).map((code) => ({
    code,
    minor: (sums.get(code)?.minor ?? 0n).toString(),
    rows: sums.get(code)?.rows ?? 0,
  }))
})
</script>

<template>
  <section class="summary" aria-label="Summary">
    <dl class="summary__counts">
      <div v-for="group in counts" :key="group.key" class="summary__count" :class="`summary__count--${group.tone}`">
        <dt>
          <DsIcon :name="group.icon" :size="14" />
          {{ group.label }}
        </dt>
        <dd class="num">{{ loading ? '...' : group.count }}</dd>
      </div>
    </dl>
    <div class="summary__totals">
      <h2 class="summary__heading">Target totals of the rows shown, per currency</h2>
      <ul v-if="totals.length > 0" class="summary__list">
        <li v-for="total in totals" :key="total.code">
          <DsAmount :minor="total.minor" :currency="total.code" :decimals="decimalsOf(total.code)" />
          <span class="muted summary__rows num">{{ total.rows }}</span>
        </li>
      </ul>
      <p v-else class="muted summary__none">{{ loading ? 'Loading' : 'No rows shown.' }}</p>
    </div>
  </section>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  align-items: stretch;

  &__counts {
    display: flex;
    gap: var(--space-2);
    margin: 0;
  }

  &__count {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 118px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-divider);
    border-top: 3px solid currentColor;
    border-radius: var(--radius-md);
    background: var(--color-surface);

    dt {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
    }

    dd {
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      line-height: 1;
    }

    &--warning {
      color: var(--color-warning-text);
    }

    &--info {
      color: var(--color-info-text);
    }

    &--success {
      color: var(--color-success-text);
    }

    &--danger {
      color: var(--color-danger-text);
    }

    &--unknown {
      color: var(--color-unknown-text);
    }
  }

  &__totals {
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__heading {
    margin-bottom: var(--space-1);
    color: var(--color-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  &__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 2px var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);

    li {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: var(--space-1);
      white-space: nowrap;
    }
  }

  &__rows {
    min-width: 5ch;
    font-size: var(--font-size-xs);
    text-align: left;
  }

  &__rows::before {
    content: '· ';
  }

  &__rows::after {
    content: ' rows';
  }

  &__none {
    font-size: var(--font-size-sm);
  }
}

@media (max-width: t.$breakpoint-desk) {
  .summary {
    grid-template-columns: minmax(0, 1fr);

    &__counts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    &__count {
      min-width: 0;
    }
  }
}
</style>
