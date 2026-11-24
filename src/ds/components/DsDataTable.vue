<script setup lang="ts" generic="Row">
import { computed, nextTick, ref, useId, watch } from 'vue'
import DsIcon from './DsIcon.vue'
import { nextSort, type TableColumn, type TableDensity, type TableSort } from './table'

const props = withDefaults(
  defineProps<{
    columns: TableColumn<Row>[]
    /** Rows in display order. The table does not sort: it reports the sort the user asked for. */
    rows: Row[]
    rowKey: (row: Row) => string
    /** Read by screen readers as the name of the table. */
    caption: string
    sort?: TableSort | null
    selectedKey?: string | null
    /** Row height: 24, 32 or 40 pixels. */
    density?: TableDensity
    loading?: boolean
    emptyText?: string
  }>(),
  { sort: null, selectedKey: null, density: 'default', loading: false, emptyText: 'Nothing to show.' },
)

const emit = defineEmits<{
  'update:sort': [sort: TableSort]
  /** A row was opened with a click, Enter or Space. */
  select: [row: Row]
}>()

defineSlots<
  {
    /** Replaces the text of a cell. */
    [name: `cell-${string}`]: (props: { row: Row }) => unknown
  } & {
    /** Shown instead of rows when there are none. */
    empty?: () => unknown
  }
>()

const body = ref<HTMLTableSectionElement | null>(null)
const activeIndex = ref(0)
const skeletonRows = Array.from({ length: 12 }, (_, index) => index)

const rowCount = computed(() => props.rows.length)

// The stacked phone layout has no column headers to click, so the same sort is offered as one select.
const sortSelectId = `table-sort-${useId()}`
const sortChoices = computed(() =>
  props.columns
    .filter((column) => column.sortable)
    .flatMap((column) => [
      { value: `${column.key}:asc`, label: `${column.label}, ascending` },
      { value: `${column.key}:desc`, label: `${column.label}, descending` },
    ]),
)
const sortValue = computed(() => (props.sort ? `${props.sort.key}:${props.sort.direction}` : ''))

function onSortSelect(event: Event) {
  const choice = sortChoices.value.find((item) => item.value === (event.target as HTMLSelectElement).value)
  if (!choice) return
  const [key = '', direction] = choice.value.split(':')
  emit('update:sort', { key, direction: direction === 'asc' ? 'asc' : 'desc' })
}

watch(rowCount, (count) => {
  if (activeIndex.value > count - 1) activeIndex.value = Math.max(0, count - 1)
})

function ariaSort(column: TableColumn<Row>): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.sortable) return undefined
  if (props.sort?.key !== column.key) return 'none'
  return props.sort.direction === 'asc' ? 'ascending' : 'descending'
}

function sortIcon(column: TableColumn<Row>) {
  if (props.sort?.key !== column.key) return 'sort' as const
  return props.sort.direction === 'asc' ? ('chevron-up' as const) : ('chevron-down' as const)
}

async function focusRow(index: number) {
  const clamped = Math.min(Math.max(index, 0), rowCount.value - 1)
  activeIndex.value = clamped
  await nextTick()
  const row = body.value?.querySelectorAll<HTMLTableRowElement>('tr[data-row]')[clamped]
  row?.focus()
}

function onRowKeydown(event: KeyboardEvent, index: number, row: Row) {
  if (event.target !== event.currentTarget) return
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      void focusRow(index + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      void focusRow(index - 1)
      break
    case 'PageDown':
      event.preventDefault()
      void focusRow(index + 10)
      break
    case 'PageUp':
      event.preventDefault()
      void focusRow(index - 10)
      break
    case 'Home':
      event.preventDefault()
      void focusRow(0)
      break
    case 'End':
      event.preventDefault()
      void focusRow(rowCount.value - 1)
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      emit('select', row)
      break
  }
}

defineExpose({ focusRow })
</script>

