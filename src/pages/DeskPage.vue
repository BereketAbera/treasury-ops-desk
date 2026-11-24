<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
  DsRate,
  DsSegmented,
  DsSelect,
  DsStatusBadge,
  DsTextInput,
  statusLabel,
  type TableColumn,
  type TableDensity,
  type TableSort,
} from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { parseDeskQuery, TARGET_CURRENCIES, type SortKey } from '@/lib/deskQuery'
import { formatClock, formatDateTime, ratePlaces } from '@/lib/format'
import { api } from '@/lib/http'
import { findRoute, routeLabel, ROUTES } from '@/lib/routes'
import { PAYOUT_STATUSES, type Payout } from '@/lib/types'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { usePayoutsStore, type PayoutRow } from '@/stores/payouts'
import { isDensity, usePrefsStore } from '@/stores/prefs'

/** Cards shown at first in the card layout, and added by each "Show more". */
const CARD_PAGE = 15

const route = useRoute()
const router = useRouter()
const store = usePayoutsStore()
const prefs = usePrefsStore()
const isNarrow = useMediaQuery('(max-width: 1100px)')
// The table's own breakpoint (cards, in tokens.json): up to here its columns do not fit, and each row is a card.
const isCards = useMediaQuery('(max-width: 1000px)')
const isMedium = useMediaQuery('(max-width: 1425px)')
const isCompact = useMediaQuery('(max-width: 1200px)')
// Up to here the detail opens in a drawer, because the table does not fit beside a panel.
const isDrawer = useMediaQuery('(max-width: 1250px)')
const isTightSplit = useMediaQuery('(max-width: 1360px)')
const table = ref<{ focusRow: (index: number) => Promise<void> } | null>(null)

// Filters, sort and the selected row live in the URL, so a reload or a shared link shows the same view.
// The URL is outside input: parseDeskQuery checks every value against a list and falls back to the default.
const view = computed(() => parseDeskQuery(route.query))
const search = computed(() => view.value.q)
const statusFilter = computed(() => view.value.status)
const routeFilter = computed(() => view.value.route)
const currencyFilter = computed(() => view.value.currency)
const selectedId = computed(() => view.value.selected)
const sort = computed<TableSort>(() => view.value.sort)
const hasFilters = computed(() => Boolean(search.value || statusFilter.value || routeFilter.value || currencyFilter.value))

function setQuery(patch: Record<string, string | null>) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) {
    if (typeof value === 'string' && value !== '') query[key] = value
  }
  void router.replace({ query })
}

const searchModel = computed({ get: () => search.value, set: (value: string) => setQuery({ q: value }) })
const statusModel = computed({ get: () => statusFilter.value as string, set: (value: string) => setQuery({ status: value }) })
const routeModel = computed({ get: () => routeFilter.value, set: (value: string) => setQuery({ route: value }) })
const currencyModel = computed({ get: () => currencyFilter.value, set: (value: string) => setQuery({ currency: value }) })
const densityModel = computed({
  get: () => prefs.density as string,
  set: (value: string) => {
    if (isDensity(value)) prefs.density = value satisfies TableDensity
  },
})

const statusOptions = PAYOUT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) }))
const routeOptions = ROUTES.map((item) => ({ value: item.id, label: routeLabel(item) }))
const currencyOptions = TARGET_CURRENCIES.map((code) => ({ value: code, label: code }))
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

type Comparator = (a: PayoutRow, b: PayoutRow) => number
const byCreated: Comparator = (a, b) => a.createdAt.localeCompare(b.createdAt)
// A Map, not an object: a sort key from the URL can never reach a prototype property.
const COMPARATORS = new Map<SortKey, Comparator>([
  ['id', (a, b) => a.id.localeCompare(b.id)],
  ['created', byCreated],
  ['beneficiary', (a, b) => a.beneficiary.name.localeCompare(b.beneficiary.name)],
  ['route', (a, b) => a.routeId.localeCompare(b.routeId)],
  ['source', (a, b) => compareMoney(a.source, b.source)],
  ['target', (a, b) => compareMoney(a.target, b.target)],
  ['rate', (a, b) => a.routeId.localeCompare(b.routeId) || Number(a.rate) - Number(b.rate)],
  ['status', (a, b) => statusLabel(a.status).localeCompare(statusLabel(b.status))],
  ['updated', (a, b) => a.updatedAt.localeCompare(b.updatedAt)],
])

