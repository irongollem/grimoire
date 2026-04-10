<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
        Combatants
      </h2>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
          @click="showNpcSearch = !showNpcSearch; showMonsterSearch = false"
        >
          <Plus class="h-3.5 w-3.5" />
          Add NPC
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
          @click="showMonsterSearch = !showMonsterSearch; showNpcSearch = false"
        >
          <Plus class="h-3.5 w-3.5" />
          Add Monster
        </button>
      </div>
    </div>

    <!-- NPC search panel -->
    <div
      v-if="showNpcSearch"
      class="rounded-md border border-border bg-muted p-3 flex flex-col gap-2"
    >
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="npcSearch"
          type="text"
          placeholder="Search NPCs with a combat profile…"
          autofocus
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div v-if="filteredNpcs.length" class="max-h-48 overflow-y-auto flex flex-col gap-1">
        <button
          v-for="npc in filteredNpcs"
          :key="npc.id"
          type="button"
          class="flex items-center justify-between px-3 py-2 rounded-md hover:bg-card transition-colors text-left"
          @click="addNpcToCombatants(npc)"
        >
          <span class="font-fell text-sm text-foreground">{{ npc.name }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground">
            CR {{ npc.stat_block?.challenge_rating ?? "—" }}
          </span>
        </button>
      </div>
      <p v-else-if="npcSearch" class="font-fell text-xs text-muted-foreground italic text-center py-2">
        No NPCs match.
      </p>
      <p v-else class="font-fell text-xs text-muted-foreground italic text-center py-2">
        Only NPCs with stat blocks are listed.
      </p>
    </div>

    <!-- Monster search panel -->
    <div
      v-if="showMonsterSearch"
      class="rounded-md border border-border bg-muted p-3 flex flex-col gap-2"
    >
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="monsterSearch"
          type="text"
          placeholder="Search monsters…"
          autofocus
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div v-if="filteredMonsters.length" class="max-h-48 overflow-y-auto flex flex-col gap-1">
        <div
          v-for="monster in filteredMonsters"
          :key="monster.id"
          class="flex items-center gap-1 group rounded-md hover:bg-card transition-colors"
        >
          <button
            type="button"
            class="flex-1 flex items-center justify-between px-3 py-2 text-left"
            @click="addMonsterToCombatants(monster)"
          >
            <span class="font-fell text-sm text-foreground">{{ monster.name }}</span>
            <span class="font-cinzel text-[10px] text-muted-foreground">
              CR {{ monster.stat_block.challenge_rating }} · AC {{ monster.stat_block.armor_class }} · {{ monster.stat_block.speed }}
            </span>
          </button>
          <button
            type="button"
            :title="props.excludedMonsterIds.has(monster.id) ? 'Show in search' : 'Hide from search'"
            class="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-2 text-muted-foreground hover:text-destructive shrink-0"
            @click.stop="emit('hideMonster', monster.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p v-else-if="monsterSearch" class="font-fell text-xs text-muted-foreground italic text-center py-2">
        No monsters match.
      </p>
    </div>

    <!-- Combatant entries -->
    <div v-if="localCombatants.length" class="flex flex-col gap-2">
      <div
        v-for="entry in localCombatants"
        :key="entry.id"
        class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 p-3"
      >
        <!-- Combatant info -->
        <div class="flex-1 min-w-0 flex items-center gap-2">
          <div
            class="shrink-0 w-1.5 h-8 rounded-full"
            :style="{ backgroundColor: factionColor(entry.faction_id) }"
          />
          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-sm font-semibold text-foreground line-clamp-1">
              {{ combatantLabel(entry) }}
            </span>
            <div class="flex flex-wrap gap-x-2 gap-y-0">
              <span class="font-cinzel text-[10px] text-muted-foreground">
                {{ combatantCrLine(entry) }}
              </span>
              <span v-if="combatantAc(entry)" class="font-cinzel text-[10px] text-muted-foreground">
                AC {{ combatantAc(entry) }}
              </span>
              <span v-if="combatantSpeed(entry)" class="font-cinzel text-[10px] text-muted-foreground">
                {{ combatantSpeed(entry) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Custom name -->
        <input
          v-model="entry.custom_name"
          type="text"
          placeholder="Custom name (optional)"
          class="w-36 bg-card border border-border rounded px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="emitCombatants"
        />

        <!-- Count -->
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="changeCount(entry, -1)"
          >
            <Minus class="h-3 w-3" />
          </button>
          <span class="font-cinzel text-sm font-bold text-foreground w-6 text-center">{{ entry.count }}</span>
          <button
            type="button"
            class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="changeCount(entry, 1)"
          >
            <Plus class="h-3 w-3" />
          </button>
        </div>

        <!-- Faction selector -->
        <EntityCombobox
          :model-value="entry.faction_id"
          :options="props.factions"
          placeholder="Faction…"
          class="w-36 shrink-0"
          @update:model-value="entry.faction_id = $event; emitCombatants()"
        />

        <!-- Remove -->
        <button
          type="button"
          class="text-muted-foreground hover:text-destructive transition-colors"
          @click="removeCombatant(entry.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>

    <p v-else class="font-fell text-sm text-muted-foreground italic text-center py-4">
      No combatants added yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Plus, X, Search, Minus } from "lucide-vue-next";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import type { CombatantDef, FactionDef } from "@/types/encounter.types";
import { crToXp } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

const props = defineProps<{
  combatants: CombatantDef[];
  factions: FactionDef[];
  monsters: Monster[];
  npcs: Npc[];
  excludedMonsterIds: Set<string>;
}>();

const emit = defineEmits<{
  "update:combatants": [combatants: CombatantDef[]];
  hideMonster: [monsterId: string];
}>();

// Local mutable copy so we can do in-place edits before emitting
const localCombatants = ref<CombatantDef[]>(props.combatants.map((c) => ({ ...c })));

watch(
  () => props.combatants,
  (next) => {
    // Only sync from parent if the IDs changed (avoid clobbering in-progress edits)
    const nextIds = next.map((c) => c.id).join(",");
    const localIds = localCombatants.value.map((c) => c.id).join(",");
    if (nextIds !== localIds) {
      localCombatants.value = next.map((c) => ({ ...c }));
    }
  },
);

function emitCombatants() {
  emit("update:combatants", localCombatants.value.map((c) => ({ ...c })));
}

// Monster lookup
const monsterMap = computed(() => new Map(props.monsters.map((m) => [m.id, m])));
const npcMap = computed(() => new Map(props.npcs.map((n) => [n.id, n])));

function monsterName(monsterId: string | null): string {
  if (!monsterId) return "Unknown";
  return monsterMap.value.get(monsterId)?.name ?? "Unknown";
}

function monsterCr(monsterId: string | null): string {
  if (!monsterId) return "0";
  return monsterMap.value.get(monsterId)?.stat_block.challenge_rating ?? "0";
}

function crXp(monsterId: string | null): number {
  if (!monsterId) return 0;
  return crToXp(monsterMap.value.get(monsterId)?.stat_block.challenge_rating);
}

function npcName(npcId: string | null): string {
  if (!npcId) return "Unknown";
  return npcMap.value.get(npcId)?.name ?? "Unknown";
}

function npcCr(npcId: string | null): string {
  if (!npcId) return "0";
  return npcMap.value.get(npcId)?.stat_block?.challenge_rating ?? "0";
}

function npcCrXp(npcId: string | null): number {
  if (!npcId) return 0;
  return crToXp(npcMap.value.get(npcId)?.stat_block?.challenge_rating);
}

function combatantLabel(entry: CombatantDef): string {
  if (entry.npc_id) return entry.custom_name || npcName(entry.npc_id);
  return entry.custom_name || monsterName(entry.monster_id);
}

function combatantCrLine(entry: CombatantDef): string {
  if (entry.npc_id) {
    const cr = npcCr(entry.npc_id);
    const xp = npcCrXp(entry.npc_id) * entry.count;
    return `CR ${cr} · ${xp} XP`;
  }
  const cr = monsterCr(entry.monster_id);
  const xp = crXp(entry.monster_id) * entry.count;
  return `CR ${cr} · ${xp} XP`;
}

function combatantAc(entry: CombatantDef): number | null {
  if (entry.npc_id) return npcMap.value.get(entry.npc_id)?.stat_block?.armor_class ?? null;
  return monsterMap.value.get(entry.monster_id ?? "")?.stat_block?.armor_class ?? null;
}

function combatantSpeed(entry: CombatantDef): string | null {
  if (entry.npc_id) return npcMap.value.get(entry.npc_id)?.stat_block?.speed ?? null;
  return monsterMap.value.get(entry.monster_id ?? "")?.stat_block?.speed ?? null;
}

function factionColor(factionId: string): string {
  return props.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}

function changeCount(entry: CombatantDef, delta: number) {
  entry.count = Math.max(1, Math.min(20, entry.count + delta));
  emitCombatants();
}

function removeCombatant(id: string) {
  const idx = localCombatants.value.findIndex((c) => c.id === id);
  if (idx >= 0) {
    localCombatants.value.splice(idx, 1);
    emitCombatants();
  }
}

// NPC search
const showNpcSearch = ref(false);
const npcSearch = ref("");

const filteredNpcs = computed(() => {
  const q = npcSearch.value.toLowerCase().trim();
  const all = props.npcs.filter((n) => n.stat_block);
  if (!q) return all.slice(0, 10);
  return all.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 10);
});

function addNpcToCombatants(npc: Npc) {
  const factionId =
    (npc.relationship === "unknown" ? "neutral" : npc.relationship) ?? "neutral";
  localCombatants.value.push({
    id: crypto.randomUUID(),
    monster_id: null,
    npc_id: npc.id,
    count: 1,
    faction_id: factionId,
    custom_name: null,
  });
  npcSearch.value = "";
  showNpcSearch.value = false;
  emitCombatants();
}

// Monster search
const showMonsterSearch = ref(false);
const monsterSearch = ref("");

const filteredMonsters = computed(() => {
  const q = monsterSearch.value.toLowerCase().trim();
  const all = props.monsters.filter((m) => !props.excludedMonsterIds.has(m.id));
  if (!q) return all.slice(0, 10);
  return all.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 10);
});

function addMonsterToCombatants(monster: Monster) {
  localCombatants.value.push({
    id: crypto.randomUUID(),
    monster_id: monster.id,
    npc_id: null,
    count: 1,
    faction_id: "enemy",
    custom_name: null,
  });
  monsterSearch.value = "";
  showMonsterSearch.value = false;
  emitCombatants();
}
</script>
