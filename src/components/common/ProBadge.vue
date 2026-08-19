<!--
  The "PRO" marker on a control a free account cannot use.

  Inline, not a corner overlay. It was written out three times as an identically
  hand-rolled `absolute -top-1.5 -right-1.5 …` span, and the overlay is what made
  it fragile: the badge sat 6px outside its button, so any ancestor with
  `overflow: hidden` sliced it. The soundboard's page rail is exactly that — two
  nested clipping wrappers, there on purpose so a long list of pages can never
  make the whole page scroll sideways — and the badge on "Add Page" lost its top
  and right edges to them.

  A badge cannot be reliably placed outside a box it does not control, and it
  does not need to be: inside the control it is just as legible, and it can never
  be clipped by anything the control itself is not already clipped by.
-->
<template>
  <span class="shrink-0 rounded bg-amber-500 px-1 font-cinzel text-2xs leading-4 text-black">
    PRO
  </span>
</template>
