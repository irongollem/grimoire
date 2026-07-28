<template>
  <!--
    A keyboard hint, not a badge. The two-stop fill, hairline gold border and
    single inset highlight read as a physical key, which is the whole job: a
    plain bordered chip in the corner of a card looks like a count or a status,
    and a DM has no reason to try pressing it.
  -->
  <span
    class="pointer-events-none grid h-4.5 min-w-4.5 place-items-center rounded-[0.1875rem] border border-gold-500/25 bg-linear-to-b from-navy-700 to-navy-800 px-1 font-cinzel text-2xs font-extrabold tabular-nums text-gold-300 shadow-[0_0.0625rem_0_rgba(0,0,0,0.6),inset_0_0.0625rem_0_rgba(240,199,74,0.18)]"
  >
    <slot />
  </span>
</template>