const sorted = computed(() => {
  const compare = COMPARATORS.get(sort.value.key as SortKey) ?? byCreated
  const factor = sort.value.direction === 'asc' ? 1 : -1
  return [...filtered.value].sort((a, b) => factor * compare(a, b) || b.createdAt.localeCompare(a.createdAt))
})

// The card layout shows the list a page at a time. The table shows every row and scrolls inside itself.
const cardLimit = ref(CARD_PAGE)
const shown = computed(() => (isCards.value ? sorted.value.slice(0, cardLimit.value) : sorted.value))
const moreCount = computed(() => Math.min(CARD_PAGE, sorted.value.length - shown.value.length))

async function showMore() {
  const firstNew = shown.value.length
  cardLimit.value += CARD_PAGE
  await nextTick()
  void table.value?.focusRow(firstNew)
}

const selected = computed(() => store.rows.find((row) => row.id === selectedId.value) ?? null)
const panelOpen = computed(() => selected.value !== null && !isDrawer.value)

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
// The table shows as many columns as fit without a sideways scroll. The ones left out are in the
// detail panel, which is one click or one Enter away.
const columns = computed(() => {
  const hidden: string[] = []
  if (isMedium.value) hidden.push('source', 'updated')
  if (isCompact.value) hidden.push('route')
  if (panelOpen.value || isNarrow.value) hidden.push('route', 'source', 'rate', 'updated')
  if (panelOpen.value && isTightSplit.value) hidden.push('created')
  return ALL_COLUMNS.filter((column) => !hidden.includes(column.key))
})

function open(row: PayoutRow) {
  setQuery({ selected: row.id })
}

function closeDetail() {
  const index = sorted.value.findIndex((row) => row.id === selectedId.value)
  setQuery({ selected: null })
  if (index >= 0 && !isDrawer.value) void table.value?.focusRow(index)
}

function clearFilters() {
  setQuery({ q: null, status: null, route: null, currency: null })
}

// Escape closes the detail panel and puts focus back on its row. Drawers, dialogs and the Simulate
// panel handle their own Escape, so this stands aside while one of them is open or focused.
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || !panelOpen.value) return
  if (document.querySelector('.ds-overlay')) return
  if (event.target instanceof Element && event.target.closest('.simulate')) return
  closeDetail()
}

onMounted(() => {
  store.startPolling()
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  store.stopPolling()
  document.removeEventListener('keydown', onDocumentKeydown)
})

// A selected ID that is not in the list: ask the API for that one payout. It can be a payout the list
// has not caught up with yet (shown as awaiting confirmation), or an ID that does not exist.
const missingId = ref<string | null>(null)
let lookingUp: string | null = null

async function resolveSelected() {
  const raw = route.query.selected
  if (typeof raw === 'string' && raw !== '' && selectedId.value === null) {
    // Not even shaped like a payout ID.
    missingId.value = raw.slice(0, 24)
    setQuery({ selected: null })
    return
  }
  const id = selectedId.value
  if (!id || !store.loaded || selected.value || lookingUp === id) return
  lookingUp = id
  const result = await api.request<Payout>({ path: `/api/payouts/${encodeURIComponent(id)}` })
  lookingUp = null
  if (selectedId.value !== id) return
  if (result.kind === 'ok') store.addAccepted(result.data)
  else if (result.kind === 'error' && result.status === 404) {
    missingId.value = id
    setQuery({ selected: null })
  }
}

watch([() => route.query.selected, () => store.loaded, () => selected.value === null], () => void resolveSelected(), { immediate: true })
watch(selectedId, (id) => {
  if (id) missingId.value = null
})

// One count line. The card layout shows part of the list, so there it counts the cards on screen.
const countText = computed(() => {
  const total = store.rows.length
  const onScreen = shown.value.length
  return onScreen < sorted.value.length && sorted.value.length < total
    ? `Showing ${onScreen} of ${sorted.value.length} matching instructions, ${total} in all`
    : `Showing ${onScreen} of ${total} instructions`
})

// Screen readers hear the new count when a filter, the search or the sort changes. Polling does not
// write here, so a table that refreshes every few seconds stays quiet.
const announcement = ref('')
let announceTimer: ReturnType<typeof setTimeout> | null = null
const viewKey = computed(() => [search.value, statusFilter.value, routeFilter.value, currencyFilter.value, sort.value.key, sort.value.direction].join('|'))

