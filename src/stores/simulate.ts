import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { findScenario, getScenario, onScenarioChange, setScenario, type ScenarioId } from '@/demo'

/** Reactive view of the mock API's active scenario. */
export const useSimulateStore = defineStore('simulate', () => {
  const current = ref<ScenarioId>(getScenario().id)
  const shotsLeft = ref(getScenario().shotsLeft)

  onScenarioChange((state) => {
    current.value = state.id
    shotsLeft.value = state.shotsLeft
  })

  const scenario = computed(() => findScenario(current.value))
  const isNormal = computed(() => current.value === 'normal')

  function set(id: ScenarioId) {
    setScenario(id)
  }

  return { current, shotsLeft, scenario, isNormal, set }
})
