# KinetiX – brand assets

Chosen direction: **1a Scia** (trail).

## Colours
| Token | Hex | Use |
|---|---|---|
| blue | #1F4FD8 | KinetiX icon background, the logotype's "X" on light |
| indigo | #4338CA | KinetiX Studio icon background, "Studio" on light |
| cyan | #38C6F4 | accent, first stroke of the trail, "X" on dark |
| trail 2/3/4 | #32AEEE / #2C95E8 / #277DE2 | the following blocks of the trail |
| navy | #0B1630 | text on light, dark background |
| lavender | #B9B3FF | "Studio" on dark |

## Typography
Logotype: **Sora** (Google Fonts) 600, "Studio" in 300. The SVG logos use `<text>`: load Sora in the app (e.g. `@fontsource/sora` or Google Fonts) or convert the text to paths before external use.

## Files
- `svg/kinetix-icon.svg`, `svg/kinetix-studio-icon.svg` – main icons (≥ 48 px)
- `svg/*-icon-small.svg` – simplified versions for ≤ 32 px (favicon, tab, toolbar)
- `svg/kinetix-mark.svg` – symbol only, without background (meant for blue/dark backgrounds)
- `svg/kinetix-logo(-dark).svg`, `svg/kinetix-studio-logo(-dark).svg` – full logo for light/dark backgrounds
- `png/<product>-icon-<size>.png` – 16, 24, 32, 48, 64, 76, 128, 180, 192, 256, 512, 1024 px
- `png/kinetix-logo(-dark).png`, `png/kinetix-studio-logo(-dark).png` – full logo as PNG (4x, transparent background) with Sora embedded, for places where SVG cannot load the typeface (README on GitHub, documents). Regenerate them from the SVGs with `cd frontend && node tools/brand-png.mjs`.

## Recommended use
- Favicon: `kinetix-icon-small.svg` + fallback `kinetix-icon-32.png`
- Apple touch icon: `kinetix-icon-180.png`; PWA manifest: 192 and 512
- Platform header: `kinetix-logo.svg`; editor header: `kinetix-studio-logo.svg`
- Do not recolour or distort; clear space around the logo ≥ 1/4 of the icon height.
