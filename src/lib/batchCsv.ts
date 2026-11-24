import { newUuid } from './ids'
import { isRecord } from './storage'
import type { BatchItemInput } from './types'
import { FIELD_ORDER, validateDraft, type PayoutDraft } from './validation'

export const BATCH_COLUMNS = ['reference', 'beneficiary', 'bank', 'account', 'route', 'amount', 'purpose'] as const
export const BATCH_LIMIT = 1000

export interface BatchRow {
  /** Line number in the uploaded file, counting the header and any blank lines. */
  line: number
  draft: PayoutDraft
  problems: string[]
  /** Present when the row is valid. */
  item: BatchItemInput | null
}

function isBatchItemInput(value: unknown): value is BatchItemInput {
  return (
    isRecord(value) &&
    typeof value.line === 'number' &&
    ['itemKey', 'reference', 'routeId', 'targetAmountMinor'].every((field) => typeof value[field] === 'string') &&
    /^\d+$/.test(String(value.targetAmountMinor)) &&
    (value.purposeCode === null || typeof value.purposeCode === 'string') &&
    isRecord(value.beneficiary) &&
    ['name', 'bank', 'account'].every((field) => typeof (value.beneficiary as Record<string, unknown>)[field] === 'string')
  )
}

/** For rows read back from storage. */
export function isBatchRow(value: unknown): value is BatchRow {
  if (!isRecord(value) || !isRecord(value.draft)) return false
  const draft = value.draft
  return (
    typeof value.line === 'number' &&
    FIELD_ORDER.every((field) => typeof draft[field] === 'string') &&
    Array.isArray(value.problems) &&
    value.problems.every((problem) => typeof problem === 'string') &&
    (value.item === null || isBatchItemInput(value.item))
  )
}

export type BatchParse = { ok: true; rows: BatchRow[] } | { ok: false; problem: string }

/** Splits one CSV line. Handles quoted fields and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      cells.push(cell.trim())
      cell = ''
    } else cell += char
  }
  cells.push(cell.trim())
  return cells
}

export function parseBatchCsv(text: string, makeKey: () => string = newUuid): BatchParse {
  // Blank lines are skipped, but every line keeps the number it has in the file.
  const lines = text
    .split(/\r?\n/)
    .map((content, index) => ({ content, number: index + 1 }))
    .filter((line) => line.content.trim() !== '')
  if (lines.length === 0) return { ok: false, problem: 'The file is empty.' }
  const header = splitCsvLine(lines[0]?.content ?? '').map((cell) => cell.toLowerCase())
  const missing = BATCH_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) {
    return { ok: false, problem: `The first line must name the columns. Missing: ${missing.join(', ')}.` }
  }
  const body = lines.slice(1)
  if (body.length === 0) return { ok: false, problem: 'The file has a header line but no instructions.' }
  if (body.length > BATCH_LIMIT) return { ok: false, problem: `A batch holds at most ${BATCH_LIMIT} instructions.` }

  const position = (column: (typeof BATCH_COLUMNS)[number]) => header.indexOf(column)
  const seen = new Set<string>()
  const rows = body.map((line): BatchRow => {
    const cells = splitCsvLine(line.content)
    const read = (column: (typeof BATCH_COLUMNS)[number]) => cells[position(column)] ?? ''
    const draft: PayoutDraft = {
      reference: read('reference'),
      beneficiaryName: read('beneficiary'),
      bank: read('bank'),
      account: read('account'),
      routeId: read('route'),
      amount: read('amount'),
      purposeCode: read('purpose'),
    }
    const checked = validateDraft(draft)
    const problems = Object.values(checked.errors)
    if (draft.reference !== '' && seen.has(draft.reference)) problems.push('This reference appears earlier in the file.')
    seen.add(draft.reference)
    const valid = problems.length === 0 && checked.route && checked.targetMinor !== undefined
    return {
      line: line.number,
      draft,
      problems,
      item: valid
        ? {
            line: line.number,
            itemKey: makeKey(),
            reference: draft.reference,
            beneficiary: { name: draft.beneficiaryName, bank: draft.bank, account: draft.account },
            routeId: draft.routeId,
            targetAmountMinor: (checked.targetMinor ?? 0n).toString(),
            purposeCode: draft.purposeCode || null,
          }
        : null,
    }
  })
  return { ok: true, rows }
}
