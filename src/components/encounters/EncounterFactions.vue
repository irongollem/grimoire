<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
        Factions
      </h2>
      <button
        type="button"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
        @click="addCustomFaction"
      >
        <IconAdd class="h-3.5 w-3.5" />
        Add Custom
      </button>
    </div>

    <div class="flex flex-col gap-2">
      <div
        v-for="faction in localFactions"
        :key="faction.id"
        class="flex flex-col gap-2 rounded-md border border-border p-3"
      >
        <div class="flex items-center gap-2">
          <!-- Color swatch / picker -->
          <div
            class="w-4 h-4 rounded-full shrink-0 border border-border/50 cursor-pointer overflow-hidden relative"
            :style="{ backgroundColor: faction.color }"
            :title="faction.color"
          >
            <input
              v-if="isCustomFaction(faction.id)"
              type="color"
              :value="faction.color"
              class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              @input="(e) => updateFactionColor(faction.id, (e.target as HTMLInputElement).value)"
            />
          </div>

          <!-- Name -->
          <input
            v-if="isCustomFaction(faction.id)"
            v-model="faction.name"
            type="text"
            class="flex-1 bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="emitFactions"
          />
          <span v-else class="flex-1 font-cinzel text-sm font-semibold text-foreground">
            {{ faction.name }}
          </span>

          <!-- Remove custom -->
          <button
            v-if="isCustomFaction(faction.id)"
            type="button"
            class="text-muted-foreground hover:text-destructive transition-colors"
            @click="removeCustomFaction(faction.id)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Hostile to chips -->
        <div class="flex flex-wrap gap-1">
          <span class="font-cinzel text-[10px] text-muted-foreground self-center mr-1">Hostile to:</span>
          <button
            v-for="other in localFactions.filter((f) => f.id !== faction.id)"
            :key="other.id"
            type="button"
            class="px-2 py-0.5 rounded-full font-cinzel text-[10px] font-semibold border transition-colors"
            :class="
              faction.hostile_to.includes(other.id)
                ? 'bg-destructive/20 border-destructive/50 text-destructive'
                : 'bg-muted border-border text-muted-foreground hover:border-primary/40'
            "
            @click="toggleFactionHostility(faction.id, other.id)"
          >
            {{ other.name }}
          </button>
          <span v-if="faction.hostile_to.length === 0" class="font-fell text-[11px] text-muted-foreground italic">
            None
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconAdd, IconClose } from '@/lib/icons';
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { FactionDef } from "@/types/encounter.types";

const props = defineProps<{
  factions: FactionDef[];
}>();

const emit = defineEmits<{
  "update:factions": [factions: FactionDef[]];
}>();

const DEFAULT_FACTION_IDS = new Set(DEFAULT_FACTIONS.map((f) => f.id));

const localFactions = ref<FactionDef[]>(props.factions.map((f) => ({ ...f, hostile_to: [...f.hostile_to] })));

watch(
  () => props.factions,
  (next) => {
    const nextIds = next.map((f) => f.id).join(",");
    const localIds = localFactions.value.map((f) => f.id).join(",");
    if (nextIds !== localIds) {
      localFactions.value = next.map((f) => ({ ...f, hostile_to: [...f.hostile_to] }));
    }
  },
);

function emitFactions() {
  emit(
    "update:factions",
    localFactions.value.map((f) => ({ ...f, hostile_to: [...f.hostile_to] })),
  );
}

function isCustomFaction(id: string): boolean {
  return !DEFAULT_FACTION_IDS.has(id);
}

function addCustomFaction() {
  localFactions.value.push({
    id: crypto.randomUUID(),
    name: "Custom Faction",
    color: "#4A3A1A",
    hostile_to: [],
  });
  emitFactions();
}

function removeCustomFaction(id: string) {
  const idx = localFactions.value.findIndex((f) => f.id === id);
  if (idx >= 0) {
    localFactions.value.splice(idx, 1);
    emitFactions();
  }
}

function updateFactionColor(factionId: string, color: string) {
  const faction = localFactions.value.find((f) => f.id === factionId);
  if (faction) {
    faction.color = color;
    emitFactions();
  }
}

function toggleFactionHostility(factionId: string, targetId: string) {
  const faction = localFactions.value.find((f) => f.id === factionId);
  if (!faction) return;
  const idx = faction.hostile_to.indexOf(targetId);
  if (idx >= 0) faction.hostile_to.splice(idx, 1);
  else faction.hostile_to.push(targetId);
  emitFactions();
}
</script>
