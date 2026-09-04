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
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useParty } from "@/composables/party/useParty";
import { useUpdateNpc } from "@/composables/npcs/useNpcs";
import {
  fieldsForFirstReveal,
  getNpcPlayerFacingName,
  NPC_PLAYER_FIELDS,
  NPC_UNNAMED_IN_PROSE,
} from "@/lib/npcDisplay";
import type { RevealAdapter, RevealForm } from "@/lib/reveal";
import { useUiStore } from "@/stores/ui";
import type { Npc } from "@/types/npc.types";

const { npc, form = "button" } = defineProps<{
  npc: Npc;
  form?: RevealForm;
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
    const nextFields = apply(next);
    if (adding && ui.dmMode === "play") {
      const who = (partyData.value ?? []).find((m) => m.id === memberId)?.name;
      void sendNarrativeEvent(
        `${who ?? "A party member"} encounters ${announcedName(nextFields)}.`,
        npc.id,
      );
    }
  },
  setWholeParty: () => {
    const wasHidden = visibleTo.value.length === 0;
    const nextFields = apply((partyData.value ?? []).map((m) => m.id));
    if (wasHidden && ui.dmMode === "play") {
      void sendNarrativeEvent(`The party encounters ${announcedName(nextFields)}.`, npc.id);
    }
  },
  unshare: () => void apply([]),
};

/** The stored field list, so callers can announce against what was actually saved. */
function apply(next: string[]): string[] {
  // Hiding leaves the field list alone: the DM's choice of what to show should
  // still be there when they reveal this NPC again.
  const nextFields = next.length ? fieldsForFirstReveal(fields.value) : fields.value;
  visibleTo.value = next;
  fields.value = nextFields;
  updateNpc({
    id: npc.id,
    update: { player_visible_to: next, player_visible_fields: nextFields },
  });
  return nextFields;
}

/**
 * The name to put in the chat announcement.
 *
 * Read against `nextFields` rather than the NPC row, because the reveal seeds
 * the field list in the same breath: on a first reveal the row still says the
 * name is hidden while the write that shares it is in flight. Reading the row
 * would announce "someone" for every first reveal.
 *
 * `npc.name` is the true name and must never appear here — an unrevealed alter
 * ego announces under its cover, and an NPC whose name the DM has not ticked
 * announces under none at all.
 */
function announcedName(nextFields: string[]): string {
  return (
    getNpcPlayerFacingName({ ...npc, player_visible_fields: nextFields })
    ?? NPC_UNNAMED_IN_PROSE
  );
}

function setFields(next: string[]) {
  fields.value = next;
  updateNpc({ id: npc.id, update: { player_visible_fields: next } });
}
</script>
