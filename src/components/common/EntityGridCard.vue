<template>
  <!--
    Desktop (≥md) entity card for the list grids — the counterpart to
    `EntityMobileCard`, which has covered the mobile layouts for a while. The
    desktop card had no such component: both NpcList and MonsterList `v-for`ed
    over ~70 lines of card markup inline, so the shell existed twice, byte for
    byte, and any change to it had to be made in both places by hand.

    Split the way the mobile one is not, because the two desktop cards diverge
    where the mobile ones do not: a monster shows a source badge, CR, AC and HP;
    an NPC shows species, occupation, location and a status dot. So the shell,
    the artwork and the corner actions are props here, and the rows that differ
    come in through `#body`. The parent wires data; this owns the box.
  -->
  <div
    class="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
  >
    <!-- Whole-card link, behind the actions. Absent while locked, so an
         over-quota entity cannot be opened by clicking past its overlay. -->
    <RouterLink v-if="!locked" :to="to" class="absolute inset-0 z-2" />

    <div
      v-if="locked"
      class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-background/80 backdrop-blur-sm"
    >
      <IconLock class="h-4 w-4 text-muted-foreground" />
      <p class="text-label font-semibold text-muted-foreground">Locked</p>
      <RouterLink to="/billing" class="text-label text-primary/80 transition-colors hover:text-primary">
        Upgrade to access
      </RouterLink>
    </div>

    <!-- A colour bar above the artwork — the monster grid's CR ramp. -->
    <div v-if="accentClass" class="h-1.5 w-full shrink-0" :class="accentClass" />

    <div class="relative h-36 shrink-0 overflow-hidden bg-muted">
      <FocalImage
        :src="imageUrl"
        :alt="title"
        format="landscape"
        :focal-point="focalPoint"
        :placeholder="placeholder"
        class="transition-transform duration-300 group-hover:scale-105"
      />
      <!--
        The stance/CR pill shares the action chips' treatment — same 1.5rem
        height, same 50% tint, same backdrop blur — because all three sit in the
        same corner strip over the same artwork. It was 0.25rem shorter at 93%
        opacity, which read as three things that had been placed by three
        different people.
      -->
      <span
        v-if="badgeText"
        class="absolute top-2 right-2 flex h-6 items-center rounded px-1.5 text-eyebrow font-bold text-white backdrop-blur-sm"
      >
        <!--
          The tint is a layer at `opacity-50` rather than a `/50` on the colour
          class, so the ramp needs exactly one map: `bg-relationship-hostile`
          and `bg-relationship-hostile/50` are different literals, and Tailwind
          only generates the ones written in source. Opacity on the layer also
          leaves the label at full strength, which `/50` on the element would
          not.
        -->
        <span
          class="absolute inset-0 rounded opacity-50"
          :class="badgeClass ?? 'bg-muted-foreground'"
        />
        <span class="relative">{{ badgeText }}</span>
      </span>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-3">
      <slot name="body" />
    </div>

    <!-- Corner chips (Edit, Reveal). `z-10` puts them above the card link. -->
    <div v-if="$slots['actions-start']" class="absolute top-2 left-2 z-10 flex items-center gap-1.5">
      <slot name="actions-start" />
    </div>
    <div v-if="$slots['actions-end']" class="absolute top-2 right-2 z-10 flex items-center gap-1.5">
      <slot name="actions-end" />
    </div>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
import { IconLock } from "@/lib/icons";

const { imageUrl = null, focalPoint = null } = defineProps<{
  to: string;
  title: string;
  placeholder: string;
  imageUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  /** Over quota — greys the card out and removes its link. */
  locked?: boolean;
  /**
   * Corner badge over the artwork: an NPC's relationship, a monster's CR.
   * `badgeClass` is a background utility from a ramp (#742) — a class rather
   * than a colour value, so the badge follows the theme. The `/50` tint matches
   * the action chips beside it.
   */
  badgeText?: string;
  badgeClass?: string;
  /** Optional colour-bar class above the artwork — the monster grid's CR ramp. */
  accentClass?: string;
}>();

</script>
