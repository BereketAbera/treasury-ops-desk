<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { DsBanner } from '@/ds'

defineEmits<{ dismiss: [] }>()

// Each link is named in the words of the behaviour it shows and opens a form that is ready to submit.
const links = [
  { to: '/payouts/new?prefill=1&simulate=duplicate', label: 'Idempotent submit' },
  { to: '/payouts/new?prefill=1&simulate=timeout-received', label: 'Outcome unknown' },
  { to: '/payouts/new?prefill=1&simulate=fail-503', label: 'Retries with backoff' },
  { to: '/batches/new?sample=1&simulate=partial-batch', label: 'Partial batch failure' },
]
</script>

<template>
  <DsBanner tone="info" dismissible class="note" data-testid="what-this-is" @dismiss="$emit('dismiss')">
    <p>
      <strong>What this is:</strong> a sample payout tool for a fictional company, built with Vue 3, TypeScript and Pinia on
      a small design system. Sample by Bereket A. The API is a mock in your browser.
    </p>
    <ul class="note__links" aria-label="Try a behaviour">
      <li class="note__lead">Every failure is safe to trigger:</li>
      <li v-for="link in links" :key="link.to">
        <RouterLink :to="link.to">{{ link.label }}</RouterLink>
      </li>
      <li><a href="/storybook/">Design system</a></li>
      <li><RouterLink to="/how-it-works">How it works</RouterLink></li>
    </ul>
  </DsBanner>
</template>

<style lang="scss">
@use '../ds/tokens/_tokens.scss' as t;

.note {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;

    a {
      font-weight: var(--font-weight-bold);
    }
  }
}

@media (max-width: t.$breakpoint-phone) {
  .note__links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 var(--space-3);

    a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
  }

  .note__lead {
    grid-column: 1 / -1;
  }
}
</style>
