# KinetiX – brand assets

Direzione scelta: **1a Scia**.

## Colori
| Token | Hex | Uso |
|---|---|---|
| blue | #1F4FD8 | sfondo icona KinetiX, "X" del logotipo su chiaro |
| indigo | #4338CA | sfondo icona KinetiX Studio, "Studio" su chiaro |
| cyan | #38C6F4 | accento, primo tratto della scia, "X" su scuro |
| trail 2/3/4 | #32AEEE / #2C95E8 / #277DE2 | blocchi successivi della scia |
| navy | #0B1630 | testo su chiaro, sfondo scuro |
| lavender | #B9B3FF | "Studio" su scuro |

## Tipografia
Logotipo: **Sora** (Google Fonts) 600, "Studio" in 300. I logo SVG usano <text>: caricare Sora nell'app (es. `@fontsource/sora` o Google Fonts) oppure convertire il testo in tracciati prima dell'uso esterno.

## File
- `svg/kinetix-icon.svg`, `svg/kinetix-studio-icon.svg` – icone principali (≥ 48 px)
- `svg/*-icon-small.svg` – versioni semplificate per ≤ 32 px (favicon, tab, toolbar)
- `svg/kinetix-mark.svg` – solo simbolo, senza sfondo (pensato per sfondi blu/scuri)
- `svg/kinetix-logo(-dark).svg`, `svg/kinetix-studio-logo(-dark).svg` – logo completo per sfondi chiari/scuri
- `png/<prodotto>-icon-<size>.png` – 16, 24, 32, 48, 64, 76, 128, 180, 192, 256, 512, 1024 px

## Uso consigliato
- Favicon: `kinetix-icon-small.svg` + fallback `kinetix-icon-32.png`
- Apple touch icon: `kinetix-icon-180.png`; PWA manifest: 192 e 512
- Header piattaforma: `kinetix-logo.svg`; header editor: `kinetix-studio-logo.svg`
- Non ricolorare né deformare; spazio di rispetto attorno al logo ≥ 1/4 dell'altezza dell'icona.
