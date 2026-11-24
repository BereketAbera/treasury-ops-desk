<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import RequestLogDrawer from './components/RequestLogDrawer.vue'
import SimulateMenu from './components/SimulateMenu.vue'
import { DsButton, DsDialog, DsIcon, type IconName } from './ds'
import { api } from './lib/http'
import { clearSession } from './lib/storage'
import { resetScenario } from './demo'
import { usePayoutsStore } from './stores/payouts'
import { usePrefsStore } from './stores/prefs'
import { useRequestLogStore } from './stores/requestLog'

const route = useRoute()
const router = useRouter()
const requestLog = useRequestLogStore()
const payouts = usePayoutsStore()
const prefs = usePrefsStore()

const navOpen = ref(false)
const resetOpen = ref(false)
const resetting = ref(false)

const links: { to: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { to: '/', label: 'Payout instructions', icon: 'list', match: (path) => path === '/' },
  { to: '/batches', label: 'Batches', icon: 'layers', match: (path) => path.startsWith('/batches') },
  { to: '/payouts/new', label: 'New payout', icon: 'plus', match: (path) => path.startsWith('/payouts') },
]

watch(
  () => route.fullPath,
  () => (navOpen.value = false),
)

function openRequestLog() {
  navOpen.value = false
  requestLog.isOpen = true
}

async function resetDemo() {
  resetting.value = true
  await api.request({ method: 'POST', path: '/api/demo/reset' })
  resetScenario()
  requestLog.clear()
  prefs.reset()
  clearSession('qc.form.')
  payouts.clear()
  resetting.value = false
  resetOpen.value = false
  await router.push({ path: '/', query: {} })
  await payouts.sync()
}
</script>

<template>
  <div class="shell">
    <a class="shell__skip" href="#main">Skip to main content</a>

    <header class="rail">
      <div class="rail__brand">
        <span class="rail__mark" aria-hidden="true">Q</span>
        <span class="rail__names">
          <span class="rail__company">Quillmere Commercial</span>
          <span class="rail__product">Payout desk</span>
        </span>
        <button
          type="button"
          class="rail__toggle"
          :aria-expanded="navOpen ? 'true' : 'false'"
          aria-controls="rail-nav"
          @click="navOpen = !navOpen"
        >
          <DsIcon :name="navOpen ? 'close' : 'menu'" />
          <span>Menu</span>
        </button>
      </div>
      <nav id="rail-nav" class="rail__nav" :class="{ 'rail__nav--open': navOpen }" aria-label="Main">
        <ul>
          <li v-for="link in links" :key="link.to">
            <RouterLink
              :to="link.to"
              class="rail__link"
              :class="{ 'rail__link--current': link.match(route.path) }"
              :aria-current="link.match(route.path) ? 'page' : undefined"
            >
              <DsIcon :name="link.icon" />
              <span>{{ link.label }}</span>
            </RouterLink>
          </li>
          <li>
            <button type="button" class="rail__link" @click="openRequestLog">
              <DsIcon name="activity" />
              <span>Request log</span>
              <span class="rail__count num" aria-hidden="true">{{ requestLog.foregroundCount }}</span>
            </button>
          </li>
          <li>
            <a class="rail__link" href="/storybook/">
              <DsIcon name="grid" />
              <span>Components</span>
              <DsIcon class="rail__external" name="external" :size="12" />
            </a>
          </li>
          <li class="rail__gap">
            <RouterLink
              to="/how-it-works"
              class="rail__link"
              :class="{ 'rail__link--current': route.path === '/how-it-works' }"
              :aria-current="route.path === '/how-it-works' ? 'page' : undefined"
            >
              <DsIcon name="book" />
              <span>How it works</span>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </header>

    <div class="shell__main">
      <div class="topbar">
        <SimulateMenu />
        <DsButton icon="activity" @click="openRequestLog">Request log</DsButton>
        <DsButton variant="ghost" icon="refresh" @click="resetOpen = true">Reset demo data</DsButton>
      </div>
      <main id="main" class="shell__content" tabindex="-1">
        <RouterView />
      </main>
      <footer class="shell__footer">Sample by Bereket A. · fictional data</footer>
    </div>

    <RequestLogDrawer />

    <DsDialog :open="resetOpen" title="Reset demo data?" @close="resetOpen = false">
      <p>
        This restores the 60 seeded instructions and removes the payouts, batches and request log entries made in this
        tab. Nothing leaves your browser.
      </p>
      <template #actions>
        <DsButton data-autofocus @click="resetOpen = false">Keep my changes</DsButton>
        <DsButton variant="primary" :loading="resetting" @click="resetDemo">Reset demo data</DsButton>
      </template>
    </DsDialog>
  </div>
</template>

<style lang="scss">
@use './ds/tokens/_tokens.scss' as t;

.shell {
  display: grid;
  grid-template-columns: var(--size-rail) minmax(0, 1fr);
  height: 100vh;
  height: 100dvh;

  &__skip {
    position: absolute;
    left: var(--space-2);
    top: -60px;
    z-index: 50;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);

    &:focus {
      top: var(--space-2);
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow: auto;

    &:focus {
      outline: none;
    }
  }

  &__footer {
    flex: none;
    padding: var(--space-1) var(--space-5);
    border-top: 1px solid var(--color-divider);
    background: var(--color-surface);
    color: var(--color-muted);
    font-size: var(--font-size-xs);
  }
}

.rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--color-divider);
  background: var(--color-surface);

  &__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-divider);
  }

  &__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-weight: var(--font-weight-bold);
  }

  &__names {
    display: grid;
    min-width: 0;
    line-height: var(--font-line-tight);
  }

  &__company {
    color: var(--color-muted);
    font-size: var(--font-size-xs);
  }

  &__product {
    font-weight: var(--font-weight-bold);
  }

  &__toggle {
    display: none;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
    height: var(--size-control);
    padding: 0 var(--space-3);
    border: 1px solid var(--color-control-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-ink);
    font: inherit;
    cursor: pointer;
  }

  &__nav {
    flex: 1;
    padding: var(--space-2);
    overflow: auto;

    ul {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }

  &__gap {
    margin-top: var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-divider);
  }

  &__link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    height: 32px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;

    &:hover {
      background: var(--color-row-hover);
    }

    &--current {
      background: var(--color-row-selected);
      color: var(--color-primary-strong);
      font-weight: var(--font-weight-bold);
      box-shadow: inset 3px 0 0 var(--color-primary);
    }
  }

  &__count {
    margin-left: auto;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--color-neutral-tint);
    color: var(--color-neutral-text);
    font-size: var(--font-size-xs);
  }

  &__external {
    margin-left: auto;
    color: var(--color-muted);
  }
}

.topbar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-5);
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
}

.boot-message {
  max-width: 60ch;
  margin: 12vh auto;
  padding: var(--space-5);
  display: grid;
  gap: var(--space-3);
}

@media (max-width: t.$breakpoint-phone) {
  .shell {
    display: block;
    height: auto;
    min-height: 100vh;

    &__content {
      overflow: visible;
    }

    &__footer {
      padding: var(--space-3) var(--space-4);
    }
  }

  .rail {
    border-right: 0;
    border-bottom: 1px solid var(--color-divider);

    &__brand {
      border-bottom: 0;
    }

    &__toggle {
      display: inline-flex;
    }

    &__nav {
      display: none;
      border-top: 1px solid var(--color-divider);

      &--open {
        display: block;
      }
    }

    &__link {
      height: 44px;
    }
  }

  .topbar {
    justify-content: flex-start;
    padding: var(--space-2) var(--space-4);
  }
}
</style>
