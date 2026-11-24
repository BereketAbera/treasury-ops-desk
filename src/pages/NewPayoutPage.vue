<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PayoutRateSection from '@/components/payout/PayoutRateSection.vue'
import PayoutSubmissionStatus from '@/components/payout/PayoutSubmissionStatus.vue'
import { DsBanner, DsButton, DsCopyButton, DsField, DsMoneyInput, DsSelect, DsTextInput, formatMinor } from '@/ds'
import { decimalsOf } from '@/lib/currencies'
import { api } from '@/lib/http'
import { newCorrelationId } from '@/lib/ids'
import { findRoute, PURPOSE_CODES, routeLabel, ROUTES } from '@/lib/routes'
import type { CreatePayoutBody, Quote } from '@/lib/types'
import { emptyDraft, FIELD_ORDER, validateAmount, validateDraft, type DraftField, type PayoutDraft } from '@/lib/validation'
import { useSimulateStore } from '@/stores/simulate'
import { useSubmitsStore } from '@/stores/submits'

const route = useRoute()
const router = useRouter()
const simulate = useSimulateStore()
const submits = useSubmitsStore()

// The submit belongs to the store, not to this page, so leaving the form never loses one. A submit
// with no known outcome is never dropped: a link that asks for a new, prefilled form gets the
// unresolved one instead, with a notice, until its status has been checked.
const wantsPrefill = route.query.prefill === '1'
const submission = submits.payout()
const askedForNewForm = wantsPrefill && submission.unresolved.value
if (wantsPrefill && !askedForNewForm) submission.startNew()
const { quote: savedQuote = null, ...savedFields } = submission.draft() ?? {}

const draft = reactive<PayoutDraft>({ ...emptyDraft(), ...savedFields })
const state = submission.state
const showUnresolvedNotice = computed(() => askedForNewForm && ['unknown', 'checking'].includes(state.value.phase))

const touched = reactive<Partial<Record<DraftField, boolean>>>({})
const attempted = ref(false)
const serverErrors = ref<Partial<Record<DraftField, string>>>({})
const summary = ref<HTMLElement | null>(null)
const statusRegion = ref<{ focus: () => void } | null>(null)

// While a submit is unresolved, the form shows the rate that submit used, after a reload as well.
const quote = ref<Quote | null>(submission.locked.value ? savedQuote : null)
const quoteState = ref<'none' | 'loading' | 'active' | 'expired' | 'failed'>(quote.value ? 'active' : 'none')
const quoteError = ref<{ message: string; correlationId: string } | null>(null)
const rateMissing = ref(false)

const validation = computed(() => validateDraft(draft))
const selectedRoute = computed(() => findRoute(draft.routeId))
const targetDecimals = computed(() => (selectedRoute.value ? decimalsOf(selectedRoute.value.target) : 2))

const errors = computed(() => {
  const shown: Partial<Record<DraftField, string>> = {}
  for (const field of FIELD_ORDER) {
    const message = serverErrors.value[field] ?? validation.value.errors[field]
    if (message && (attempted.value || touched[field] || serverErrors.value[field])) shown[field] = message
  }
  return shown
})

const FIELD_IDS: Record<DraftField, string> = {
  reference: 'payout-reference',
  beneficiaryName: 'payout-beneficiary',
  bank: 'payout-bank',
  routeId: 'payout-route',
  account: 'payout-account',
  amount: 'payout-amount',
  purposeCode: 'payout-purpose',
}

const summaryItems = computed(() => {
  const items = FIELD_ORDER.filter((field) => errors.value[field]).map((field) => ({
    id: FIELD_IDS[field],
    message: errors.value[field] ?? '',
  }))
  if (rateMissing.value && quoteState.value !== 'active') {
    items.push({
      id: 'payout-get-rate',
      message: quoteState.value === 'expired' ? 'The rate expired. Refresh it before you submit.' : 'Get a rate before you submit.',
    })
  }
  return items
})

const routeOptions = ROUTES.map((item) => ({ value: item.id, label: routeLabel(item) }))
const purposeOptions = PURPOSE_CODES.map((item) => ({ value: item.value, label: item.label }))

const amountHint = computed(() => {
  const item = selectedRoute.value
  if (!item) return 'Choose a route first. The route sets the currency and its decimal places.'
  const decimals = decimalsOf(item.target)
  const places = decimals === 0 ? 'Whole numbers only' : `Up to ${decimals} decimal places`
  return `${formatMinor(item.minMinor, decimals)} to ${formatMinor(item.maxMinor, decimals)} ${item.target}. ${places}.`
})

