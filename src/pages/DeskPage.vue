<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PayoutDetail from '@/components/PayoutDetail.vue'
import SummaryStrip from '@/components/SummaryStrip.vue'
import WhatThisIsNote from '@/components/WhatThisIsNote.vue'
import {
  DsAmount,
  DsBanner,
  DsButton,
  DsDataTable,
  DsDrawer,
  DsIcon,
  DsSegmented,
  DsSelect,
  DsStatusBadge,
  DsTextInput,
  statusLabel,
  type TableColumn,
  type TableDensity,
  type TableSort,
} from '@/ds'
import { CURRENCY_CODES, decimalsOf } from '@/lib/currencies'
import { formatClock, formatDateTime } from '@/lib/format'
import { findRoute, routeLabel, ROUTES } from '@/lib/routes'
import { PAYOUT_STATUSES } from '@/lib/types'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { usePayoutsStore, type PayoutRow } from '@/stores/payouts'
import { usePrefsStore } from '@/stores/prefs'

const route = useRoute()
const router = useRouter()
const store = usePayoutsStore()
const prefs = usePrefsStore()
const isNarrow = useMediaQuery('(max-width: 1100px)')
const table = ref<{ focusRow: (index: number) => Promise<void> } | null>(null)

onMounted(() => store.startPolling())
onBeforeUnmount(() => store.stopPolling())

// Filters, sort and the selected row live in the URL, so a reload or a shared link shows the same view.
const one = (value: unknown) => (typeof value === 'string' ? value : '')
const search = computed(() => one(route.query.q))
const statusFilter = computed(() => one(route.query.status))
const routeFilter = computed(() => one(route.query.route))
const currencyFilter = computed(() => one(route.query.currency))
const selectedId = computed(() => one(route.query.selected) || null)
const sort = computed<TableSort>(() => {
  const [key, direction] = one(route.query.sort).split(':')
  return key ? { key, direction: direction === 'asc' ? 'asc' : 'desc' } : { key: 'created', direction: 'desc' }
})
const hasFilters = computed(() => Boolean(search.value || statusFilter.value || routeFilter.value || currencyFilter.value))

function setQuery(patch: Record<string, string | null>) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (typeof value === 'string' && value !== '') query[key] = value
  }
  void router.replace({ query })
}

const searchModel = computed({ get: () => search.value, set: (value: string) => setQuery({ q: value }) })
const statusModel = computed({ get: () => statusFilter.value, set: (value: string) => setQuery({ status: value }) })
const routeModel = computed({ get: () => routeFilter.value, set: (value: string) => setQuery({ route: value }) })
const currencyModel = computed({ get: () => currencyFilter.value, set: (value: string) => setQuery({ currency: value }) })
const densityModel = computed({ get: () => prefs.density as string, set: (value: string) => (prefs.density = value as TableDensity) })

const statusOptions = PAYOUT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) }))
const routeOptions = ROUTES.map((item) => ({ value: item.id, label: routeLabel(item) }))
const currencyOptions = CURRENCY_CODES.filter((code) => ROUTES.some((item) => item.target === code)).map((code) => ({
  value: code,
  label: code,
}))
const densityOptions = [
  { value: 'compact', label: '24' },
  { value: 'default', label: '32' },
  { value: 'relaxed', label: '40' },
]

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return store.rows.filter((row) => {
    if (statusFilter.value && row.status !== statusFilter.value) return false
    if (routeFilter.value && row.routeId !== routeFilter.value) return false
    if (currencyFilter.value && row.target.currency !== currencyFilter.value) return false
    if (!needle) return true
    return [row.id, row.reference, row.beneficiary.name].some((text) => text.toLowerCase().includes(needle))
  })
})

function compareMoney(a: { currency: string; amountMinor: string }, b: { currency: string; amountMinor: string }): number {
  // Amounts in different currencies cannot be ranked against each other, so group by currency first.
  if (a.currency !== b.currency) return a.currency.localeCompare(b.currency)
  const left = BigInt(a.amountMinor)
  const right = BigInt(b.amountMinor)
  return left === right ? 0 : left < right ? -1 : 1
}

const COMPARATORS: Record<string, (a: PayoutRow, b: PayoutRow) => number> = {
  id: (a, b) => a.id.localeCompare(b.id),
  created: (a, b) => a.createdAt.localeCompare(b.createdAt),
  beneficiary: (a, b) => a.beneficiary.name.localeCompare(b.beneficiary.name),
  route: (a, b) => a.routeId.localeCompare(b.routeId),
  source: (a, b) => compareMoney(a.source, b.source),
  target: (a, b) => compareMoney(a.target, b.target),
  rate: (a, b) => a.routeId.localeCompare(b.routeId) || Number(a.rate) - Number(b.rate),
  status: (a, b) => statusLabel(a.status).localeCompare(statusLabel(b.status)),
  updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
}

const sorted = computed(() => {
  const compare = COMPARATORS[sort.value.key] ?? COMPARATORS.created!
  const factor = sort.value.direction === 'asc' ? 1 : -1
  return [...filtered.value].sort((a, b) => factor * compare(a, b) || b.createdAt.localeCompare(a.createdAt))
})

