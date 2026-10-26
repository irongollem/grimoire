<template>
  <div class="flex flex-col">
    <div class="flex items-start gap-3 p-4 pb-2">
      <svg width="44" height="44" viewBox="-22 -22 44 44" class="shrink-0" aria-hidden="true">
        <WorldNodeShape
          :kind="entity.kind"
          :name="entity.name"
          :size="17"
          :fill="fill"
          :image="entity.image"
          portrait
        />
      </svg>
      <div class="min-w-0 flex-1">
        <h2 class="text-heading-sm font-bold leading-tight text-foreground">{{ entity.name }}</h2>
        <p class="text-caption text-muted-foreground">{{ kindNoun(entity.kind) }}</p>
      </div>
      <AppButton variant="ghost" size="icon-sm" :icon="IconClose" aria-label="Close" @click="emit('close')" />
    </div>

    <div class="flex flex-wrap gap-2 px-4 pb-3">
      <AppButton
        v-if="!isFocus"
        variant="primary"
        size="md"
        :icon="IconNetwork"
        label="Focus"
        @click="emit('focus')"
      />
      <AppButton
        v-if="canConnect"
        variant="outline"
        size="md"
        :icon="IconLink"
        label="Connect…"
        @click="emit('connect')"
      />
      <AppButton
        v-if="sheetPath"
        variant="outline"
        size="md"
        :icon="IconExternalLink"
        label="Open sheet"
        :to="sheetPath"
      />
    </div>

    <div class="border-t border-border p-4">
      <WorldWebTieGroups
        :groups="groups"
        :subject-key="entity.key"
        :subject-name="entity.name"
        :editable="editable"
        :busy="busy"
        @node="emit('node', $event)"
        @retype="(tie, choice) => emit('retype', tie, choice)"
        @remove="emit('remove', $event)"
        @words="(tie, words) => emit('words', tie, words)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import WorldNodeShape from "@/components/world/WorldNodeShape.vue";
import WorldWebTieGroups from "@/components/world/WorldWebTieGroups.vue";
import { IconClose, IconExternalLink, IconLink, IconNetwork } from "@/lib/icons";
import { npcRelationshipCanvasColor } from "@/lib/npcDisplay";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import { isLinkKind, kindNoun } from "@/lib/worldWeb/kinds";
import type { WebEntity } from "@/lib/worldWeb/model";
import { groupTies, type WorldTie } from "@/lib/worldWeb/ties";

const { entity, ties, editable = false, isFocus = false, sheetPath = null, busy = false } = defineProps<{
  entity: WebEntity;
  /** Every tie that touches the entity. */
  ties: readonly WorldTie[];
  editable?: boolean;
  /** Already the centre of the focus, so Focus is not offered. */
  isFocus?: boolean;
  sheetPath?: string | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  focus: [];
  connect: [];
  node: [key: string];
  retype: [tie: WorldTie, choice: TypeChoice];
  remove: [tie: WorldTie];
  words: [tie: WorldTie, words: { note: string; told: string }];
}>();

const groups = computed(() => groupTies(ties, entity.key));
const canConnect = computed(() => editable && isLinkKind(entity.kind));
const fill = computed(() => (entity.attitude ? npcRelationshipCanvasColor(entity.attitude) : undefined));
</script>
