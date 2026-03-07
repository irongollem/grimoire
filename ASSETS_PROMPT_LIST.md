# Grimoire — Scriptorium Asset Prompt List

Assets needed for the Scriptorium document renderer (OneDnD 2024 PHB style).
Place generated images in `public/assets/scriptorium/`.

Use any AI image tool: Midjourney, DALL-E 3, Stable Diffusion, Adobe Firefly, etc.

---

## Page Frame & Borders

### Full-page border frame

**File:** `public/assets/scriptorium/page-border.png`
**Size:** 2480 × 3508 px (A4 @ 300 dpi), transparent background
**Prompt:**

```prompt
Fantasy RPG page border frame, modern D&D 2024 style, clean gold and teal ink lines, thin double-line rectangle with small diamond corner ornaments, transparent PNG background, top-down flat design, no fill inside
```

### Page corner ornament

**File:** `public/assets/scriptorium/corner-ornament.png`
**Size:** 240 × 240 px, transparent background
**Prompt:**

```prompt
Minimal fantasy corner ornament, thin gold line art, celtic-inspired but clean and modern, transparent PNG, 240x240px, suitable for D&D 2024 book corners
```

---

## Section Dividers

### Standard rule divider

**File:** `public/assets/scriptorium/divider-standard.png`
**Size:** 1200 × 60 px, transparent background
**Prompt:**

```
Modern D&D book section divider, horizontal ornament, thin teal and gold double-line with small centered diamond, transparent PNG, 1200x60px, clean flat design
```

### Chapter opener banner

**File:** `public/assets/scriptorium/banner-chapter.png`
**Size:** 1200 × 200 px, transparent background
**Prompt:**

```
D&D 2024 style chapter header banner, horizontal scroll shape with torn parchment edges, off-white background with subtle texture, teal border, 1200x200px, clean modern fantasy RPG book style
```

---

## Spot Art (optional, for document decoration)

### Dragon silhouette

**File:** `public/assets/scriptorium/spot-dragon.png`
**Size:** 500 × 500 px, transparent background
**Prompt:**

```
Modern D&D digital illustration, red dragon silhouette, clean bold lines, flat watercolor style, teal and crimson palette, transparent background, 500x500px, suitable for PHB spot art
```

### Longsword

**File:** `public/assets/scriptorium/spot-sword.png`
**Size:** 300 × 600 px, transparent background
**Prompt:**

```
Fantasy RPG longsword illustration, clean bold ink lines, flat watercolor shading, silver and gold, transparent background, vertical orientation, 300x600px, modern D&D book illustration style
```

### Potion / vial

**File:** `public/assets/scriptorium/spot-potion.png`
**Size:** 300 × 400 px, transparent background
**Prompt:**

```
Fantasy RPG healing potion vial, red liquid, clean line art with flat watercolor, glass bottle with cork, transparent background, 300x400px, modern D&D 2024 book style
```

---

## Stat Block & Card Elements

### Monster stat block header bar

**File:** `public/assets/scriptorium/statblock-header.png`
**Size:** 800 × 80 px, transparent background
**Prompt:**

```
Fantasy RPG monster name plate, horizontal bar, teal gradient with thin gold border trim, decorative ends, transparent PNG, 800x80px, clean modern D&D style
```

### Spell card frame

**File:** `public/assets/scriptorium/spell-card-frame.png`
**Size:** 750 × 1050 px (poker card ratio), transparent background
**Prompt:**

```
Fantasy RPG spell card border, clean modern TCG design, teal and gold accent, thin ornate frame, transparent PNG, 750x1050px, suitable for D&D spell cards
```

---

## NPC / Monster Cards (MTG-sized, for print)

> See also: future NPC Card Generator feature

### Card frame — ally

**File:** `public/assets/scriptorium/card-frame-ally.png`
**Size:** 750 × 1050 px, transparent background
**Prompt:**

```
Magic the Gathering style card frame, fantasy RPG, gold and teal color scheme for friendly/ally character, clean modern design, transparent PNG, 750x1050px, portrait area at top, text box at bottom
```

### Card frame — enemy

**File:** `public/assets/scriptorium/card-frame-enemy.png`
**Size:** 750 × 1050 px, transparent background
**Prompt:**

```
Magic the Gathering style card frame, fantasy RPG, dark red and black color scheme for villain/enemy character, clean modern design, transparent PNG, 750x1050px, portrait area at top, text box at bottom
```

### Card frame — neutral

**File:** `public/assets/scriptorium/card-frame-neutral.png`
**Size:** 750 × 1050 px, transparent background
**Prompt:**

```
Magic the Gathering style card frame, fantasy RPG, grey and silver color scheme for neutral NPC, clean modern design, transparent PNG, 750x1050px, portrait area at top, text box at bottom
```

---

## Notes

- All images should be saved as PNG with transparent backgrounds where specified
- Recommended AI tools: Midjourney v6+, DALL-E 3, Adobe Firefly, Stable Diffusion XL
- For Midjourney: append `--ar 1:1` (square), `--ar 4:3`, etc. to match the target size ratios
- After generating, optimise PNGs with `pngquant` or similar before committing
