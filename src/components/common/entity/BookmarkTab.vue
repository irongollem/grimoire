<template>
  <!--
    A bookmark tab carrying a short, well-known value: a monster's CR, a spell's
    level, an item's rarity (C U R VR L A), a god's alignment (LG … CE). Low art
    (#1179, frame 02) hangs it from the top edge of the catalogue card, the
    phone card and the sheet, the way the portrait card already hangs a ramp
    ribbon there in Vellum, so a list is scanned by its tabs like a book's.
    In a ledger row it stands inline (`inline`).

    The colour is a background utility from a ramp (`crBg`, `SCHOOL_BG`,
    `RARITY_BG`), a class rather than a value so it follows the theme. `ink`
    picks the lettering: light on the deep ramps, dark on the pale rarity tints.
    A value with no colour of its own (alignment) takes the ink tone.
  -->
  <span
    class="flex shrink-0 justify-center font-bold leading-none [clip-path:polygon(0_0,100%_0,100%_100%,50%_80%,0_100%)]"
    :class="[
      SIZE[size],
      inline ? 'relative' : 'absolute top-0.5 z-1',
      !inline && (size === 'sm' ? 'right-2' : 'right-3.5'),
      toneClass ?? 'bg-foreground/80',
      ink === 'dark' ? 'text-black/80' : toneClass ? 'text-white' : 'text-background',
    ]"
    :aria-label="label ? `${label} ${text}` : undefined"
  >{{ text }}</span>
</template>

<script setup lang="ts">
const { size = "md", inline = false, ink = "light", toneClass = null, label = null } = defineProps<{
  /** The value itself, already short: "5", "1/8", "3", "VR", "NG". */
  text: string;
  /** Spoken before the value ("Challenge rating"), since the tab shows no label. */
  label?: string | null;
  /** Ramp background class. Absent = the ink tone (alignment). */
  toneClass?: string | null;
  /** Lettering: light on deep ramps, dark on pale tints. */
  ink?: "light" | "dark";
  /** md on a desktop card or sheet, sm on a phone card or a ledger line. */
  size?: "sm" | "md";
  /** In the flow (a ledger cell) rather than hung from the parent's top edge. */
  inline?: boolean;
}>();

// rem, not px: the tab scales with the text it carries.
const SIZE = {
  md: "h-10 w-7.5 pt-1.5 text-label",
  sm: "h-8 w-6.5 pt-1 text-eyebrow",
} as const;
</script>
