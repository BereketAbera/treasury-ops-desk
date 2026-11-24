import { nextTick } from 'vue'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { armScenarioFromQuery } from './demo'
import BatchesPage from './pages/BatchesPage.vue'
import BatchNewPage from './pages/BatchNewPage.vue'
import BatchResultPage from './pages/BatchResultPage.vue'
import DeskPage from './pages/DeskPage.vue'
import HowItWorksPage from './pages/HowItWorksPage.vue'
import NewPayoutPage from './pages/NewPayoutPage.vue'
import NotFoundPage from './pages/NotFoundPage.vue'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
  }
}

export function createAppRouter(): Router {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'desk', component: DeskPage, meta: { title: 'Payout instructions' } },
      { path: '/payouts/new', name: 'new-payout', component: NewPayoutPage, meta: { title: 'New payout' } },
      { path: '/batches', name: 'batches', component: BatchesPage, meta: { title: 'Batches' } },
      { path: '/batches/new', name: 'new-batch', component: BatchNewPage, meta: { title: 'New batch' } },
      { path: '/batches/:id', name: 'batch', component: BatchResultPage, meta: { title: 'Batch result' } },
      { path: '/how-it-works', name: 'how-it-works', component: HowItWorksPage, meta: { title: 'How it works' } },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { title: 'Page not found' } },
    ],
    scrollBehavior(to, from) {
      return to.path === from.path ? undefined : { top: 0 }
    },
  })

  // A link can arm a scenario: /payouts/new?simulate=fail-503. The parameter is
  // used once and then removed, so a reload does not arm it again.
  router.beforeEach((to) => {
    const wanted = to.query.simulate
    if (wanted === undefined) return true
    armScenarioFromQuery(wanted)
    const query = { ...to.query }
    delete query.simulate
    return { path: to.path, query, hash: to.hash, replace: true }
  })

  router.afterEach((to, from) => {
    document.title = `${to.meta.title} · Payout desk · Quillmere Commercial`
    // Move focus to the new page's heading, so keyboard and screen reader users start at the top.
    // Every page renders one #page-title that stays the same element while the page loads its data.
    if (from.name !== undefined && to.path !== from.path) {
      void nextTick(() => requestAnimationFrame(() => (document.getElementById('page-title') ?? document.getElementById('main'))?.focus()))
    }
  })

  return router
}