const selected = computed(() => store.rows.find((row) => row.id === selectedId.value) ?? null)
const panelOpen = computed(() => selected.value !== null && !isNarrow.value)

const ALL_COLUMNS: TableColumn<PayoutRow>[] = [
  { key: 'id', label: 'Reference', sortable: true },
  { key: 'created', label: 'Created', sortable: true, numeric: true, hideOnPhone: true },
  { key: 'beneficiary', label: 'Beneficiary', sortable: true },
  { key: 'route', label: 'Route', sortable: true, hideOnPhone: true },
  { key: 'source', label: 'Source amount', sortable: true, align: 'right', numeric: true, hideOnPhone: true },
  { key: 'target', label: 'Target amount', sortable: true, align: 'right', numeric: true },
  { key: 'rate', label: 'Rate', sortable: true, align: 'right', numeric: true, hideOnPhone: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'updated', label: 'Updated', sortable: true, numeric: true, hideOnPhone: true },
]
// With the detail panel open the table is narrower: the panel already shows these columns.
const columns = computed(() =>
  panelOpen.value ? ALL_COLUMNS.filter((column) => !['route', 'source', 'rate', 'updated'].includes(column.key)) : ALL_COLUMNS,
)

function open(row: PayoutRow) {
  setQuery({ selected: row.id })
}

function closeDetail() {
  const index = sorted.value.findIndex((row) => row.id === selectedId.value)
  setQuery({ selected: null })
  if (index >= 0 && !isNarrow.value) void table.value?.focusRow(index)
}

function clearFilters() {
  setQuery({ q: null, status: null, route: null, currency: null })
}

const syncText = computed(() => (store.lastSyncedAt ? `Last synced ${formatClock(store.lastSyncedAt)}` : 'Not synced yet'))
</script>

