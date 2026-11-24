#!/usr/bin/env python3
"""Writes the source SVGs for the Quillmere mark, the favicon, the Storybook brand and the social card.

Standard library only. Run it through build.sh, which also cleans and exports the files with Inkscape.

The mark is three figures lined up on the decimal point: a two-decimal amount, a zero-decimal amount
and a six-decimal amount, the three precisions the payout desk works with. Colours are the product's tokens.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOKENS = json.loads((HERE.parent / "tokens" / "tokens.json").read_text())["color"]
PRIMARY = TOKENS["primary"]
ON_PRIMARY = TOKENS["on-primary"]
INK = TOKENS["ink"]
MUTED = TOKENS["muted"]
CANVAS = TOKENS["canvas"]
SURFACE = TOKENS["surface"]
DIVIDER = TOKENS["divider"]
NEUTRAL_TEXT = TOKENS["neutral-text"]
NEUTRAL_TINT = TOKENS["neutral-tint"]

# A font macOS ships and Inkscape resolves. Text is drawn by Inkscape at export, or turned into paths.
FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"

# The mark on a 32 unit grid. Each row: (integer part start, decimal part end or None).
# Every integer part ends at x=17, the point sits at 18 to 20, on the baseline, every decimal part starts at 21.
ROWS = [(4, 25), (10, None), (13, 28)]
ROW_Y = [6, 14, 22]
ROW_H = 4


def mark(fill, x=0.0, y=0.0, scale=1.0):
    """The mark alone, as rects, placed at x, y and scaled from its 32 unit grid."""
    parts = []
    for (start, end), top in zip(ROWS, ROW_Y):
        parts.append(rect(start, top, 17 - start, ROW_H, fill))
        if end is not None:
            parts.append(rect(18, top + ROW_H - 2, 2, 2, fill))
            parts.append(rect(21, top, end - 21, ROW_H, fill))
    body = "".join(parts)
    return f'<g transform="translate({x} {y}) scale({scale})">{body}</g>'


def rect(x, y, w, h, fill, rx=0.0):
    radius = f' rx="{rx}"' if rx else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}"{radius} fill="{fill}"/>'


def tile(x=0.0, y=0.0, scale=1.0):
    """The mark in white on a primary tile: the favicon and the mark in the rail."""
    inner = rect(0, 0, 32, 32, PRIMARY, rx=6) + mark(ON_PRIMARY, 0, 0, 1)
    return f'<g transform="translate({x} {y}) scale({scale})">{inner}</g>'


def svg(width, height, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">{body}</svg>\n'
    )


def text(x, y, size, fill, content, weight=400, spacing=0):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    return (
        f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" '
        f'fill="{fill}"{extra}>{content}</text>'
    )


def favicon():
    return svg(32, 32, tile())


def storybook_brand():
    body = tile(0, 2, 1) + text(42, 17, 15, INK, "Payout desk", 700) + text(42, 32, 11, MUTED, "Component library")
    return svg(190, 36, body)


def social():
    body = rect(0, 0, 1200, 630, CANVAS)
    body += rect(48, 48, 1104, 534, SURFACE, rx=8)
    body += f'<rect x="48.5" y="48.5" width="1103" height="533" rx="8" fill="none" stroke="{DIVIDER}"/>'
    body += tile(104, 104, 2.25)
    body += text(196, 150, 30, MUTED, "Quillmere Commercial")
    body += text(100, 336, 104, INK, "Payout desk", 700, -2)
    body += text(104, 404, 34, INK, "A sample treasury operations tool for cross-border payouts.")
    body += text(104, 452, 26, MUTED, "Vue 3, TypeScript and a small design system. Every figure is fictional.")
    # The same environment chip the rail shows.
    body += rect(104, 498, 262, 40, NEUTRAL_TINT, rx=20)
    body += text(124, 525, 22, NEUTRAL_TEXT, "Sandbox · mock API", 500)
    return svg(1200, 630, body)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "src"
    out.mkdir(parents=True, exist_ok=True)
    files = {"favicon.svg": favicon(), "storybook-brand.svg": storybook_brand(), "social.svg": social()}
    for name, content in files.items():
        (out / name).write_text(content)
        print(f"wrote {out / name}")


if __name__ == "__main__":
    main()
