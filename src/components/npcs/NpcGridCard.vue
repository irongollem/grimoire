<template>
  <!--
    One NPC in the desktop grid. Was ~70 lines inline in `NpcList`'s `v-for`,
    which is why the card's design and the list's filtering/paging logic were
    the same file's problem.
  -->
  <EntityGridCard
    :to="`/npcs/${npc.id}`"
    :title="displayName"
    :image-url="getNpcDisplayPortrait(npc)"
    :focal-point="getNpcDisplayFocalPoint(npc)"
    placeholder="/assets/placeholders/npc.webp"
    :locked="locked"
    :badge-text="npc.relationship"
    :badge-class="relClass"
  >
    <template #body>
      <div class="flex items-start justify-between gap-1">
        <h3 class="line-clamp-1 flex-1 font-cinzel text-sm leading-tight font-bold text-foreground">
          {{ displayName }}
        </h3>
        <span
          :title="npc.status"
          class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          :class="statusClass"
        />
      </div>

      <p v-if="npc.race" class="truncate text-caption text-muted-foreground italic">
        {{ npc.race }} - {{ npc.occupation }}
      </p>

      <p v-if="locationName" class="truncate text-caption text-muted-foreground">
        📍 {{ locationName }}
      </p>

      <div v-if="npc.tags.length" class="mt-auto flex flex-wrap gap-1 pt-1">
        <span
          v-for="tag in npc.tags.slice(0, 3)"
          :key="tag"
          class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
        <span
          v-if="npc.tags.length > 3"
          class="self-center text-caption-sm text-muted-foreground italic"
        >
          +{{ npc.tags.length - 3 }}
        </span>
      </div>
    </template>

    <!--
      Edit and Reveal: icon-only chips on the same dark scrim, at the same size,
      both always visible. They sit side by side over the portrait, so any
      difference in size or treatment between them reads as a mistake rather
      than a distinction — Edit used to be a labelled pill that appeared only on
      hover, which made the pair look unrelated.
    -->
    <template #actions-start>
      <AppButton
        variant="ghost"
        size="icon-xs"
        :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/npcs/${npc.id}?edit=true`"
        tooltip="Edit NPC"
        aria-label="Edit NPC"
      />
      <div @click.prevent.stop>
        <NpcRevealControl :npc="npc" form="overlay" />
      </div>
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/appButtonVariants";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import { IconEdit } from "@/lib/icons";
import {
  getNpcDisplayFocalPoint,
  getNpcDisplayName,
  getNpcDisplayPortrait,
  npcRelationshipBg,
  npcStatusBg,
} from "@/lib/npcDisplay";
import type { Npc } from "@/types/npc.types";

const { npc, locationName } = defineProps<{
  npc: Npc;
  /** Resolved by the list, which already holds the id → name map. */
  locationName?: string;
  locked?: boolean;
}>();

// `getNpcDisplayName` is honestly nullable — the player projection returns null
// when the name is not revealed — so the "no name" case is marked, never
// coerced to an empty string.
const displayName = computed(() => getNpcDisplayName(npc) ?? "???");
const relClass = computed(() => npcRelationshipBg(npc.relationship));
const statusClass = computed(() => npcStatusBg(npc.status));
</script>
