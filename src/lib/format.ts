const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** "24 Nov, 14:02" */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** "14:02:11" */
export function formatClock(time: number | string): string {
  return clock.format(new Date(time))
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return 'pending'
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