watch(viewKey, () => {
  cardLimit.value = CARD_PAGE
  if (announceTimer !== null) clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    const column = ALL_COLUMNS.find((item) => item.key === sort.value.key)?.label ?? 'Created'
    const order = sort.value.direction === 'asc' ? 'ascending' : 'descending'
    announcement.value = `${countText.value}, sorted by ${column.toLowerCase()}, ${order}.`
  }, 400)
})
onBeforeUnmount(() => {
  if (announceTimer !== null) clearTimeout(announceTimer)
})

const syncText = computed(() => (store.lastSyncedAt ? `Last synced ${formatClock(store.lastSyncedAt)}` : 'Not synced yet'))
const failureText = computed(() => {
  const times = `${store.failedSyncs} ${store.failedSyncs === 1 ? 'time' : 'times'}`
  const status = store.lastError?.status ? ` with status ${store.lastError.status}` : ''
  const next = store.nextTryInMs ? `; next try in ${Math.round(store.nextTryInMs / 1000)} seconds` : ''
  return `${times}${status}${next}`
})
</script>

<template>
  <div class="desk">
    <div class="desk__head">
      <div class="desk__title">
        <h1 id="page-title" tabindex="-1">Payout instructions</h1>
        <p class="muted desk__sub">From the Quillmere Commercial treasury balance, newest first.</p>
      </div>
      <RouterLink to="/payouts/new" class="ds-button ds-button--primary ds-button--md">
        <DsIcon name="plus" />
        <span>New payout</span>
      </RouterLink>
    </div>

    <WhatThisIsNote v-if="!prefs.noteDismissed" @dismiss="prefs.noteDismissed = true" />

    <DsBanner v-if="missingId" tone="neutral" announce="status" dismissible class="desk__missing" data-testid="selected-missing" @dismiss="missingId = null">
      <p>
        No instruction with the ID <span class="mono">{{ missingId }}</span
        >. The link may be old, or the demo data was reset.
      </p>
    </DsBanner>

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
        </form>

        <DsBanner
          v-if="store.neverLoaded"
          tone="warning"
          title="Could not load instructions yet. Retrying."
          announce="status"
          data-testid="never-loaded-banner"
        >
          <p>The first sync has failed {{ failureText }}. Nothing has arrived yet, so there are no rows to show.</p>
          <p v-if="store.lastError" class="muted">
            Correlation ID <span class="mono">{{ store.lastError.correlationId }}</span>
          </p>
        </DsBanner>
        <DsBanner v-else-if="store.isStale" tone="warning" title="This table may be out of date" announce="status" data-testid="stale-banner">
          <p>
            {{ syncText }}. The sync has failed {{ failureText }}.
            <template v-if="store.rows.length > 0">The rows below are the last ones received.</template>
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
          :rows="shown"
          :row-key="(row: PayoutRow) => row.id"
          :sort="sort"
          :selected-key="selectedId"
          :density="prefs.density"
          :loading="!store.loaded && !store.neverLoaded"
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
          <template #cell-rate="{ row }">
            <DsRate :rate="row.rate" :places="ratePlaces(findRoute(row.routeId)?.rate)" :align-places="4" />
          </template>
          <template #cell-status="{ row }">
            <DsStatusBadge :status="row.awaitingConfirmation ? 'awaiting_confirmation' : row.status" />
          </template>
          <template #cell-updated="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
          <template #empty>
            <div v-if="store.neverLoaded" class="desk__empty" data-testid="never-loaded">
              <p><strong>Could not load instructions yet. Retrying.</strong></p>
              <p>This is not an empty list. No answer has arrived from the API, and the table tries again on its own.</p>
            </div>
            <div v-else class="desk__empty">
              <p><strong>No instructions match these filters.</strong></p>
              <p>Change the search or the filters, or clear them to see all {{ store.rows.length }} instructions.</p>
              <DsButton v-if="hasFilters" @click="clearFilters">Clear filters</DsButton>
            </div>
          </template>
        </DsDataTable>

        <div v-if="isCards && moreCount > 0" class="desk__more">
          <DsButton data-testid="show-more" @click="showMore">Show {{ moreCount }} more</DsButton>
        </div>

        <div class="desk__foot">
          <span data-testid="row-count">
            <template v-if="store.loaded">{{ countText }}</template>
            <template v-else-if="store.neverLoaded">No instructions loaded yet</template>
            <template v-else>Loading instructions</template>
          </span>
          <span v-if="!panelOpen" class="desk__hint muted">Arrow keys move between rows. Enter opens the detail panel. Escape closes it.</span>
          <span v-else class="desk__hint muted">Escape closes the detail panel.</span>
          <div class="desk__density">
            <DsSegmented v-model="densityModel" legend="Row height" :options="densityOptions" />
          </div>
          <span class="desk__sync" :class="{ 'desk__sync--stale': store.isStale }" data-testid="sync-state">
            <DsIcon :name="store.isStale ? 'alert-triangle' : 'refresh'" :size="14" />
            <span>{{ syncText }}<template v-if="store.isStale"> · out of date</template></span>
          </span>
        </div>
        <p class="ds-visually-hidden" role="status" aria-live="polite" data-testid="filter-announcement">{{ announcement }}</p>
      </section>

      <aside v-if="selected && panelOpen" class="desk__panel" :aria-label="`Payout ${selected.id}`">
        <header class="desk__panel-head">
          <h2 class="mono">{{ selected.id }}</h2>
          <button type="button" class="ds-icon-button" aria-label="Close detail panel" @click="closeDetail">
            <DsIcon name="close" />
          </button>
        </header>
        <div class="desk__panel-body">
          <PayoutDetail :key="selected.id" :payout="selected" />
        </div>
      </aside>
    </div>

    <DsDrawer :open="selected !== null && isDrawer" :title="selected ? `Payout ${selected.id}` : 'Payout'" @close="closeDetail">
      <PayoutDetail v-if="selected" :key="selected.id" :payout="selected" />
    </DsDrawer>
  </div>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

