<template>
  <div class="border border-border rounded-lg p-3 mb-4 bg-muted/30 flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div class="text-label-lg font-semibold text-muted-foreground">
        Suggested connections
      </div>
      <AppButton variant="subtle" size="sm" label="Dismiss all" @click="emit('dismissAll')" />
    </div>
    <p class="text-caption text-muted-foreground">
      Nothing is saved until you accept a suggestion.
    </p>
    <!-- The same slip as the saved connections; Accept and Dismiss sit under the reason so a phone keeps its width for it. -->
    <ConnectionSlip
      v-for="s in suggestions"
      :key="`${s.kind}:${s.kind === 'kin' ? s.target_type : ''}:${s.target_id}`"
      :name="s.target_name"
      :image="thumbnail(s)"
      :image-format="s.kind === 'faction' ? 'token' : 'portrait'"
      :tags="tagsOf(s)"
      :notes="s.notes"
    >
      <template #footer>
        <div class="flex justify-end gap-1">
          <AppButton
            variant="primary"
            size="sm"
            :icon="IconCheck"
            icon-size="xs"
            label="Accept"
            :disabled="pending"
            @click="emit('accept', s)"
          />
          <AppButton
            variant="subtle"
            size="sm"
            label="Dismiss"
            :disabled="pending"
            @click="emit('dismiss', s)"
          />
        </div>
      </template>
    </ConnectionSlip>
    <p
      v-for="a in setAside"
      :key="`aside:${a.target_name}:${a.relation}`"
      class="text-caption text-muted-foreground italic"
    >
      Set aside: "{{ a.target_name }} is {{ sourceName }}'s {{ KIN_LABELS[a.relation].toLowerCase() }}". {{ capitalised(a.reason) }}.
    </p>
  </div>
</template>

<script setup lang="ts">
import { IconCheck } from "@/lib/icons";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ConnectionSlip, { type ConnectionTag } from "@/components/common/entity/ConnectionSlip.vue";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { NPC_RELATIONSHIP_TYPE_VAR, npcRelationLabel } from "@/types/npc.types";
import type { ResolvedSuggestion } from "@/ai/useNpcRelationshipSuggestions";
import type { SetAsideKin, SuggestedKinRelation } from "@edge-shared/npcRelationshipSuggestions.ts";

// What the target is to this NPC, as the badge reads it.
const KIN_LABELS: Record<SuggestedKinRelation, string> = {
  parent: "Parent",
  child: "Child",
  spouse: "Spouse",
  former_spouse: "Former spouse",
  sibling: "Sibling",
  relative: "Relative",
};

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const { sourceName } = defineProps<{
  suggestions: ResolvedSuggestion[];
  /** Kin claims the server refused, shown as one muted line each. */
  setAside: SetAsideKin[];
  sourceName: string;
  pending: boolean;
}>();
const emit = defineEmits<{
  accept: [suggestion: ResolvedSuggestion];
  dismiss: [suggestion: ResolvedSuggestion];
  dismissAll: [];
}>();

const { data: npcs } = useNpcs();
const { data: party } = useParty();
const { data: factions } = useAllFactions();
const npcPortraits = computed(() => new Map((npcs.value ?? []).map((n) => [n.id, n.portrait_url])));
const pcPortraits = computed(() => new Map((party.value ?? []).map((p) => [p.id, p.portrait_url])));
const emblems = computed(() => new Map((factions.value ?? []).map((f) => [f.id, f.emblem_url])));

/** The target's picture: an NPC or PC portrait, or a faction's emblem. */
function thumbnail(s: ResolvedSuggestion): string | null {
  if (s.kind === "faction") return emblems.value.get(s.target_id) ?? null;
  if (s.kind === "kin" && s.target_type === "pc") return pcPortraits.value.get(s.target_id) ?? null;
  return npcPortraits.value.get(s.target_id) ?? null;
}

function tagsOf(s: ResolvedSuggestion): ConnectionTag[] {
  const tags: ConnectionTag[] = [badge(s)];
  if (s.kind === "faction") tags.push({ label: "faction" });
  else if (s.kind === "kin" && s.target_type === "pc") tags.push({ label: "character" });
  return tags;
}

function badge(s: ResolvedSuggestion): { label: string; color: string } {
  if (s.kind === "npc") {
    return {
      label: npcRelationLabel(s.relationship_type, sourceName),
      color: NPC_RELATIONSHIP_TYPE_VAR[s.relationship_type],
    };
  }
  if (s.kind === "kin") return { label: KIN_LABELS[s.relation], color: "var(--primary)" };
  return { label: s.role || "Member", color: "var(--muted-foreground)" };
}
</script>
