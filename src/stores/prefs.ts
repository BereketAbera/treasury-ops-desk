import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { TableDensity } from '@/ds'
import { isRecord, readSession, writeSession } from '@/lib/storage'

const STORAGE_KEY = 'qc.prefs.v1'
const DENSITIES: TableDensity[] = ['compact', 'default', 'relaxed']

interface Prefs {
  density: TableDensity
  noteDismissed: boolean
}

export function isDensity(value: unknown): value is TableDensity {
  return DENSITIES.includes(value as TableDensity)
}

function isPrefs(value: unknown): value is Prefs {
  return isRecord(value) && isDensity(value.density) && typeof value.noteDismissed === 'boolean'
}

export const usePrefsStore = defineStore('prefs', () => {
  const saved = readSession<Prefs>(STORAGE_KEY, { density: 'default', noteDismissed: false }, isPrefs)
  const density = ref<TableDensity>(saved.density)
  const noteDismissed = ref(saved.noteDismissed)

  watch([density, noteDismissed], () => {
    writeSession(STORAGE_KEY, { density: density.value, noteDismissed: noteDismissed.value } satisfies Prefs)
  })

  function reset() {
    density.value = 'default'
    noteDismissed.value = false
  }

  return { density, noteDismissed, reset }
})
