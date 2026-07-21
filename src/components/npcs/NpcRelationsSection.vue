<template>
  <section class="w-full">
    <div class="flex items-center justify-between mb-1 w-full">
      <div class="font-cinzel text-base font-bold text-foreground">
        NPC Connections
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2.5 py-1 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors"
        @click="showForm = true"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
    <div class="gold-divider mb-3" />

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
          <select v-model="newType" class="field-input">
            <option v-for="[k, label] in typeOptions" :key="k" :value="k">
              {{ label }}
            </option>
          </select>
        </div>
        <div class="col-span-2">
          <label class="field-label"
            >Notes
            <span
              class="font-fell font-normal normal-case text-muted-foreground"
              >(optional)</span
            ></label
          >
          <input
            v-model="newNotes"
            placeholder="Brief context…"
            class="field-input"
          />
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
          @click="cancelAdd"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!newRelatedId || isSaving"
          class="px-3 py-1.5 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="addRelation"
        >
          {{ isSaving ? "Saving…" : "Add" }}
        </button>
      </div>
    </div>

    <!-- List -->
    <div
      v-if="relations.length === 0 && !showForm"
      class="font-fell text-sm text-muted-foreground italic"
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
            backgroundColor: typeColor(rel) + '22',
            color: typeColor(rel),
          }"
        >
          {{ typeLabel(rel) }}
        </span>

        <!-- NPC name + notes -->
        <div class="flex-1 min-w-0">
          <RouterLink
            :to="`/npcs/${otherNpcId(rel)}`"
            class="font-cinzel text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ otherNpcName(rel) }}
          </RouterLink>
          <p
            v-if="rel.notes"
            class="font-fell text-xs text-muted-foreground mt-0.5 wrap-break-word whitespace-normal"
          >
            {{ rel.notes }}
          </p>
        </div>

        <!-- Delete -->
        <button
          type="button"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
          @click="removeRelation(rel.id)"
        >
          <IconClose class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconClose } from '@/lib/icons';
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import {
  useNpcRelations,
  useCreateNpcRelation,
  useDeleteNpcRelation,
} from "@/composables/useNpcRelations";
import { useNpcs } from "@/composables/useNpcs";
import {
  NPC_RELATIONSHIP_TYPE_LABELS,
  NPC_RELATIONSHIP_TYPE_COLORS,
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
  return NPC_RELATIONSHIP_TYPE_COLORS[effectiveType(rel)] ?? "#6b7280";
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
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