const purposeHint = computed(() => {
  const item = selectedRoute.value
  if (!item) return 'Required for larger amounts.'
  return `Required at ${formatMinor(item.purposeThresholdMinor, decimalsOf(item.target))} ${item.target} or more.`
})

const formLocked = computed(() => submission.locked.value)
const submitBlocked = computed(() => formLocked.value || quoteState.value === 'expired')

function touch(field: DraftField) {
  touched[field] = true
}

function clearServerError(field: DraftField) {
  if (serverErrors.value[field]) {
    const next = { ...serverErrors.value }
    delete next[field]
    serverErrors.value = next
  }
}

// A rate belongs to one route and one amount. Change either and it must be fetched again.
watch(
  () => [draft.routeId, draft.amount],
  () => {
    if (quote.value && validation.value.targetMinor?.toString() === quote.value.target.amountMinor && draft.routeId === quote.value.routeId) return
    quote.value = null
    quoteState.value = 'none'
    quoteError.value = null
  },
)

watch(
  () => ({ ...draft }),
  (next, previous) => {
    for (const field of FIELD_ORDER) if (next[field] !== previous[field]) clearServerError(field)
    saveDraft()
  },
)

function saveDraft() {
  submission.saveDraft({ ...draft, quote: quote.value })
}

async function onPhase() {
  const current = state.value
  if (current.phase === 'final') {
    const mapped: Partial<Record<DraftField, string>> = {}
    for (const field of FIELD_ORDER) if (current.fields[field]) mapped[field] = current.fields[field]
    serverErrors.value = mapped
    if (current.code === 'quote_expired' || current.code === 'quote_mismatch') {
      quote.value = null
      quoteState.value = 'expired'
    }
  }
  if (['accepted', 'retryable', 'final', 'unknown', 'not-received'].includes(current.phase)) {
    await nextTick()
    statusRegion.value?.focus()
  }
}

watch(() => state.value.phase, onPhase)
// The submit ended while another page was open.
if (state.value.phase === 'final') void onPhase()
onBeforeUnmount(() => submits.release(submission))

async function getRate() {
  touch('routeId')
  touch('amount')
  const item = selectedRoute.value
  if (!item) return
  const amount = validateAmount(draft.amount, item)
  if (amount.minor === undefined) return
  quoteState.value = 'loading'
  quoteError.value = null
  const correlationId = newCorrelationId()
  const result = await api.request<Quote>({
    method: 'POST',
    path: '/api/quotes',
    body: { routeId: item.id, targetAmountMinor: amount.minor.toString() },
    correlationId,
  })
  if (result.kind === 'ok') {
    quote.value = result.data
    quoteState.value = 'active'
    rateMissing.value = false
  } else {
    quote.value = null
    quoteState.value = 'failed'
    quoteError.value = {
      message: result.kind === 'error' ? `${result.error.message} (${result.status})` : 'No answer from the API. Try again.',
      correlationId,
    }
  }
}

function onRateExpired() {
  if (quoteState.value === 'active' && !['accepted'].includes(state.value.phase)) quoteState.value = 'expired'
}

function buildBody(): CreatePayoutBody | null {
  const checked = validation.value
  if (!checked.route || checked.targetMinor === undefined || !quote.value) return null
  return {
    reference: draft.reference.trim(),
    beneficiary: { name: draft.beneficiaryName.trim(), bank: draft.bank.trim(), account: draft.account.trim() },
    routeId: checked.route.id,
    targetAmountMinor: checked.targetMinor.toString(),
    quoteId: quote.value.id,
    purposeCode: draft.purposeCode || null,
  }
}

async function onSubmit() {
  // Double clicks and repeated Enter land here: only the first one sends anything.
  if (submission.busy.value || submitBlocked.value) return
  attempted.value = true
  rateMissing.value = quoteState.value !== 'active'
  if (Object.keys(validation.value.errors).length > 0 || rateMissing.value) {
    await nextTick()
    summary.value?.focus()
    return
  }
  const body = buildBody()
  if (!body) return
  saveDraft()
  await submission.submit(body)
}

async function resend() {
  // The rate may have lapsed while the outcome was unknown. The resend needs a live one.
  if (quoteState.value !== 'active' || !quote.value || quote.value.expiresAt <= Date.now()) await getRate()
  const body = buildBody()
  if (!body) return
  saveDraft()
  await submission.retry(body)
}

function focusField(id: string) {
  document.getElementById(id)?.focus()
}

