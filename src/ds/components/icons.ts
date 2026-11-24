// Line icons drawn on a 16 by 16 grid. Each icon is a list of path data strings.

const CIRCLE = 'M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5z'

export const ICONS = {
  'check-circle': [CIRCLE, 'M5.2 8.2l1.9 1.9 3.7-3.9'],
  'x-circle': [CIRCLE, 'M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4'],
  'slash-circle': [CIRCLE, 'M3.7 12.3l8.6-8.6'],
  'question-circle': [CIRCLE, 'M6.3 6.4a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3', 'M8 11.5v.1'],
  'dash-circle': [CIRCLE, 'M5.2 8h5.6'],
  clock: [CIRCLE, 'M8 4.6V8l2.2 1.4'],
  'arrow-right-circle': [CIRCLE, 'M5 8h6M8.6 5.6L11 8l-2.4 2.4'],
  'pause-circle': [CIRCLE, 'M6.5 5.8v4.4M9.5 5.8v4.4'],
  'alert-triangle': ['M8 2.2l6.3 11.1H1.7z', 'M8 6.5v3.1', 'M8 11.6v.1'],
  return: ['M6 3.6L2.8 6.8 6 10', 'M3 6.8h6.4a3.3 3.3 0 0 1 0 6.6H7.6'],
  progress: ['M8 1.75a6.25 6.25 0 1 1-6.25 6.25', 'M8 5v3h3'],
  info: [CIRCLE, 'M8 7.3v3.6', 'M8 5v.1'],
  copy: [
    'M6.7 5.5h5.6a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H6.7a1.2 1.2 0 0 1-1.2-1.2V6.7a1.2 1.2 0 0 1 1.2-1.2z',
    'M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8',
  ],
  check: ['M3 8.5l3.2 3.2L13 4.8'],
  close: ['M3.5 3.5l9 9M12.5 3.5l-9 9'],
  'chevron-up': ['M3.5 10L8 5.5l4.5 4.5'],
  'chevron-down': ['M3.5 6L8 10.5 12.5 6'],
  'chevron-right': ['M6 3.5L10.5 8 6 12.5'],
  sort: ['M5 6.5l3-3 3 3', 'M5 9.5l3 3 3-3'],
  search: ['M7 2.75a4.25 4.25 0 1 0 0 8.5a4.25 4.25 0 1 0 0-8.5z', 'M10.2 10.2l3.3 3.3'],
  refresh: ['M13.2 8a5.2 5.2 0 1 1-1.6-3.75', 'M13.4 2.6v2.9h-2.9'],
  list: ['M2.5 4h11M2.5 8h11M2.5 12h11'],
  layers: ['M8 2.2l5.8 3L8 8.2 2.2 5.2z', 'M2.2 8.4L8 11.4l5.8-3', 'M2.2 11.4l5.8 3 5.8-3'],
  plus: ['M8 3v10M3 8h10'],
  activity: ['M1.8 8h2.6l1.8-4.6 3.2 9.2 1.9-4.6h2.9'],
  grid: ['M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z'],
  sliders: [
    'M2.5 5h5.5M12 5h1.5M2.5 11h1.5M8 11h5.5',
    'M10 3.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z',
    'M6 9.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z',
  ],
  external: ['M9.5 2.5h4v4', 'M13.5 2.5l-6 6', 'M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3'],
  book: ['M3 2.8h8.2a1.8 1.8 0 0 1 1.8 1.8v8.6H4.8A1.8 1.8 0 0 1 3 11.4z', 'M3 11.4a1.8 1.8 0 0 1 1.8-1.8H13'],
  upload: ['M8 10.5V2.8', 'M4.8 5.8L8 2.6l3.2 3.2', 'M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2'],
  menu: ['M2.5 4h11M2.5 8h11M2.5 12h11'],
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]
