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
    :placeholder="placeholderUrl('npc')"
    :locked="locked"
    :badge-text="npc.relationship"
    :badge-class="relClass"
    :eyebrow="npc.race"
    :status-class="statusClass"
  >
    <!-- Low art (#1179, frame 02): the card draws the title and its diamond, so the body keeps
         the occupation and the place, and the tags move to the foot. -->
    <template #body="{ artFree }">
      <div v-if="!artFree" class="flex items-start justify-between gap-1">
        <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">
          {{ displayName }}
        </h3>
        <span
          :title="npc.status"
          class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          :class="statusClass"
        />
      </div>

      <p v-if="artFree ? npc.occupation : npc.race || npc.occupation" class="truncate text-caption text-muted-foreground italic">
        {{ artFree ? npc.occupation : [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
      </p>

      <p v-if="locationName" class="truncate text-caption text-muted-foreground">
        <IconCompassRose class="mr-1 inline h-3.5 w-3.5 -translate-y-px" />{{ locationName }}
      </p>

      <TagChips v-if="!artFree" :tags="npc.tags" :max="3" overflow class="mt-auto pt-1" />
    </template>

    <template #foot>
      <TagChips :tags="npc.tags" :max="3" overflow />
    </template>

    <!--
      Edit and Reveal: icon-only chips on the same dark scrim, at the same size,
      both always visible. They sit side by side over the portrait, so any
      difference in size or treatment between them reads as a mistake rather
      than a distinction — Edit used to be a labelled pill that appeared only on
      hover, which made the pair look unrelated.
    -->
    <template #actions-start="{ artFree }">
      <AppButton
        variant="ghost"
        size="icon-xs"
        :class="artFree ? undefined : [CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/npcs/${npc.id}?edit=true`"
        tooltip="Edit NPC"
        aria-label="Edit NPC"
      />
      <div @click.prevent.stop>
        <NpcRevealControl :npc="npc" :form="artFree ? 'inline' : 'overlay'" />
      </div>
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import { IconCompassRose, IconEdit } from "@/lib/icons";
import {
  getNpcDisplayFocalPoint,
  getNpcDisplayName,
  getNpcDisplayPortrait,
  npcRelationshipBg,
  npcStatusBg,
} from "@/lib/npcDisplay";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import type { NpcListRow } from "@/types/npc.types";

const { npc, locationName } = defineProps<{
  npc: NpcListRow;
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
