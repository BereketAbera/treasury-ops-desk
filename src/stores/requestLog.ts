import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RequestLogEntry } from '@/lib/api'
import { readSession, writeSession } from '@/lib/storage'

const STORAGE_KEY = 'kc.requestlog.v1'
const LIMIT = 120

export const useRequestLogStore = defineStore('requestLog', () => {
  const entries = ref<RequestLogEntry[]>(readSession<RequestLogEntry[]>(STORAGE_KEY, []))
  const isOpen = ref(false)
  const showBackground = ref(false)

  function persist() {
    writeSession(STORAGE_KEY, entries.value)
  }

  function onStart(entry: RequestLogEntry) {
    entries.value = [entry, ...entries.value].slice(0, LIMIT)
  }

  function onFinish(entry: RequestLogEntry) {
    const index = entries.value.findIndex((item) => item.id === entry.id && item.startedAt === entry.startedAt)
    if (index === -1) entries.value = [entry, ...entries.value].slice(0, LIMIT)
    else entries.value.splice(index, 1, entry)
    persist()
  }

  function clear() {
    entries.value = []
    persist()
  }

  const visible = computed(() => (showBackground.value ? entries.value : entries.value.filter((entry) => !entry.background)))
  const foregroundCount = computed(() => entries.value.filter((entry) => !entry.background).length)

  return { entries, visible, foregroundCount, isOpen, showBackground, onStart, onFinish, clear }
})
