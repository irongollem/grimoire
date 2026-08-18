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
    <template #what>
      <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
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
import { ref, watch } from "vue";
import RevealControl from "@/components/common/RevealControl.vue";
import RevealedFieldsPanel from "@/components/common/RevealedFieldsPanel.vue";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useParty } from "@/composables/useParty";
import { useUpdateNpc } from "@/composables/useNpcs";
import { fieldsForFirstReveal, NPC_PLAYER_FIELDS } from "@/lib/npcDisplay";
import type { RevealAdapter } from "@/lib/reveal";
import { useUiStore } from "@/stores/ui";
import type { Npc } from "@/types/npc.types";

const { npc, form = "button" } = defineProps<{
  npc: Npc;
  form?: "button" | "overlay";
}>();

const { mutate: updateNpc } = useUpdateNpc();
const { data: partyData } = useParty();
const { sendNarrativeEvent } = useCampaignMessages();
const ui = useUiStore();

/** Local optimistic state, so a toggle lands without waiting for the refetch. */
const visibleTo = ref<string[]>([...npc.player_visible_to]);
const fields = ref<string[]>([...npc.player_visible_fields]);

watch(
  () => npc,
  (next) => {
    visibleTo.value = [...next.player_visible_to];
    fields.value = [...next.player_visible_fields];
  },
);

/**
 * Written out rather than built on `arrayRevealAdapter` because an NPC's
 * audience change is not only an audience change: it seeds the field list and,
 * in play mode, narrates the encounter. Both need to know what the audience was
 * *before* the change, which an `onChange(next)` callback has already discarded.
 */
const adapter: RevealAdapter = {
  isMemberVisible: (memberId) => visibleTo.value.includes(memberId),
  toggleMember: (memberId) => {
    const adding = !visibleTo.value.includes(memberId);
    const next = adding
      ? [...visibleTo.value, memberId]
      : visibleTo.value.filter((id) => id !== memberId);
    apply(next);
    if (adding && ui.dmMode === "play") {
      const who = (partyData.value ?? []).find((m) => m.id === memberId)?.name;
      void sendNarrativeEvent(`${who ?? "A party member"} encounters ${npc.name}.`, npc.id);
    }
  },
  setWholeParty: () => {
    const wasHidden = visibleTo.value.length === 0;
    apply((partyData.value ?? []).map((m) => m.id));
    if (wasHidden && ui.dmMode === "play") {
      void sendNarrativeEvent(`The party encounters ${npc.name}.`, npc.id);
    }
  },
  unshare: () => apply([]),
};

function apply(next: string[]) {
  // Hiding leaves the field list alone: the DM's choice of what to show should
  // still be there when they reveal this NPC again.
  const nextFields = next.length ? fieldsForFirstReveal(fields.value) : fields.value;
  visibleTo.value = next;
  fields.value = nextFields;
  updateNpc({
    id: npc.id,
    update: { player_visible_to: next, player_visible_fields: nextFields },
  });
}

function setFields(next: string[]) {
  fields.value = next;
  updateNpc({ id: npc.id, update: { player_visible_fields: next } });
}
</script>
