<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-label-lg font-semibold text-muted-foreground uppercase">Relations</h2>

    <!-- Outgoing (we define these) -->
    <div class="flex flex-col gap-1.5">
      <p class="text-label text-muted-foreground">Our stance</p>

      <div v-for="rel in outgoing" :key="rel.id" class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <span
          class="shrink-0 h-2 w-2 rounded-full"
          :style="{ backgroundColor: meta(rel.relation_type).color }"
        />
        <RouterLink :to="`/factions/${rel.target_faction.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate">
          {{ rel.target_faction.name }}
        </RouterLink>
        <span class="text-label shrink-0" :style="{ color: meta(rel.relation_type).color }">
          {{ meta(rel.relation_type).label }}
        </span>
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none ml-1" @click="remove(rel)">×</button>
      </div>

      <!-- Add outgoing -->
      <div class="flex items-center gap-2">
        <EntityCombobox
          v-model="newTargetId"
          :options="availableTargets"
          placeholder="Add faction…"
        />
        <select
          v-model="newRelationType"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
        >
          <option v-for="r in RELATION_TYPES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
        <button
          type="button"
          :disabled="!newTargetId || adding"
          class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="add"
        >
          <IconAdd class="h-3 w-3" />
          Add
        </button>
      </div>
    </div>

    <!-- Incoming (others define these, read-only here) -->
    <template v-if="incoming.length">
      <p class="text-label text-muted-foreground mt-1">How others see us</p>
      <div v-for="rel in incoming" :key="rel.id" class="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <span
          class="shrink-0 h-2 w-2 rounded-full"
          :style="{ backgroundColor: meta(rel.relation_type).color }"
        />
        <RouterLink :to="`/factions/${rel.source_faction.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate">
          {{ rel.source_faction.name }}
        </RouterLink>
        <span class="text-label shrink-0 italic text-muted-foreground">views us as</span>
        <span class="text-label shrink-0" :style="{ color: meta(rel.relation_type).color }">
          {{ meta(rel.relation_type).label }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd } from '@/lib/icons';
import {
  useFactionRelations,
  useUpsertFactionRelation,
  useDeleteFactionRelation,
  type FactionRelationWithFactions,
} from "@/composables/useFactions";
import { useAllFactions } from "@/composables/useFactions";
import { RELATION_TYPES, relationMeta } from "@/types/faction.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ factionId: string }>();

const { data: relations } = useFactionRelations(props.factionId);
const { data: allFactions } = useAllFactions();
const upsert = useUpsertFactionRelation();
const del    = useDeleteFactionRelation();

const outgoing = computed(() => relations.value?.outgoing ?? []);
const incoming = computed(() => relations.value?.incoming ?? []);

const outgoingTargetIds = computed(() => new Set(outgoing.value.map((r) => r.target_faction_id)));
const availableTargets = computed(() =>
  (allFactions.value ?? []).filter(
    (f) => f.id !== props.factionId && !outgoingTargetIds.value.has(f.id),
  ),
);

const newTargetId     = ref("");
const newRelationType = ref("neutral");
const adding          = ref(false);

function meta(type: string) { return relationMeta(type); }

async function add() {
  if (!newTargetId.value) return;
  adding.value = true;
  try {
    await upsert.mutateAsync({
      faction_id: props.factionId,
      target_faction_id: newTargetId.value,
      relation_type: newRelationType.value,
    });
    newTargetId.value = "";
    newRelationType.value = "neutral";
  } finally {
    adding.value = false;
  }
}

async function remove(rel: FactionRelationWithFactions) {
  await del.mutateAsync({
    id: rel.id,
    faction_id: rel.faction_id,
    target_faction_id: rel.target_faction_id,
  });
}
</script>
