/** Moves focus to an element and brings it into view. Safari focuses without scrolling in some layouts. */
export function focusInView(element: HTMLElement | null | undefined): void {
  element?.focus()
  element?.scrollIntoView({ block: 'nearest' })
}
