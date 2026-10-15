# Quadrava – brand assets

**Quadrava** is the platform; **Quadrava Studio** is its visual editor. The name comes from *quadro* and *inquadrare*: composing a screen and framing the view precisely.

## The symbol

A viewfinder frames a composed screen:

- three corner marks delimit the view (the precision of the framing);
- inside, blocks laid out like a page (a header, a column and an accent block) stand for the composition;
- the fourth corner is replaced by a diagonal stroke in cyan: the tail of the **Q**, and a lens that looks closely.

The same symbol is used by both products: Quadrava on blue, Quadrava Studio on indigo.

## Colours
| Token | Hex | Use |
|---|---|---|
| blue | #1F4FD8 | Quadrava icon background, the logotype's "Q" on light |
| indigo | #4338CA | Quadrava Studio icon background, "Studio" on light |
| cyan | #38C6F4 | accent block and tail of the symbol, "Q" on dark |
| navy | #0B1630 | text on light, dark background |
| lavender | #B9B3FF | "Studio" on dark |

## Typography
Logotype: **Sora** (Google Fonts, OFL) 600, "Studio" in 400; the "Q" takes the accent colour. The SVG logos use `<text>`: load Sora in the app (for example `@fontsource/sora`) or convert the text to paths before external use.

## Files
- `svg/quadrava-icon.svg`, `svg/quadrava-studio-icon.svg` – main icons (≥ 48 px)
- `svg/quadrava-icon-small.svg`, `svg/quadrava-studio-icon-small.svg` – bolder versions for ≤ 32 px (favicon, tab, toolbar)
- `svg/quadrava-mark.svg` – symbol only, without background (meant for blue or dark backgrounds)
- `svg/quadrava-logo(-dark).svg`, `svg/quadrava-studio-logo(-dark).svg` – full logo for light/dark backgrounds
- `png/<product>-icon-<size>.png` – 16, 24, 32, 48, 64, 76, 128, 180, 192, 256, 512, 1024 px (the small SVG below 48 px)
- `png/quadrava-logo(-dark).png`, `png/quadrava-studio-logo(-dark).png` – full logo as PNG (4x, transparent background) with Sora embedded, for places where SVG cannot load the typeface (README on GitHub, documents)

Every PNG is rendered from the SVGs: `cd frontend && node tools/brand-png.mjs` (add `--only <name>` for a single file).

## Recommended use
- Favicon: `quadrava-icon-small.svg` + fallback `quadrava-icon-32.png`
- Apple touch icon: `quadrava-icon-180.png`; PWA manifest: 192 and 512
- Platform header: `quadrava-logo.svg`; editor header: `quadrava-studio-logo.svg`
- Do not recolour or distort; clear space around the logo ≥ 1/4 of the icon height.
