<template>
  <!--
    An NPC's reveal, in the app's one reveal control.

    NPCs were the worst case this change exists to fix: four separate UIs for
    the same action — a header popover, a list-card popover, a mobile bottom
    sheet, and a fields panel bolted to the top of the edit form — each with its
    own idea of what "reveal" meant. Three of them knew about the default
    fields; two knew to announce the encounter in play mode; only one offered
    both. Which one a DM got depended on where they were standing.

    This owns all three behaviours, so every NPC surface gets the same one.
  -->
  <RevealControl :adapter="adapter" :entity-name="npc.name" :form="form">
    <template v-if="hasDisguise" #identity>
      <NpcAlterEgoControl :revealed="isRevealed" @change="setRevealed" />
    </template>
    <template #what>
      <p class="mb-2 text-label font-semibold text-muted-foreground">
        THEY ALSO SEE
      </p>
      <RevealedFieldsPanel
        :model-value="fields"
        :fields="NPC_PLAYER_FIELDS"
        @update:model-value="setFields($event)"
      />
    </template>
  </RevealControl>
</template>

<script setup lang="ts">
import RevealControl from "@/components/common/reveal/RevealControl.vue";
import RevealedFieldsPanel from "@/components/common/reveal/RevealedFieldsPanel.vue";
import NpcAlterEgoControl from "@/components/npcs/NpcAlterEgoControl.vue";
import { useNpcReveal } from "@/composables/npcs/useNpcReveal";
import { NPC_PLAYER_FIELDS } from "@/lib/npcDisplay";
import type { RevealForm } from "@/lib/reveal";
import type { NpcListRow } from "@/types/npc.types";

const { npc, form = "button" } = defineProps<{
  npc: NpcListRow;
  form?: RevealForm;
}>();

const { fields, isRevealed, hasDisguise, adapter, setFields, setRevealed } = useNpcReveal(() => npc);
</script>
