# Design notes

One short pass over a finished demo. Each change below carries identity or information for a treasury operations tool. Nothing was added for decoration.

## 1. A mark for Quillmere Commercial, and an environment chip in the rail

- **What:** the letter in a square is replaced by a mark: three figures lined up on the decimal point, with two, zero and six decimal places. Under the product name the rail now reads "Sandbox · mock API".
- **Where:** `src/App.vue` (rail), `public/favicon.svg`, drawn by `design/make_graphics.py`.
- **Why:** decimal places per currency are the first thing this tool has to get right (NGN 2, UGX 0, USDC 6), so the mark says what the product is about. An operations tool shows its environment on every screen, so nobody mistakes a test system for the live one. Here the chip also tells a visitor at once that no figure on the page is real.

## 2. A matching favicon

- **What:** the same mark as an SVG icon, with a 48 pixel PNG and a 180 pixel touch icon as fallbacks.
- **Where:** `public/favicon.svg`, `public/favicon-48.png`, `public/apple-touch-icon.png`, linked from `index.html`.
- **Why:** a reviewer with twenty tabs open finds this one by its icon, and the tab matches the rail.

## 3. A social preview

- **What:** a 1200 by 630 card with the mark, the company name, "Payout desk", one line that says what it is, and the environment chip. `og:` and `twitter:` tags point at it with absolute addresses.
- **Where:** `public/social.png`, `index.html`, checked in `tests/e2e/platform.spec.ts`.
- **Why:** the address is shared with no covering note. When it is pasted into a chat or a tracker, the preview says what the link is before anyone opens it.

## 4. Storybook in the product's own tokens

- **What:** Storybook's shell uses the product's colours and type from `tokens/tokens.json`, shows the mark and "Payout desk, Component library", has the product's favicon, and ends its tab title with "Payout desk components". Optional text props now show a text box where they showed a "Set string" button: an empty box means "not set". Slots no longer offer a control, because a slot has no value to type. Countdown's label controls now reach the component.
- **Where:** `.storybook/theme.ts`, `.storybook/manager.ts`, `.storybook/preview.ts`, `.storybook/main.ts`, `.storybook/static/`, and the stories under `src/ds/stories/`.
- **Why:** engineers who would consume the library judge it by its documentation. A control that works for every prop, in a shell that looks like the product, shows the library was finished and not only started.

## Copy

Three sentences were tightened and none changed its meaning: two on "How it works" (the polling note, and the list of states axe checks) and one on the "Page not found" page.

## How the graphics are made

`design/make_graphics.py` (Python 3, standard library only) writes the source SVGs into `design/src/` from the colour tokens. `design/build.sh` holds the exact Inkscape commands that clean and export them, and `design/strip_png.py` removes text and time metadata from the PNGs. There is no stock art, no traced image and no downloaded font: the social card's text is set in a system font at export, and the Storybook brand's text is turned into paths.

```sh
sh design/build.sh
```

## Left alone

- Between 721 and about 900 pixels wide the instruction table still scrolls sideways inside its own region. Its five columns need 697 pixels and the region is 471 to 650 pixels wide there, so hiding one more column does not fit it. Fixing it means switching the table to cards before the rest of the page switches to its phone layout, which is more than a few lines.
- Two optional number props in Storybook (Rate `alignPlaces`, TextInput `maxlength`) still show "Set number". They have no default that would be honest to prefill.
