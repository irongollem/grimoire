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

    Art-free (#1179, frame 02): with `plate` off, or with low art on, the plate
    goes and what was printed on it moves into the type: eyebrow, the title the
    card draws itself, a bookmark tab or a foot label for the badge, and the
    overlay controls in the foot. It is one component, not a second card, so a
    list passes the same props and its `#body` reads `artFree` to skip its own
    title. A feat or archetype has no picture ever, so it sets `plate` false.
  -->
  <div
    ref="cardRef"
    :data-art-free="artFree ? 'true' : undefined"
    class="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
    :class="artFree && 'h-full'"
  >
    <!-- Whole-card link, behind the actions. Absent while locked, so an
         over-quota entity cannot be opened by clicking past its overlay. -->
    <RouterLink v-if="!locked && !activates" :to="to" class="absolute inset-0 z-2" @click="rememberOrigin" />
    <!-- A card that opens something other than a route (the player portal's
         spell modal) is a button over the same area, and says so with `activate`. -->
    <button
      v-else-if="!locked"
      type="button"
      class="absolute inset-0 z-2"
      :aria-label="title"
      @click="emit('activate')"
    />

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

    <template v-if="artFree">
      <BookmarkTab
        v-if="tab"
        :text="tab.text"
        :label="tab.label"
        :tone-class="tab.toneClass"
        :ink="tab.ink"
      />
      <div class="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
        <!-- The eyebrow row keeps room for the tab hung from the top edge. -->
        <div class="mb-0.5 flex min-h-6 items-center justify-between gap-2" :class="tab && 'pr-9'">
          <span class="truncate text-eyebrow font-bold text-muted-foreground">{{ eyebrow }}</span>
          <div
            v-if="$slots['actions-start'] || $slots['actions-end']"
            class="relative z-10 flex shrink-0 items-center gap-1"
          >
            <slot name="actions-start" :art-free="artFree" />
            <slot name="actions-end" :art-free="artFree" />
          </div>
        </div>
        <h3 class="flex items-baseline gap-2 font-fell text-heading-xs font-bold text-foreground">
          <span v-if="statusClass" class="size-2 shrink-0 -translate-y-0.5 rotate-45" :class="statusClass" aria-hidden="true" />
          <span class="line-clamp-2">{{ title }}</span>
        </h3>
        <slot name="body" :art-free="artFree" />
        <div class="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div class="min-w-0"><slot name="foot" :art-free="artFree" /></div>
          <div class="flex shrink-0 items-center gap-2">
            <span v-if="badgeText && !tab" class="inline-flex items-center gap-1.5 text-label font-semibold text-foreground">
              <span class="size-2 shrink-0 rotate-45" :class="badgeClass ?? 'bg-muted-foreground'" aria-hidden="true" />
              {{ badgeText }}
            </span>
            <!-- The player's Learn on a spell: it sat over the plate, now it sits in the foot. -->
            <span v-if="$slots['image-overlay']" class="relative z-10 flex items-center"><slot name="image-overlay" :art-free="artFree" /></span>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <!-- A colour bar above the artwork — the monster grid's CR ramp. -->
      <div v-if="accentClass" class="h-1.5 w-full shrink-0" :class="accentClass" />

      <div class="relative h-36 shrink-0 overflow-hidden bg-muted">
        <FocalImage
          :src="imageUrl"
          :alt="title"
          format="landscape"
          :focal-point="focalPoint"
          :placeholder="placeholder"
          record
          class="transition-transform duration-300 group-hover:scale-105"
        />
        <!-- A sibling of the image, not FocalImage's own label: the image scales on hover,
             and a transformed element keeps the chip under the z-2 card link exactly while
             the pointer is over the card, which hides the tooltip that names the model. -->
        <AiImageBadge
          :src="imageUrl"
          :corner="$slots['image-overlay'] ? 'left' : 'right'"
          :class="['z-10', $slots['image-footer'] && 'bottom-9!']"
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

        <!--
          A strip along the bottom of the artwork, over a gradient. The item vault
          puts its name here rather than in `#body`, because an item card carries
          almost no other text — a name in the body would leave the picture
          captionless and the body a single line. It is a slot rather than a prop
          so the entity decides what earns the space; items spend it on a type
          icon plus the name.
        -->
        <!-- Overlays that sit on the artwork itself (the spell Learn button), unlike the footer strip they add no gradient.
             The AI chip (on FocalImage above) moves to the left corner when one is rendered, and lifts over the footer strip. -->
        <slot name="image-overlay" :art-free="artFree" />

        <div
          v-if="$slots['image-footer']"
          class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-2.5 py-2"
        >
          <slot name="image-footer" :art-free="artFree" />
        </div>
      </div>

      <div class="flex flex-1 flex-col gap-1 p-3">
        <slot name="body" :art-free="artFree" />
      </div>
    </template>

    <!-- Corner chips (Edit, Reveal). `z-10` puts them above the card link. -->
    <div v-if="!artFree && $slots['actions-start']" class="absolute top-2 left-2 z-10 flex items-center gap-1.5">
      <slot name="actions-start" :art-free="artFree" />
    </div>
    <div v-if="!artFree && $slots['actions-end']" class="absolute top-2 right-2 z-10 flex items-center gap-1.5">
      <slot name="actions-end" :art-free="artFree" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BookmarkTab from "@/components/common/entity/BookmarkTab.vue";
import { useLowArt } from "@/composables/useLowArt";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";
import { IconLock } from "@/lib/icons";
import { rememberModalOrigin } from "@/lib/modalOrigin";

const { to, imageUrl = null, focalPoint = null, activates = false, plate = true } = defineProps<{
  to: string;
  title: string;
  /** Absent on a card that never has a plate. */
  placeholder?: string;
  /** False: the card is always art-free (a feat, an archetype). */
  plate?: boolean;
  /** Art-free only: names the kind in spaced capitals (species, school, item type). */
  eyebrow?: string | null;
  /** Art-free only: bg class of the alive/dead diamond before the name. */
  statusClass?: string | null;
  /** Art-free only: a short well-known value (CR, level, rarity) hung as a bookmark tab. */
  tab?: { text: string; label?: string; toneClass?: string | null; ink?: "light" | "dark" } | null;
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
  badgeText?: string | null;
  badgeClass?: string;
  /** Optional colour-bar class above the artwork — the monster grid's CR ramp. */
  accentClass?: string;
  /** The card emits `activate` instead of navigating to `to`. */
  activates?: boolean;
}>();

const emit = defineEmits<{ activate: [] }>();

defineSlots<{
  body?: (props: { artFree: boolean }) => unknown;
  foot?: (props: { artFree: boolean }) => unknown;
  "image-overlay"?: (props: { artFree: boolean }) => unknown;
  "image-footer"?: (props: { artFree: boolean }) => unknown;
  "actions-start"?: (props: { artFree: boolean }) => unknown;
  "actions-end"?: (props: { artFree: boolean }) => unknown;
}>();

const { lowArt } = useLowArt();
const artFree = computed(() => !plate || lowArt.value);

const cardRef = ref<HTMLElement | null>(null);

/**
 * Hands the card's rect to whatever `to` opens, so a detail modal can grow out
 * of this card rather than appearing over it.
 *
 * Recorded on every card click, not only the ones that end in a modal: this
 * component has no idea which of its consumers' routes present that way, and an
 * origin nobody collects expires on its own. Destinations that render a page
 * simply never ask.
 */
function rememberOrigin() {
  const el = cardRef.value;
  if (!el) return;
  const { top, left, width, height } = el.getBoundingClientRect();
  rememberModalOrigin(to, { top, left, width, height });
}
</script>