// The table gets the screen: everything above it is kept to a line or two, the table takes the rest
// and scrolls inside itself. When the window is too short, the table keeps a minimum height and the
// page scrolls instead, so the rows can never collapse to nothing.
.desk {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-3) var(--space-5) var(--space-3);

  > * {
    flex: none;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-3);
    min-width: 0;
  }

  &__sub {
    font-size: var(--font-size-sm);
  }

  &__missing {
    padding: var(--space-2) var(--space-3);
  }

  &__work {
    flex: 1 0 0;
    min-height: 480px;
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

    > * {
      flex: none;
    }
  }

  &__table {
    flex: 1 1 0;
    min-height: 320px;

    th,
    td {
      padding: 0 var(--space-2);
    }

    th:first-child,
    td:first-child {
      padding-left: var(--space-3);
    }
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
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-divider);
    font-size: var(--font-size-xs);
  }

  &__hint {
    flex: 1;
  }

  &__density {
    display: flex;
    align-items: center;
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
    width: 150px;

    &--search {
      width: 220px;
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
      top: calc(50% - 7px);
      color: var(--color-muted);
      pointer-events: none;
    }

    .ds-input {
      padding-left: 28px;
    }
  }
}

.desk__list > .ds-banner {
  margin: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
}

@media (max-width: t.$breakpoint-desk) {
  .desk__hint {
    display: none;
  }

  .desk__density {
    margin-left: auto;
  }
}

// The card layout: the page scrolls, and the cards sit on it.
@media (max-width: t.$breakpoint-cards) {
  .desk {
    height: auto;

    &__work {
      flex: none;
      min-height: 0;
    }

    &__list {
      border: 0;
      background: transparent;
      overflow: visible;
    }

    &__table {
      flex: none;
      min-height: 0;

      td,
      td:first-child {
        padding: 0;
      }
    }

    &__density {
      display: none;
    }

    &__more {
      display: flex;
      padding: var(--space-1) 0 var(--space-3);
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
  }
}

@media (max-width: t.$breakpoint-phone) {
  .desk {
    padding: var(--space-4);

    &__ref {
      display: inline-flex;
      align-items: center;
      min-width: 44px;
      min-height: 44px;
      justify-content: flex-end;
    }
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    &__field,
    &__field--search {
      width: 100%;
    }

    &__field--search,
    > .ds-button {
      grid-column: 1 / -1;
    }
  }
}
</style>
