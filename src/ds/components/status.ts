import type { IconName } from './icons'

// One place decides how a status looks. A badge is always a tint, an icon and
// a text label together, so colour is never the only signal.

export type Tone = 'neutral' | 'warning' | 'info' | 'success' | 'danger' | 'unknown'

export type StatusName =
  | 'draft'
  | 'cancelled'
  | 'awaiting_approval'
  | 'quote_expiring'
  | 'partially_completed'
  | 'awaiting_confirmation'
  | 'processing'
  | 'sent'
  | 'completed'
  | 'booked'
  | 'failed'
  | 'rejected'
  | 'returned'
  | 'outcome_unknown'

export interface StatusLook {
  tone: Tone
  icon: IconName
  label: string
}

export const STATUS_LOOK: Record<StatusName, StatusLook> = {
  draft: { tone: 'neutral', icon: 'dash-circle', label: 'Draft' },
  cancelled: { tone: 'neutral', icon: 'slash-circle', label: 'Cancelled' },
  awaiting_approval: { tone: 'warning', icon: 'pause-circle', label: 'Awaiting approval' },
  quote_expiring: { tone: 'warning', icon: 'clock', label: 'Rate expiring' },
  partially_completed: { tone: 'warning', icon: 'alert-triangle', label: 'Partially booked' },
  awaiting_confirmation: { tone: 'info', icon: 'clock', label: 'Awaiting confirmation' },
  processing: { tone: 'info', icon: 'progress', label: 'Processing' },
  sent: { tone: 'info', icon: 'arrow-right-circle', label: 'Sent' },
  completed: { tone: 'success', icon: 'check-circle', label: 'Completed' },
  booked: { tone: 'success', icon: 'check-circle', label: 'Booked' },
  failed: { tone: 'danger', icon: 'x-circle', label: 'Failed' },
  rejected: { tone: 'danger', icon: 'slash-circle', label: 'Rejected' },
  returned: { tone: 'danger', icon: 'return', label: 'Returned' },
  outcome_unknown: { tone: 'unknown', icon: 'question-circle', label: 'Outcome unknown' },
}

export const STATUS_NAMES = Object.keys(STATUS_LOOK) as StatusName[]

export function statusLabel(status: StatusName): string {
  return STATUS_LOOK[status].label
}
