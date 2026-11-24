// Built from tokens/tokens.json by scripts/build-tokens.mjs. Edit the JSON, not this file.
export const tokens = {
  "color": {
    "ink": "#16222E",
    "canvas": "#F3F5F7",
    "surface": "#FFFFFF",
    "primary": "#0E5A66",
    "primary-strong": "#0A444D",
    "on-primary": "#FFFFFF",
    "muted": "#52606D",
    "control-border": "#7A8794",
    "divider": "#D9DEE3",
    "row-hover": "#EEF2F4",
    "row-selected": "#E1EEF0",
    "success-text": "#0B5A2B",
    "success-tint": "#E2F3E7",
    "warning-text": "#8A3B00",
    "warning-tint": "#FCEBDD",
    "danger-text": "#9A1B1B",
    "danger-tint": "#FCE6E6",
    "info-text": "#1B4B8F",
    "info-tint": "#E3EDFB",
    "neutral-text": "#3D4955",
    "neutral-tint": "#E8ECF0",
    "unknown-text": "#5A2A93",
    "unknown-tint": "#EFE6FB"
  },
  "space": {
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "24px",
    "6": "32px",
    "7": "48px"
  },
  "font": {
    "family-ui": "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    "family-mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    "size-xs": "12px",
    "size-sm": "13px",
    "size-md": "14px",
    "size-lg": "16px",
    "size-xl": "20px",
    "weight-regular": "400",
    "weight-medium": "500",
    "weight-bold": "600",
    "line-tight": "1.25",
    "line-body": "1.45"
  },
  "radius": {
    "sm": "3px",
    "md": "4px",
    "pill": "999px"
  },
  "size": {
    "row-compact": "24px",
    "row-default": "32px",
    "row-relaxed": "40px",
    "control": "32px",
    "rail": "200px",
    "panel": "380px"
  },
  "motion": {
    "fast": "120ms",
    "base": "180ms",
    "ease": "cubic-bezier(0.2, 0, 0.2, 1)"
  },
  "shadow": {
    "overlay": "0 8px 28px rgba(22, 34, 46, 0.22)"
  },
  "breakpoint": {
    "phone": "720px",
    "desk": "1100px"
  }
} as const

export type TokenGroup = keyof typeof tokens
