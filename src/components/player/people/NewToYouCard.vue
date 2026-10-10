<script lang="ts">
import type { NpcRelationship } from "@/types/npc.types";

export type NewToYouKind = "new" | "unmasked";

export interface NewToYouFocal {
  x: number;
  y: number;
}

/** The face shown after the turn. `name: null` means the player has not learned it. */
export interface NewToYouPerson {
  name: string | null;
  what: string | null;
  portraitUrl: string | null;
  focalPoint: NewToYouFocal | null;
  relationship: NpcRelationship;
}

/** The cover an unmasked NPC wore until now. */
export interface NewToYouCover {
  name: string | null;
  portraitUrl: string | null;
  focalPoint: NewToYouFocal | null;
}
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { artUrl } from "@/lib/assets/artUrl";
import { cardTurnStyle, prefersReducedMotion } from "@/lib/motion";
import { npcRelationshipBg } from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { NPC_RELATIONSHIP_LABELS } from "@/types/npc.types";

/**
 * One card of the player People page's "New to you" strip.
 *
 * A freshly shared NPC arrives face down on the generated card back
 * ("Someone new", and where they were met); a disguised NPC whose true self was
 * just revealed waits face up as the cover the party knew. Either way a tap
 * turns it once, and a turned card is a way into the person's page.
 *
 * The panel text sits on the cream of `npc-card-back.webp`, whose colour is
 * fixed by the art in every theme, so it takes a fixed ink (Vellum's
 * foreground, #2b2019) rather than a theme token that could go pale.
 */
const {
  kind,
  person,
  cover = undefined,
  place = null,
  size = "sm",
} = defineProps<{
  kind: NewToYouKind;
  person: NewToYouPerson;
  cover?: NewToYouCover;
  place?: string | null;
  size?: "sm" | "md";
}>();

const emit = defineEmits<{ turned: []; open: [] }>();

/** Through artUrl: production serves /assets art from the CDN and strips it from dist (#877). */
const CARD_BACK = artUrl("/assets/cards/npc-card-back.webp");

const PLACEHOLDER = placeholderUrl("npc");

const turned = ref(false);
const turnStyle = computed(() => cardTurnStyle(turned.value));

const personName = computed(() => person.name ?? "???");
const coverName = computed(() => cover?.name ?? "???");

const relationshipLabel = computed(() => NPC_RELATIONSHIP_LABELS[person.relationship]);

const label = computed(() => {
  if (turned.value) {
    const who = person.name ?? "Unknown person";
    return kind === "unmasked" ? `${who}, unmasked. Open` : `${who}. Open`;
  }
  if (kind === "unmasked") {
    return `${cover?.name ?? "A familiar face"}, unmasked. Turn over`;
  }
  return place ? `Someone new, met at ${place}. Turn over` : "Someone new. Turn over";
});

let announced = false;
function announceTurned() {
  if (announced) return;
  announced = true;
  emit("turned");
}

function onClick() {
  if (turned.value) {
    emit("open");
    return;
  }
  turned.value = true;
  // Reduce-motion zeroes the duration, so no transition ever ends to listen for.
  if (prefersReducedMotion()) announceTurned();
}

function onTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
  if (turned.value) announceTurned();
}
</script>

<template>
  <button
    type="button"
    class="new-to-you-card group relative block aspect-2/3 shrink-0 cursor-pointer rounded-lg text-left perspective-distant focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    :class="size === 'md' ? 'w-40' : 'w-28'"
    :aria-label="label"
    @click="onClick"
  >
    <div
      class="relative h-full w-full transform-3d transition-transform ease-in-out"
      :style="turnStyle"
      @transitionend="onTransitionEnd"
    >
      <!-- Front: the card back, or the cover the party knew. -->
      <div
        class="absolute inset-0 overflow-hidden rounded-lg backface-hidden"
        :aria-hidden="turned ? 'true' : undefined"
      >
        <template v-if="kind === 'new'">
          <img
            :src="CARD_BACK"
            alt=""
            class="absolute inset-0 h-full w-full rounded-lg object-cover shadow-md"
            draggable="false"
          />
          <div class="ntc-panel">
            <span class="ntc-display ntc-title">Someone new</span>
            <span v-if="place" class="ntc-place">{{ place }}</span>
          </div>
        </template>
        <div v-else class="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
          <div class="relative min-h-0 flex-1 overflow-hidden bg-muted">
            <FocalImage
              :src="cover?.portraitUrl ?? null"
              :alt="coverName"
              format="portrait"
              :focal-point="cover?.focalPoint ?? null"
              :placeholder="PLACEHOLDER"
              class="absolute inset-0 h-full w-full object-cover"
            />
            <span class="ntc-unmasked">Unmasked</span>
          </div>
          <div class="ntc-foot">
            <span class="ntc-display ntc-name">{{ coverName }}</span>
          </div>
        </div>
      </div>

      <!-- Back of the 3D layer: the person, once turned. -->
      <div
        class="absolute inset-0 flex flex-col overflow-hidden rounded-lg border border-border bg-card backface-hidden rotate-y-180"
        :aria-hidden="turned ? undefined : 'true'"
      >
        <div class="relative min-h-0 flex-1 overflow-hidden bg-muted">
          <FocalImage
            :src="person.portraitUrl"
            :alt="personName"
            format="portrait"
            :focal-point="person.focalPoint"
            :placeholder="PLACEHOLDER"
            class="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div class="ntc-foot">
          <span class="ntc-display ntc-name">{{ personName }}</span>
          <span v-if="kind === 'unmasked' && cover" class="ntc-sub italic">You knew them as {{ coverName }}</span>
          <span v-else-if="person.what" class="ntc-sub">{{ person.what }}</span>
          <span class="ntc-regard">
            <span class="ntc-diamond" :class="npcRelationshipBg(person.relationship)" aria-hidden="true" />
            {{ relationshipLabel }}
          </span>
        </div>
      </div>
    </div>
  </button>
</template>

<style scoped>
/* The strip's cards size their type from the card, not the viewport: each is a
   size container, and the rem floors keep the small phone card legible. */
.new-to-you-card {
  container-type: inline-size;
}

.ntc-display {
  font-family: "Cinzel", Georgia, serif;
}

/* The blank cream panel of the card back spans x 16.7-83.3%, y 35.9-63.8%
   of the art; the box sits inside it with a margin. */
.ntc-panel {
  position: absolute;
  inset-inline: 20%;
  top: 38.5%;
  height: 23%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25em;
  text-align: center;
  color: #2b2019;
  overflow: hidden;
}

.ntc-title {
  font-size: max(0.6875rem, 9cqw);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.04em;
  text-wrap: balance;
}

.ntc-place {
  font-size: max(0.625rem, 6.5cqw);
  font-style: italic;
  line-height: 1.15;
  text-wrap: balance;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.ntc-foot {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0.5rem 0.5rem;
  border-top: 1px solid var(--border);
}

.ntc-name {
  font-size: max(0.75rem, 8.5cqw);
  font-weight: 700;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ntc-sub {
  font-size: max(0.625rem, 6.5cqw);
  line-height: 1.2;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ntc-regard {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: max(0.625rem, 6.5cqw);
  line-height: 1.2;
  color: var(--foreground);
}

.ntc-diamond {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  flex-shrink: 0;
  rotate: 45deg;
}

/* The oxblood label that says this cover has been seen through. */
.ntc-unmasked {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.125rem;
  background: var(--live-ink, var(--destructive));
  color: #fff;
  font-family: "Cinzel", Georgia, serif;
  font-size: max(0.5625rem, 5.5cqw);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
}
</style>