async function startNew() {
  Object.assign(draft, emptyDraft())
  for (const field of FIELD_ORDER) touched[field] = false
  attempted.value = false
  rateMissing.value = false
  serverErrors.value = {}
  quote.value = null
  quoteState.value = 'none'
  await nextTick()
  // After the watcher above has seen the empty fields, so nothing of the old form is kept.
  submission.startNew()
  await nextTick()
  focusField(FIELD_IDS.reference)
}

async function prefill() {
  Object.assign(draft, {
    reference: `INV-${Math.floor(30000 + Math.random() * 60000)}`,
    beneficiaryName: 'Adaeze Okonkwo Supplies',
    bank: 'Quayside Trust Bank',
    routeId: 'USDC-NGN',
    account: '0123456781',
    amount: '2,450,000.00',
    purposeCode: '',
  } satisfies PayoutDraft)
  await nextTick()
  await getRate()
}

onMounted(async () => {
  if (wantsPrefill) {
    const query = { ...route.query }
    delete query.prefill
    await router.replace({ query })
    if (!askedForNewForm) await prefill()
  }
})
</script>

<template>
  <div class="page payout">
    <header>
      <h1 id="page-title" tabindex="-1">New payout</h1>
      <p class="page__lead">
        One payout to one beneficiary. The amount is what the beneficiary receives. The rate is held for a short time and
        must be live when you submit.
      </p>
    </header>

    <DsBanner v-if="!simulate.isNormal" tone="warning" :title="`Simulate is set to: ${simulate.scenario.label}`" data-testid="simulate-banner">
      <p>{{ simulate.scenario.watch }}</p>
    </DsBanner>

    <DsBanner v-if="showUnresolvedNotice" tone="unknown" title="One submit is still unresolved. Check its status first." announce="status" data-testid="unresolved-notice">
      <p>
        A new form was asked for, but the earlier submit below has no known outcome. It is kept here, with its idempotency
        key, until its status is checked. Nothing was discarded and nothing was sent again.
      </p>
    </DsBanner>

    <div class="payout__grid">
      <form class="card payout__form" novalidate aria-label="New payout" @submit.prevent="onSubmit">
        <div
          v-if="summaryItems.length > 0 && attempted"
          ref="summary"
          class="payout__summary"
          role="alert"
          tabindex="-1"
          data-testid="error-summary"
        >
          <h2>{{ summaryItems.length === 1 ? 'There is 1 problem' : `There are ${summaryItems.length} problems` }}</h2>
          <ul>
            <li v-for="item in summaryItems" :key="item.id">
              <a :href="`#${item.id}`" @click.prevent="focusField(item.id)">{{ item.message }}</a>
            </li>
          </ul>
        </div>

        <fieldset class="payout__fields" :disabled="formLocked">
          <legend class="ds-visually-hidden">Payout details</legend>

          <DsField :id="FIELD_IDS.reference" label="Your reference" required hint="Unique per payout. 4 to 20 capital letters, digits or hyphens." :error="errors.reference">
            <template #default="field">
              <DsTextInput v-model="draft.reference" v-bind="field" mono :maxlength="20" placeholder="INV-20418" @blur="touch('reference')" />
            </template>
          </DsField>

          <div class="payout__pair">
            <DsField :id="FIELD_IDS.beneficiaryName" label="Beneficiary name" required :error="errors.beneficiaryName">
              <template #default="field">
                <DsTextInput v-model="draft.beneficiaryName" v-bind="field" :maxlength="70" @blur="touch('beneficiaryName')" />
              </template>
            </DsField>
            <DsField :id="FIELD_IDS.bank" label="Beneficiary bank" required :error="errors.bank">
              <template #default="field">
                <DsTextInput v-model="draft.bank" v-bind="field" :maxlength="70" @blur="touch('bank')" />
              </template>
            </DsField>
          </div>

          <div class="payout__pair">
            <DsField :id="FIELD_IDS.routeId" label="Route" required hint="Source currency to target currency." :error="errors.routeId">
              <template #default="field">
                <DsSelect v-model="draft.routeId" v-bind="field" :options="routeOptions" placeholder="Choose a route" @blur="touch('routeId')" />
              </template>
            </DsField>
            <DsField
              :id="FIELD_IDS.account"
              :label="selectedRoute?.account.label ?? 'Account number'"
              required
              :hint="selectedRoute ? `${selectedRoute.account.hint} Example: ${selectedRoute.account.example}` : 'The format depends on the route.'"
              :error="errors.account"
            >
              <template #default="field">
                <DsTextInput v-model="draft.account" v-bind="field" mono :maxlength="64" @blur="touch('account')" />
              </template>
            </DsField>
          </div>

          <div class="payout__pair">
            <DsField :id="FIELD_IDS.amount" label="Amount the beneficiary receives" required :hint="amountHint" :error="errors.amount">
              <template #default="field">
                <DsMoneyInput
                  v-model:text="draft.amount"
                  v-bind="field"
                  :currency="selectedRoute?.target ?? '---'"
                  :decimals="targetDecimals"
                  :disabled="!selectedRoute"
                  @blur.capture="touch('amount')"
                />
              </template>
            </DsField>
            <DsField :id="FIELD_IDS.purposeCode" label="Purpose code" :required="validation.purposeRequired" :hint="purposeHint" :error="errors.purposeCode">
              <template #default="field">
                <DsSelect v-model="draft.purposeCode" v-bind="field" :options="purposeOptions" placeholder="None" @blur="touch('purposeCode')" />
              </template>
            </DsField>
          </div>
        </fieldset>

        <PayoutRateSection
          :quote="quote"
          :quote-state="quoteState"
          :quote-error="quoteError"
          :locked="formLocked"
          :accepted="state.phase === 'accepted' ? state.result : null"
          @get-rate="getRate"
          @expired="onRateExpired"
        />

        <div class="payout__submit">
          <DsButton type="submit" variant="primary" :disabled="submitBlocked && !submission.busy.value" :loading="submission.busy.value" data-testid="submit-payout">
            Submit payout
          </DsButton>
          <p v-if="quoteState === 'expired'" class="muted">Locked: the rate expired.</p>
          <p v-else-if="state.phase === 'accepted'" class="muted">Locked: this payout was accepted.</p>
          <p v-else-if="state.phase === 'unknown' || state.phase === 'not-received' || state.phase === 'retryable'" class="muted">
            Locked until this submit is resolved.
          </p>
          <p v-else class="muted">Pressing Submit twice sends one request.</p>
        </div>
      </form>

      <aside class="payout__side" aria-label="Submission">
        <PayoutSubmissionStatus
          ref="statusRegion"
          :state="state"
          @retry="submission.retry()"
          @check="submission.checkStatus()"
          @resend="resend"
          @start-new="startNew"
        />

        <div class="card payout__request">
          <h2>This request</h2>
          <dl class="kv">
            <dt>Idempotency key</dt>
            <dd class="payout__cid">
              <span class="mono" data-testid="idempotency-key">{{ submission.idempotencyKey.value }}</span>
              <DsCopyButton :value="submission.idempotencyKey.value" label="Copy idempotency key" />
            </dd>
            <dt>Attempts sent</dt>
            <dd class="num" data-testid="attempts">{{ submission.attempts.value }}</dd>
          </dl>
          <p class="muted">
            The key was made when this form opened. Every attempt to send this payout carries it, and the API returns the
            first accepted result for a repeated key.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.payout {
  max-width: 1180px;

  &__grid {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: var(--space-4);
    align-items: start;
  }

  &__form {
    display: grid;
    gap: var(--space-4);
  }

  &__summary {
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--color-danger-text);
    border-radius: var(--radius-md);
    background: var(--color-danger-tint);

    h2 {
      font-size: var(--font-size-md);
      color: var(--color-danger-text);
    }

    ul {
      margin: var(--space-2) 0 0;
      padding-left: var(--space-4);
    }

    a {
      color: var(--color-danger-text);
      font-weight: var(--font-weight-medium);
    }

    &:focus-visible {
      outline: 2px solid var(--color-danger-text);
      outline-offset: 2px;
    }
  }

  &__fields {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  &__pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    align-items: start;
  }

  &__rate {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    background: var(--color-canvas);

    h2 {
      font-size: var(--font-size-md);
    }
  }

  &__rate-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
  }

  &__rate-note {
    font-size: var(--font-size-sm);

    &--warn {
      color: var(--color-warning-text);
      font-weight: var(--font-weight-medium);
    }
  }

  &__submit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
  }

  &__side {
    display: grid;
    gap: var(--space-4);
  }

  &__request {
    display: grid;
    gap: var(--space-2);
    font-size: var(--font-size-sm);

    .kv {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    dd {
      margin-bottom: var(--space-2);
    }

    .payout__cid {
      flex-wrap: nowrap;
    }

    h2 {
      font-size: var(--font-size-md);
    }
  }

  &__cid {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);

    .mono {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  &__rate-used {
    color: var(--color-neutral-text);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);

    &--accepted {
      color: var(--color-success-text);
    }
  }
}

@media (max-width: t.$breakpoint-desk) {
  .payout__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: t.$breakpoint-phone) {
  .payout__pair {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
