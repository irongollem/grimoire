<template>
  <!--
    A keyboard hint, not a badge. The two-stop fill, hairline gold border and
    single inset highlight read as a physical key, which is the whole job: a
    plain bordered chip in the corner of a card looks like a count or a status,
    and a DM has no reason to try pressing a count.

    Built from semantic tokens rather than the fixed navy palette — themes here
    swap CSS variables rather than toggling a `.dark` class, so a literal
    `from-navy-700` would stay dark on parchment.
  -->
  <span
    class="pointer-events-none grid h-4.5 min-w-4.5 place-items-center rounded-[0.1875rem] border border-gold-500/30 bg-linear-to-b from-secondary to-muted px-1 font-cinzel text-2xs font-extrabold tabular-nums text-foreground shadow-[0_0.0625rem_0_var(--color-border),inset_0_0.0625rem_0_rgba(240,199,74,0.18)]"
  >
    <slot />
  </span>
</template>