<template>
  <div class="desk">
    <div class="desk__head">
      <div>
        <h1 id="page-title" tabindex="-1">Instructions</h1>
        <p class="muted desk__sub">Payouts from the Kestrel Commercial treasury balance, newest first.</p>
      </div>
      <RouterLink to="/payouts/new" class="ds-button ds-button--primary ds-button--md">
        <DsIcon name="plus" />
        <span>New payout</span>
      </RouterLink>
    </div>

    <WhatThisIsNote v-if="!prefs.noteDismissed" @dismiss="prefs.noteDismissed = true" />

    <SummaryStrip :all="store.rows" :shown="sorted" :loading="!store.loaded" />

    <div class="desk__work" :class="{ 'desk__work--split': panelOpen }">
      <section class="desk__list" aria-label="Instruction table">
        <form class="filters" role="search" aria-label="Filter instructions" @submit.prevent>
          <label class="filters__field filters__field--search">
            <span class="filters__label">Search</span>
            <span class="filters__search">
              <DsIcon name="search" :size="14" />
              <DsTextInput v-model="searchModel" type="search" inputmode="search" placeholder="Reference or beneficiary" />
            </span>
          </label>
          <label class="filters__field">
            <span class="filters__label">Status</span>
            <DsSelect v-model="statusModel" :options="statusOptions" placeholder="All statuses" />
          </label>
          <label class="filters__field">
            <span class="filters__label">Route</span>
            <DsSelect v-model="routeModel" :options="routeOptions" placeholder="All routes" />
          </label>
          <label class="filters__field">
            <span class="filters__label">Target currency</span>
            <DsSelect v-model="currencyModel" :options="currencyOptions" placeholder="All currencies" />
          </label>
          <DsButton v-if="hasFilters" variant="ghost" @click="clearFilters">Clear filters</DsButton>
          <div class="filters__density">
            <DsSegmented v-model="densityModel" legend="Row height" :options="densityOptions" />
          </div>
        </form>

        <DsBanner v-if="store.isStale" tone="warning" title="This table may be out of date" announce="status" data-testid="stale-banner">
          <p>
            {{ syncText }}. The sync has failed {{ store.failedSyncs }}
            {{ store.failedSyncs === 1 ? 'time' : 'times' }}<template v-if="store.lastError?.status">
              with status {{ store.lastError.status }}</template
            ><template v-if="store.nextTryInMs">; next try in {{ Math.round(store.nextTryInMs / 1000) }} seconds</template>.
            The rows below are the last ones received.
          </p>
          <p v-if="store.lastError" class="muted">
            Correlation ID <span class="mono">{{ store.lastError.correlationId }}</span>
          </p>
        </DsBanner>

        <DsDataTable
          ref="table"
          class="desk__table"
          caption="Payout instructions"
          :columns="columns"
          :rows="sorted"
          :row-key="(row: PayoutRow) => row.id"
          :sort="sort"
          :selected-key="selectedId"
          :density="prefs.density"
          :loading="!store.loaded && !store.isStale"
          @update:sort="(next: TableSort) => setQuery({ sort: `${next.key}:${next.direction}` })"
          @select="open"
        >
          <template #cell-id="{ row }">
            <button type="button" class="desk__ref mono" tabindex="-1" :aria-label="`Open ${row.id}`">{{ row.id }}</button>
          </template>
          <template #cell-created="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          <template #cell-beneficiary="{ row }">
            <span class="desk__name">{{ row.beneficiary.name }}</span>
          </template>
          <template #cell-route="{ row }">{{ routeLabel(findRoute(row.routeId) ?? { source: row.source.currency, target: row.target.currency }) }}</template>
          <template #cell-source="{ row }">
            <DsAmount :minor="row.source.amountMinor" :currency="row.source.currency" :decimals="decimalsOf(row.source.currency)" />
          </template>
          <template #cell-target="{ row }">
            <DsAmount :minor="row.target.amountMinor" :currency="row.target.currency" :decimals="decimalsOf(row.target.currency)" />
          </template>
          <template #cell-rate="{ row }">{{ row.rate }}</template>
          <template #cell-status="{ row }">
            <DsStatusBadge :status="row.awaitingConfirmation ? 'awaiting_confirmation' : row.status" />
          </template>
          <template #cell-updated="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
          <template #empty>
            <div class="desk__empty">
              <p><strong>No instructions match these filters.</strong></p>
              <p>Change the search or the filters, or clear them to see all {{ store.rows.length }} instructions.</p>
              <DsButton v-if="hasFilters" @click="clearFilters">Clear filters</DsButton>
            </div>
          </template>
        </DsDataTable>

        <div class="desk__foot">
          <span data-testid="row-count">
            <template v-if="store.loaded">Showing {{ sorted.length }} of {{ store.rows.length }} instructions</template>
            <template v-else>Loading instructions</template>
          </span>
          <span class="desk__hint muted">Arrow keys move between rows. Enter opens the detail panel.</span>
          <span class="desk__sync" :class="{ 'desk__sync--stale': store.isStale }" data-testid="sync-state">
            <DsIcon :name="store.isStale ? 'alert-triangle' : 'refresh'" :size="14" />
            <span>{{ syncText }}<template v-if="store.isStale"> · out of date</template></span>
          </span>
        </div>
      </section>

      <aside v-if="selected && panelOpen" class="desk__panel" :aria-label="`Payout ${selected.id}`">
        <header class="desk__panel-head">
          <h2 class="mono">{{ selected.id }}</h2>
          <button type="button" class="ds-icon-button" aria-label="Close detail panel" @click="closeDetail">
            <DsIcon name="close" />
          </button>
        </header>
        <div class="desk__panel-body">
          <PayoutDetail :payout="selected" />
        </div>
      </aside>
    </div>

    <DsDrawer :open="selected !== null && isNarrow" :title="selected ? `Payout ${selected.id}` : 'Payout'" @close="closeDetail">
      <PayoutDetail v-if="selected" :payout="selected" />
    </DsDrawer>
  </div>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.desk {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  min-height: 620px;
  padding: var(--space-3) var(--space-5) var(--space-3);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__sub {
    font-size: var(--font-size-sm);
  }

  &__work {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);

    &--split {
      grid-template-columns: minmax(0, 1fr) var(--size-panel);
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    overflow: hidden;
  }

  &__table {
    flex: 1;
    min-height: 0;
  }

  &__ref {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  &__name {
    display: inline-block;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  &__empty {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    color: var(--color-ink);
  }

  &__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--color-divider);
    font-size: var(--font-size-xs);
  }

  &__hint {
    flex: 1;
  }

  &__sync {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-muted);
    font-variant-numeric: tabular-nums;

    &--stale {
      color: var(--color-warning-text);
      font-weight: var(--font-weight-bold);
    }
  }

  &__panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-divider);

    h2 {
      font-size: var(--font-size-md);
    }
  }

  &__panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-divider);

  &__field {
    display: grid;
    gap: 2px;
    width: 160px;

    &--search {
      width: 240px;
    }
  }

  &__label {
    color: var(--color-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  &__search {
    position: relative;
    display: block;

    .ds-icon {
      position: absolute;
      left: var(--space-2);
      top: 9px;
      color: var(--color-muted);
      pointer-events: none;
    }

    .ds-input {
      padding-left: 28px;
    }
  }

  &__density {
    margin-left: auto;
    display: flex;
    align-items: center;
    height: var(--size-control);
  }
}

.desk .ds-banner {
  flex: none;
}

.desk__list > .ds-banner {
  margin: var(--space-2) var(--space-3);
}

@media (max-width: t.$breakpoint-phone) {
  .desk {
    height: auto;
    min-height: 0;
    padding: var(--space-4);

    &__list {
      border: 0;
      background: transparent;
      overflow: visible;
    }

    &__hint {
      display: none;
    }

    &__foot {
      padding: var(--space-2) 0;
      border-top: 0;
    }

    &__name {
      max-width: none;
      white-space: normal;
    }
  }

  .filters {
    padding: 0 0 var(--space-3);
    border-bottom: 0;

    &__field,
    &__field--search {
      width: 100%;
    }

    &__density {
      display: none;
    }
  }
}
</style>
