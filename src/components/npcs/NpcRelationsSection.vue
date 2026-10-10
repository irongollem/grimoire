<template>
  <section class="w-full">
    <div class="flex items-center justify-between mb-1 w-full">
      <div class="text-heading-sm font-bold text-foreground">
        NPC Connections
      </div>
      <div class="flex items-center gap-2">
        <AppButton
          v-if="isAiEnabled"
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconGenerate"
          icon-size="xs"
          :loading="isSuggesting"
          :disabled="isAnyAiGenerating"
          :tooltip="isAnyAiGenerating && !isSuggesting ? 'Another generation is already in progress' : undefined"
          label="Suggest"
          @click="showSteer = !showSteer"
        />
        <AppButton
          variant="outline"
          fill="muted"
          size="sm"
          :icon="IconAdd"
          icon-size="xs"
          label="Add"
          @click="showForm = true"
        />
      </div>
    </div>
    <div class="gold-divider mb-3" />

    <!-- AI suggestion steer -->
    <div
      v-if="isAiEnabled && showSteer"
      class="border border-border rounded-lg p-3 space-y-3 mb-4 bg-muted/30"
    >
      <div>
        <label class="field-label"
          >Steer
          <span class="font-fell font-normal normal-case text-muted-foreground">(optional)</span></label
        >
        <AppInput
          v-model="steer"
          tone="filled"
          size="body"
          :maxlength="AI_PROMPT_LIMIT_SHORT"
          placeholder="e.g. someone with a grudge against the guild"
        />
      </div>
      <div class="flex items-center justify-end gap-2">
        <GenerationCostBadge :credits="suggestCost" :byok="textIsByok" />
        <AppButton variant="subtle" size="sm" label="Cancel" @click="showSteer = false" />
        <AppButton
          variant="primary"
          size="sm"
          :icon="IconGenerate"
          icon-size="xs"
          :loading="isSuggesting"
          :disabled="isAnyAiGenerating"
          label="Suggest connections"
          @click="runSuggest"
        />
      </div>
    </div>
    <p v-if="suggestError" class="text-caption text-destructive mb-3">{{ suggestError }}</p>
    <NpcRelationSuggestions
      v-if="suggestions.length > 0"
      :suggestions="suggestions"
      :pending="isAccepting"
      @accept="acceptSuggestion"
      @dismiss="dismiss"
      @dismiss-all="dismissAll"
    />

    <!-- Add form -->
    <div
      v-if="showForm"
      class="border border-border rounded-lg p-3 space-y-3 mb-4 bg-muted/30"
    >
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="field-label">NPC</label>
          <EntityCombobox
            :model-value="newRelatedId"
            :options="otherNpcs"
            placeholder="Search NPCs…"
            @update:model-value="newRelatedId = $event"
          />
        </div>
        <div>
          <label class="field-label">Relationship</label>
          <AppSelect v-model="newType" tone="filled" size="body" weight="normal" block>
            <option v-for="[k, label] in typeOptions" :key="k" :value="k">
              {{ label }}
            </option>
          </AppSelect>
        </div>
        <div class="col-span-2">
          <label class="field-label"
            >Notes
            <span
              class="font-fell font-normal normal-case text-muted-foreground"
              >(optional)</span
            ></label
          >
          <AppInput
            v-model="newNotes"
            tone="filled"
            size="body"
            placeholder="Brief context…"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="cancelAdd" />
        <AppButton
          variant="primary"
          size="sm"
          :disabled="!newRelatedId || isSaving"
          :label="isSaving ? 'Saving…' : 'Add'"
          @click="addRelation"
        />
      </div>
    </div>

    <!-- List -->
    <div
      v-if="relations.length === 0 && !showForm"
      class="text-body text-muted-foreground italic"
    >
      No relationships recorded yet.
    </div>
    <div class="space-y-2">
      <div
        v-for="rel in relations"
        :key="rel.id"
        class="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card group"
      >
        <!-- Type badge -->
        <span
          class="shrink-0 mt-0.5 px-2 py-0.5 rounded text-label font-bold"
          :style="{
            backgroundColor: `color-mix(in oklab, ${typeColor(rel)} 13%, transparent)`,
            color: typeColor(rel),
          }"
        >
          {{ typeLabel(rel) }}
        </span>

        <!-- NPC name + notes -->
        <div class="flex-1 min-w-0">
          <RouterLink
            :to="`/npcs/${otherNpcId(rel)}`"
            class="text-heading-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ otherNpcName(rel) }}
          </RouterLink>
          <p
            v-if="rel.notes"
            class="text-caption text-muted-foreground mt-0.5 wrap-break-word whitespace-normal"
          >
            {{ rel.notes }}
          </p>
        </div>

        <!-- Delete -->
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-all"
          :icon="IconClose"
          @click="removeRelation(rel.id)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconClose, IconGenerate } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import NpcRelationSuggestions from "@/components/npcs/NpcRelationSuggestions.vue";
