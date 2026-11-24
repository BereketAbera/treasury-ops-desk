<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DsBanner } from '@/ds'

defineEmits<{ dismiss: [] }>()

const links = [
  {
    to: '/payouts/new?prefill=1&simulate=duplicate',
    label: 'Idempotent submit',
    what: 'the same request sent twice, one payout made',
  },
  {
    to: '/payouts/new?prefill=1&simulate=timeout-received',
    label: 'Outcome unknown',
    what: 'a timeout, then a status check instead of a blind resend',
  },
  {
    to: '/payouts/new?prefill=1&simulate=fail-503',
    label: 'Retries with backoff',
    what: 'a 503, three counted attempts, one key',
  },
  {
    to: '/batches/new?sample=1&simulate=partial-batch',
    label: 'Partial batch failure',
    what: '9 booked, 2 rejected, 1 unknown',
  },
]
</script>

<template>
  <DsBanner tone="info" title="What this is" dismissible class="note" data-testid="what-this-is" @dismiss="$emit('dismiss')">
    <p>
      A sample internal tool for a treasury operations team that sends cross-border payouts. It is built with Vue 3,
      TypeScript and Pinia on a small design system. Sample by Bereket A. The API is a mock in your browser, so each
      failure below is safe to trigger. Each link opens a ready form: press Submit to see it.
    </p>
    <ul class="note__links">
      <li v-for="link in links" :key="link.to">
        <RouterLink :to="link.to">{{ link.label }}</RouterLink>
        <span class="muted">{{ link.what }}</span>
      </li>
      <li>
        <a href="/storybook/">Design system</a>
        <span class="muted">the components in Storybook</span>
      </li>
      <li>
        <RouterLink to="/how-it-works">How it works</RouterLink>
        <span class="muted">what is real, what is simulated</span>
      </li>
    </ul>
  </DsBanner>
</template>

<style lang="scss">
.note {
  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-5);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1);
    }

    a {
      font-weight: var(--font-weight-bold);
    }
  }
}
</style>
