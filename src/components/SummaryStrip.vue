<script setup lang="ts">
import { computed } from 'vue'
import { DsAmount, DsIcon, STATUS_LOOK, type StatusName } from '@/ds'
import { CURRENCY_CODES, decimalsOf, type CurrencyCode } from '@/lib/currencies'
import { plural } from '@/lib/format'
import type { PayoutStatus } from '@/lib/types'
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
  statuses: PayoutStatus[]
}

// Every status is in exactly one group, so the counts add up to the number of instructions.
const GROUPS: Group[] = [
  { key: 'approval', label: 'Awaiting approval', look: 'awaiting_approval', statuses: ['awaiting_approval'] },
  { key: 'progress', label: 'Processing or sent', look: 'processing', statuses: ['processing', 'sent'] },
  { key: 'completed', label: 'Completed', look: 'completed', statuses: ['completed'] },
  { key: 'attention', label: 'Failed, rejected, returned', look: 'failed', statuses: ['failed', 'rejected', 'returned'] },
  { key: 'unknown', label: 'Outcome unknown', look: 'outcome_unknown', statuses: ['outcome_unknown'] },
  { key: 'other', label: 'Draft or cancelled', look: 'draft', statuses: ['draft', 'cancelled'] },
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
    <!-- Totals are one click away, so they cost the table one line and not three. -->
    <details class="summary__totals" data-testid="summary-totals">
      <summary>Totals per currency</summary>
      <p class="summary__heading">Target amounts of the rows shown. Currencies are never added together.</p>
      <ul v-if="totals.length > 0" class="summary__list">
        <li v-for="total in totals" :key="total.code">
          <DsAmount :minor="total.minor" :currency="total.code" :decimals="decimalsOf(total.code)" />
          <span class="muted summary__rows num">{{ plural(total.rows, 'row') }}</span>
        </li>
      </ul>
      <p v-else class="muted summary__none">{{ loading ? 'Loading' : 'No rows shown.' }}</p>
    </details>
  </section>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-4);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
  background: var(--color-surface);

  // The counts wrap together with the totals toggle, as items of the one strip.
  &__counts {
    display: contents;
  }

  &__count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    white-space: nowrap;

    dt {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
    }

    dd {
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-bold);
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

    &--neutral {
      color: var(--color-neutral-text);
    }
  }

  &__totals {
    margin-left: auto;
    min-width: 0;
    font-size: var(--font-size-sm);

    summary {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      color: var(--color-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-bold);
      cursor: pointer;
      border-radius: var(--radius-sm);
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }

      &::after {
        content: '';
        width: 6px;
        height: 6px;
        margin-left: var(--space-2);
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        transform: translateY(-2px) rotate(45deg);
      }
    }

    &[open] {
      flex-basis: 100%;
      margin-left: 0;

      summary::after {
        transform: translateY(1px) rotate(-135deg);
      }
    }
  }

  &__heading {
    margin-top: var(--space-1);
    color: var(--color-muted);
    font-size: var(--font-size-xs);
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-5);
    margin: var(--space-1) 0;
    padding: 0;
    list-style: none;

    li {
      display: inline-flex;
      align-items: baseline;
      gap: var(--space-1);
      white-space: nowrap;
    }
  }

  &__rows {
    font-size: var(--font-size-xs);
  }
}

@media (max-width: t.$breakpoint-phone) {
  .summary {
    padding: var(--space-2) var(--space-3);

    &__totals {
      flex-basis: 100%;
      margin-left: 0;

      summary {
        min-height: 44px;
      }
    }

    &__list {
      display: grid;

      li {
        justify-content: space-between;
      }
    }
  }
}
</style>