import {
  useNpcRelations,
  useCreateNpcRelation,
  useDeleteNpcRelation,
} from "@/composables/factions/useNpcRelations";
import { useAddFactionNpc, useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useToast } from "@/composables/useToast";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import {
  useNpcRelationshipSuggestions,
  type ResolvedSuggestion,
} from "@/ai/useNpcRelationshipSuggestions";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import {
  NPC_RELATIONSHIP_TYPE_LABELS,
  NPC_RELATIONSHIP_TYPE_VAR,
  NPC_RELATIONSHIP_INVERSE,
} from "@/types/npc.types";
import type { NpcRelationshipType, NpcRelation } from "@/types/npc.types";

const props = defineProps<{ npcId: string }>();

const { data: relationsRaw } = useNpcRelations(props.npcId);
const { data: allNpcs } = useNpcs();
const { mutateAsync: createRelation, isPending: isSaving } =
  useCreateNpcRelation();
const { mutateAsync: deleteRelation } = useDeleteNpcRelation();

const relations = computed(() => relationsRaw.value ?? []);

const npcById = computed(() =>
  Object.fromEntries((allNpcs.value ?? []).map((n) => [n.id, n])),
);

const otherNpcs = computed(() =>
  (allNpcs.value ?? []).filter((n) => n.id !== props.npcId),
);

const typeOptions = computed(
  () =>
    Object.entries(NPC_RELATIONSHIP_TYPE_LABELS) as [
      NpcRelationshipType,
      string,
    ][],
);

// Return the effective relationship type from *this* NPC's perspective.
// If this NPC is the related_npc_id (i.e. it's on the receiving end), flip to the inverse.
function effectiveType(rel: NpcRelation): NpcRelationshipType {
  const raw = rel.relationship_type as NpcRelationshipType;
  return rel.npc_id === props.npcId
    ? raw
    : (NPC_RELATIONSHIP_INVERSE[raw] ?? raw);
}
function typeLabel(rel: NpcRelation): string {
  return (
    NPC_RELATIONSHIP_TYPE_LABELS[effectiveType(rel)] ?? rel.relationship_type
  );
}
function typeColor(rel: NpcRelation): string {
  return NPC_RELATIONSHIP_TYPE_VAR[effectiveType(rel)] ?? "var(--muted-foreground)";
}

function otherNpcId(rel: NpcRelation): string {
  return rel.npc_id === props.npcId ? rel.related_npc_id : rel.npc_id;
}
function otherNpcName(rel: NpcRelation): string {
  return npcById.value[otherNpcId(rel)]?.name ?? "Unknown NPC";
}

// Add form state
const showForm = ref(false);
const newRelatedId = ref("");
const newType = ref<NpcRelationshipType>("ally");
const newNotes = ref("");

function cancelAdd() {
  showForm.value = false;
  newRelatedId.value = "";
  newType.value = "ally";
  newNotes.value = "";
}

async function addRelation() {
  if (!newRelatedId.value) return;
  await createRelation({
    npc_id: props.npcId,
    related_npc_id: newRelatedId.value,
    relationship_type: newType.value,
    notes: newNotes.value.trim() || null,
  });
  cancelAdd();
}

async function removeRelation(id: string) {
  await deleteRelation(id);
}

// ── AI suggestions ──────────────────────────────────────────────────────────
const campaign = useCampaignStore();
const toast = useToast();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { data: allFactions } = useAllFactions();
const { mutateAsync: addFactionNpc } = useAddFactionNpc();
const { suggest, forNpc } = useNpcRelationshipSuggestions();
// Bound to this NPC: another NPC's Suggest run never shows up or accepts here.
const {
  isGenerating: isSuggesting,
  error: suggestError,
  suggestions,
  provenance,
  dismiss,
  dismissAll,
} = forNpc(() => props.npcId);

const { canSpend } = useGenerationGate();
const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const suggestCost = computed(() =>
  textCredits(costOf("npc_relationship_suggestion")),
);

const showSteer = ref(false);
const steer = ref("");
const isAccepting = ref(false);

async function runSuggest() {
  if (!canSpend(suggestCost.value, textIsByok.value)) return;
  const ok = await suggest(props.npcId, steer.value, {
    npcs: otherNpcs.value,
    factions: allFactions.value ?? [],
  });
  if (ok) {
    showSteer.value = false;
    steer.value = "";
  }
}

async function acceptSuggestion(s: ResolvedSuggestion) {
  isAccepting.value = true;
  try {
    if (s.kind === "npc") {
      await createRelation({
        npc_id: props.npcId,
        related_npc_id: s.target_id,
        relationship_type: s.relationship_type,
        notes: s.notes || null,
        ai_provenance: provenance.value,
      });
    } else {
      await addFactionNpc({
        faction_id: s.target_id,
        npc_id: props.npcId,
        role: s.role || undefined,
      });
    }
    dismiss(s);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Could not save that connection.");
  } finally {
    isAccepting.value = false;
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
