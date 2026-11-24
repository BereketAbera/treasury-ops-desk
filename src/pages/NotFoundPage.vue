<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="page">
    <h1 id="page-title" tabindex="-1">Page not found</h1>
    <p class="page__lead">
      There is no page at <span class="mono">{{ route.path }}</span
      >. The address may be mistyped, or the page may have moved.
    </p>
    <ul>
      <li><RouterLink to="/">Instructions</RouterLink></li>
      <li><RouterLink to="/payouts/new">New payout</RouterLink></li>
      <li><RouterLink to="/batches/new">Batches</RouterLink></li>
      <li><RouterLink to="/how-it-works">How it works</RouterLink></li>
    </ul>
  </div>
</template>
