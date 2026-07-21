<template>
  <!--
    Mobile-only (<md) reveal bottom-sheet for an NPC detail screen.
    Mirrors the share-popover logic in NpcList.vue, wired to the real
    player_visible_to / player_visible_fields via useUpdateNpc.

      - "Whole party" row toggles every party member at once
      - one row per party member toggles that member
      - "What players see" field chips (disabled until ≥1 player selected)
      - "Done" footer button closes the sheet
  -->
  <MobileSheet v-model:open="open" title="Reveal to players">
    <div class="flex flex-col gap-1 pb-2">
      <!-- Whole party -->
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-body transition-colors"
        :class="wholePartyShared
          ? 'bg-primary/15 text-primary'
          : 'text-foreground active:bg-muted/50'"
        @click="setWholeParty"
      >
        <IconParty class="size-4 shrink-0" />
        Whole party
      </button>

      <!-- Per-player toggles -->
      <button
        v-for="member in party"
        :key="member.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-body transition-colors"
        :class="isMemberVisible(member.id)
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground active:bg-muted/50'"
        @click="toggleMember(member.id)"
      >
        <component
          :is="isMemberVisible(member.id) ? IconReveal : IconHide"
          class="size-4 shrink-0"
        />
        {{ member.name }}
      </button>

      <p v-if="!party?.length" class="px-3 py-3 text-body italic text-muted-foreground">
        No party members to share with yet.
      </p>

      <!-- Field reveal — what the chosen players actually see -->
      <div class="mt-2 border-t border-border pt-3">
        <p class="px-1 pb-2 font-cinzel text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          What players see
        </p>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="f in NPC_PLAYER_FIELDS"
            :key="f.key"
            class="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-body transition-colors"
            :class="[
              isFieldVisible(f.key) ? 'border-primary/50 bg-primary/10 text-primary' : 'text-foreground',
              !shared && 'pointer-events-none opacity-40',
            ]"
          >
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="isFieldVisible(f.key)"
              :disabled="!shared"
              @change="toggleField(f.key)"
            />
            {{ f.label }}
          </label>
        </div>
        <p v-if="!shared" class="px-1 pt-2 text-caption italic text-muted-foreground">
          Select at least one player to choose what they see.
        </p>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="w-full rounded-lg bg-primary px-4 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90"
        @click="open = false"
      >
        Done
      </button>
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import { IconHide, IconParty, IconReveal } from "@/lib/icons";
import { useParty } from "@/composables/useParty";
import { useUpdateNpc } from "@/composables/useNpcs";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useUiStore } from "@/stores/ui";
import { NPC_PLAYER_FIELDS, type NpcPlayerFieldKey } from "@/lib/npcDisplay";
import type { Npc } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc }>();
const open = defineModel<boolean>("open", { required: true });

const { data: party } = useParty();
const { mutate: updateNpc } = useUpdateNpc();
const { sendNarrativeEvent } = useCampaignMessages();
const ui = useUiStore();

const shared = computed(() => (npc.player_visible_to?.length ?? 0) > 0);

const wholePartyShared = computed(
  () => shared.value && (party.value ?? []).length > 0 && (party.value ?? []).every((m) => isMemberVisible(m.id)),
);

function isMemberVisible(memberId: string): boolean {
  return Array.isArray(npc.player_visible_to) && npc.player_visible_to.includes(memberId);
}

function allPartyIds(): string[] {
  return party.value?.map((m) => m.id) ?? [];
}

// Without any fields revealed, sharing an NPC is a no-op for the player.
// Pre-fill name + portrait on first reveal so the toggle is immediately useful.
const DEFAULT_FIELDS: NpcPlayerFieldKey[] = ["name", "portrait"];
function fieldsForFirstReveal(): string[] {
  return (npc.player_visible_fields?.length ?? 0) > 0 ? npc.player_visible_fields : [...DEFAULT_FIELDS];
}

function setWholeParty() {
  // Tapping "Whole party" while already fully shared unshares everyone.
  if (wholePartyShared.value) {
    updateNpc({ id: npc.id, update: { player_visible_to: [] } });
    return;
  }
  const wasHidden = !shared.value;
  updateNpc({
    id: npc.id,
    update: {
      player_visible_to: [...new Set(allPartyIds())],
      player_visible_fields: fieldsForFirstReveal(),
    },
  });
  if (wasHidden && ui.dmMode === "play") {
    void sendNarrativeEvent(`The party encounters ${npc.name}.`, npc.id);
  }
}

function toggleMember(memberId: string) {
  const current = [...(npc.player_visible_to ?? [])];
  const idx = current.indexOf(memberId);
  const next = idx === -1 ? [...current, memberId] : current.filter((id) => id !== memberId);
  updateNpc({
    id: npc.id,
    update: {
      player_visible_to: next,
      player_visible_fields: next.length > 0 ? fieldsForFirstReveal() : npc.player_visible_fields,
    },
  });
  if (idx === -1 && ui.dmMode === "play") {
    const memberName = party.value?.find((m) => m.id === memberId)?.name;
    void sendNarrativeEvent(`${memberName ?? "A party member"} encounters ${npc.name}.`, npc.id);
  }
}

function isFieldVisible(key: string): boolean {
  return npc.player_visible_fields?.includes(key) ?? false;
}

function toggleField(key: string) {
  const set = new Set(npc.player_visible_fields ?? []);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  updateNpc({ id: npc.id, update: { player_visible_fields: Array.from(set) } });
}
</script>