<template>
  <div class="ds-table" :class="`ds-table--${density}`">
    <div v-if="sortChoices.length > 0" class="ds-table__phone-sort">
      <label :for="sortSelectId">Sort by</label>
      <select :id="sortSelectId" class="ds-select" :value="sortValue" @change="onSortSelect">
        <option v-if="!sortChoices.some((choice) => choice.value === sortValue)" :value="sortValue">
          {{ sortValue === '' ? 'Not sorted' : 'A column not shown here' }}
        </option>
        <option v-for="choice in sortChoices" :key="choice.value" :value="choice.value">{{ choice.label }}</option>
      </select>
    </div>
    <div class="ds-table__scroll" role="region" :aria-label="caption" tabindex="0">
      <table class="ds-table__table" role="table" :aria-busy="loading ? 'true' : 'false'">
        <caption class="ds-visually-hidden">
          {{
            caption
          }}
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            <th
              v-for="column in columns"
              :key="column.key"
              role="columnheader"
              scope="col"
              :aria-sort="ariaSort(column)"
              :class="{ 'ds-table__cell--right': column.align === 'right' }"
            >
              <button
                v-if="column.sortable"
                type="button"
                class="ds-table__sort"
                :class="{ 'ds-table__sort--active': sort?.key === column.key }"
                @click="emit('update:sort', nextSort(sort, column.key))"
              >
                <span>{{ column.label }}</span>
                <DsIcon :name="sortIcon(column)" :size="12" />
              </button>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody v-if="loading" role="rowgroup">
          <tr v-for="index in skeletonRows" :key="index" role="row" class="ds-table__skeleton-row">
            <td v-for="column in columns" :key="column.key" role="cell"><span class="ds-table__skeleton" /></td>
          </tr>
        </tbody>
        <tbody v-else-if="rows.length === 0" role="rowgroup">
          <tr role="row" class="ds-table__empty-row">
            <td role="cell" :colspan="columns.length" class="ds-table__empty">
              <slot name="empty">{{ emptyText }}</slot>
            </td>
          </tr>
        </tbody>
        <tbody v-else ref="body" role="rowgroup">
          <tr
            v-for="(row, index) in rows"
            :key="rowKey(row)"
            role="row"
            data-row
            class="ds-table__row"
            :class="{ 'ds-table__row--selected': rowKey(row) === selectedKey }"
            :aria-current="rowKey(row) === selectedKey ? 'true' : undefined"
            :tabindex="index === activeIndex ? 0 : -1"
            @click="emit('select', row)"
            @focus="activeIndex = index"
            @keydown="onRowKeydown($event, index, row)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              role="cell"
              :data-label="column.label"
              :class="{
                'ds-table__cell--right': column.align === 'right',
                'ds-table__cell--numeric': column.numeric,
                'ds-table__cell--hide-phone': column.hideOnPhone,
              }"
            >
              <slot :name="`cell-${column.key}`" :row="row">{{ column.text ? column.text(row) : '' }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss">
@use '../tokens/_tokens.scss' as t;

.ds-table {
  --ds-row-height: var(--size-row-default);

  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-surface);

  &--compact {
    --ds-row-height: var(--size-row-compact);
  }

  &--relaxed {
    --ds-row-height: var(--size-row-relaxed);
  }

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  // Shown in the stacked phone layout only, where the column headers are not rendered.
  &__phone-sort {
    display: none;
  }

  &__table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: var(--font-size-sm);
  }

  th,
  td {
    height: var(--ds-row-height);
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--color-divider);
    text-align: left;
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    height: 32px;
    background: var(--color-canvas);
    border-bottom: 1px solid var(--color-control-border);
    color: var(--color-ink);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  &__cell--right {
    text-align: right !important;
  }

  &__cell--numeric {
    font-variant-numeric: tabular-nums;
  }

  &__sort {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 24px;
    margin: 0 -6px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;

    .ds-icon {
      color: var(--color-muted);
    }

    &:hover {
      background: var(--color-neutral-tint);
    }

    &--active .ds-icon {
      color: var(--color-primary);
    }
  }

  &__row {
    cursor: pointer;

    &:hover td {
      background: var(--color-row-hover);
    }

    &:focus-visible {
      outline: none;

      td {
        background: var(--color-row-hover);
        box-shadow:
          inset 0 2px 0 var(--color-primary),
          inset 0 -2px 0 var(--color-primary);
      }

      td:first-child {
        box-shadow:
          inset 2px 0 0 var(--color-primary),
          inset 0 2px 0 var(--color-primary),
          inset 0 -2px 0 var(--color-primary);
      }

      td:last-child {
        box-shadow:
          inset -2px 0 0 var(--color-primary),
          inset 0 2px 0 var(--color-primary),
          inset 0 -2px 0 var(--color-primary);
      }
    }

    &--selected td {
      background: var(--color-row-selected);
    }

    &--selected td:first-child {
      box-shadow: inset 3px 0 0 var(--color-primary);
    }
  }

  &__skeleton {
    display: block;
    width: 70%;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--color-neutral-tint);
  }

  &__empty {
    height: auto !important;
    padding: var(--space-6) var(--space-4) !important;
    color: var(--color-muted);
    text-align: center !important;
    white-space: normal !important;
  }
}

// Phone: each row becomes a card with its labels, and the page scrolls instead of the table.
@media (max-width: t.$breakpoint-phone) {
  .ds-table {
    background: transparent;

    &__scroll {
      overflow: visible;
    }

    &__table,
    tbody,
    tr,
    td {
      display: block;
    }

    // No header row in the card layout: taken out of the tab order and the accessibility tree,
    // not just clipped. Each cell carries its own label, and sorting moves to the select above.
    thead {
      display: none;
    }

    &__phone-sort {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-3);

      label {
        flex: none;
        color: var(--color-muted);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-bold);
      }

      select {
        flex: 1;
        min-width: 0;
      }
    }

    tr {
      margin-bottom: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--color-divider);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }

    td {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      height: auto;
      min-height: 28px;
      padding: 0;
      border: 0;
      white-space: normal;
      text-align: right;
      background: transparent !important;
      box-shadow: none !important;

      &::before {
        content: attr(data-label);
        flex: none;
        color: var(--color-muted);
        font-size: var(--font-size-xs);
        text-align: left;
      }
    }

    &__cell--hide-phone {
      display: none !important;
    }

    &__empty::before {
      content: none !important;
    }

    &__row--selected {
      border-color: var(--color-primary);
      box-shadow: inset 3px 0 0 var(--color-primary);
    }

    &__row:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 1px;
    }
  }
}
</style>
