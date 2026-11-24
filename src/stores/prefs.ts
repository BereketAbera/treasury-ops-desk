import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { TableDensity } from '@/ds'
import { readSession, writeSession } from '@/lib/storage'

const STORAGE_KEY = 'kc.prefs.v1'

interface Prefs {
  density: TableDensity
  noteDismissed: boolean
}

export const usePrefsStore = defineStore('prefs', () => {
  const saved = readSession<Partial<Prefs>>(STORAGE_KEY, {})
  const density = ref<TableDensity>(saved.density ?? 'default')
  const noteDismissed = ref(saved.noteDismissed ?? false)

  watch([density, noteDismissed], () => {
    writeSession(STORAGE_KEY, { density: density.value, noteDismissed: noteDismissed.value } satisfies Prefs)
  })

  function reset() {
    density.value = 'default'
    noteDismissed.value = false
  }

  return { density, noteDismissed, reset }
})
