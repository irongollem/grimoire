<template>
  <div>
    <!-- Top action bar -->
    <div class="flex flex-wrap items-center gap-2 mb-6">
      <RouterLink
        to="/encounters"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft class="h-3.5 w-3.5" />
        All Encounters
      </RouterLink>

      <div class="ml-auto flex items-center gap-2">
        <!-- In-progress badge -->
        <span v-if="thisIsLive" class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/15 border border-green-500/30 font-cinzel text-xs font-semibold text-green-500 tracking-wider animate-pulse">
          ● In Progress
        </span>

        <button
          v-if="props.encounter"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          :disabled="deleteEncounter.isPending.value"
          @click="handleDelete"
        >
          <X class="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
          :disabled="isSaving"
          @click="handleSave"
        >
          <span v-if="isSaving">Saving…</span>
          <span v-else>Save</span>
        </button>

        <!-- This encounter is live: Resume / Restart / Stop -->
        <template v-if="thisIsLive">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
            @click="handleRestart"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            Restart
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            @click="handleStop"
          >
            <Square class="h-3.5 w-3.5" />
            Stop
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
            @click="handleRunEncounter"
          >
            <Play class="h-3.5 w-3.5" />
            Resume
          </button>
        </template>

        <!-- No encounter running or another is running -->
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          :disabled="isSaving"
          @click="handleRunEncounter"
        >
          <Play class="h-3.5 w-3.5" />
          Run Encounter
        </button>
      </div>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Left column (col-span-2) -->
      <div class="xl:col-span-2 flex flex-col gap-6">
        <!-- Name + Description -->
        <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">Details</h2>
          <div class="flex flex-col gap-3">
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">
                ENCOUNTER NAME
              </label>
              <input
                v-model="form.name"
                type="text"
                placeholder="Name your encounter…"
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">
                DESCRIPTION
              </label>
              <textarea
                v-model="form.description"
                rows="2"
                placeholder="Scene-setting notes, terrain, objectives…"
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          </div>
        </div>

        <!-- Party Members -->
        <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
            Party Members
          </h2>
          <div v-if="partyLoading" class="flex justify-center py-4">
            <LoadingSpinner />
          </div>
          <p v-else-if="!party?.length" class="font-fell text-sm text-muted-foreground italic">
            No party members found. Add heroes in the Party Tracker first.
          </p>
          <div v-else class="flex flex-col gap-2">
            <label
              v-for="member in party"
              :key="member.id"
              class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
              :class="form.party_member_ids.includes(member.id) ? 'border-primary/50 bg-primary/5' : ''"
            >
              <input
                type="checkbox"
                :checked="form.party_member_ids.includes(member.id)"
                class="accent-primary"
                @change="togglePartyMember(member.id)"
              />
              <div class="flex-1 min-w-0">
                <span class="font-cinzel text-sm font-semibold text-foreground">{{ member.name }}</span>
                <span class="ml-2 font-fell text-xs text-muted-foreground italic">
                  {{ [member.race, member.class, member.level ? `Lv${member.level}` : ''].filter(Boolean).join(' · ') }}
                </span>
              </div>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                Lv {{ member.level }}
              </span>
            </label>

            <!-- Companions -->
            <template v-if="companions?.length">
              <div class="mt-1 mb-0.5 flex items-center gap-2">
                <div class="h-px flex-1 bg-border" />
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase shrink-0">Companions</span>
                <div class="h-px flex-1 bg-border" />
              </div>
              <label
                v-for="comp in companions"
                :key="comp.id"
                class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
                :class="form.companion_ids.includes(comp.id) ? 'border-primary/50 bg-primary/5' : ''"
              >
                <input
                  type="checkbox"
                  :checked="form.companion_ids.includes(comp.id)"
                  class="accent-primary"
                  @change="toggleCompanion(comp.id)"
                />
                <div class="flex-1 min-w-0">
                  <span class="font-cinzel text-sm font-semibold text-foreground">{{ comp.name }}</span>
                  <span class="ml-2 font-fell text-xs text-muted-foreground italic capitalize">
                    {{ comp.companion_type.replace('_', ' ') }}
                  </span>
                </div>
                <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                  {{ comp.current_hp }}/{{ comp.max_hp }} HP
                </span>
              </label>
            </template>
          </div>
        </div>

        <!-- Combatants -->
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
          <div v-if="showNpcSearch" class="rounded-md border border-border bg-muted p-3 flex flex-col gap-2">
            <div class="relative">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                v-model="npcSearch"
                type="text"
                placeholder="Search NPCs…"
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
                  CR {{ npc.stat_block?.challenge_rating ?? '—' }}
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
          <div v-if="showMonsterSearch" class="rounded-md border border-border bg-muted p-3 flex flex-col gap-2">
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
              <button
                v-for="monster in filteredMonsters"
                :key="monster.id"
                type="button"
                class="flex items-center justify-between px-3 py-2 rounded-md hover:bg-card transition-colors text-left"
                @click="addMonsterToCombatants(monster)"
              >
                <span class="font-fell text-sm text-foreground">{{ monster.name }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground">
                  CR {{ monster.stat_block.challenge_rating }}
                </span>
              </button>
            </div>
            <p v-else-if="monsterSearch" class="font-fell text-xs text-muted-foreground italic text-center py-2">
              No monsters match.
            </p>
          </div>

          <!-- Combatant entries -->
          <div v-if="form.combatants.length" class="flex flex-col gap-2">
            <div
              v-for="entry in form.combatants"
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
                  <span class="ml-2 font-cinzel text-[10px] text-muted-foreground">
                    {{ combatantCrLine(entry) }}
                  </span>
                </div>
              </div>

              <!-- Custom name -->
              <input
                v-model="entry.custom_name"
                type="text"
                placeholder="Custom name (optional)"
                class="w-36 bg-card border border-border rounded px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />

              <!-- Count -->
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click="entry.count = Math.max(1, entry.count - 1)"
                >
                  <Minus class="h-3 w-3" />
                </button>
                <span class="font-cinzel text-sm font-bold text-foreground w-6 text-center">{{ entry.count }}</span>
                <button
                  type="button"
                  class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click="entry.count = Math.min(20, entry.count + 1)"
                >
                  <Plus class="h-3 w-3" />
                </button>
              </div>

              <!-- Faction selector -->
              <select
                v-model="entry.faction_id"
                class="bg-card border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option v-for="faction in allFactions" :key="faction.id" :value="faction.id">
                  {{ faction.name }}
                </option>
              </select>

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
      </div>

      <!-- Right column -->
      <div class="flex flex-col gap-6">
        <!-- Calendar Pins -->
        <EntityCalendarSection
          entity-type="encounter"
          :entity-id="props.encounter?.id ?? null"
          :entity-name="form.name || 'Untitled Encounter'"
        />
        <!-- Difficulty Analysis -->
        <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
            Difficulty Analysis
          </h2>

          <!-- Difficulty badge -->
          <div class="flex items-center justify-center py-3">
            <span
              class="px-6 py-2 rounded-lg font-cinzel text-xl font-bold text-white shadow"
              :style="{ backgroundColor: DIFFICULTY_COLORS[difficulty.label] }"
            >
              {{ difficulty.label }}
            </span>
          </div>

          <!-- XP breakdown -->
          <div class="flex flex-col gap-1.5 font-cinzel text-xs">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Enemy XP</span>
              <span class="font-bold text-foreground">{{ difficulty.rawXp.toLocaleString() }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Multiplier</span>
              <span class="font-bold text-foreground">× {{ difficulty.multiplier }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Adjusted XP</span>
              <span class="font-bold text-foreground">{{ difficulty.adjustedXp.toLocaleString() }}</span>
            </div>
            <template v-if="difficulty.allyAdjustedXp > 0">
              <div class="flex justify-between">
                <span class="text-muted-foreground">
                  Ally offset
                  <span class="text-[10px]">(× {{ difficulty.allyMultiplier }})</span>
                </span>
                <span class="font-bold text-green-500">− {{ difficulty.allyAdjustedXp.toLocaleString() }}</span>
              </div>
              <div class="flex justify-between border-t border-border pt-1.5 mt-0.5">
                <span class="text-muted-foreground">Net XP</span>
                <span class="font-bold text-primary">{{ difficulty.netXp.toLocaleString() }}</span>
              </div>
            </template>
            <div v-else class="flex justify-between border-t border-border pt-1.5 mt-0.5">
              <span class="text-muted-foreground">Net XP</span>
              <span class="font-bold text-primary">{{ difficulty.adjustedXp.toLocaleString() }}</span>
            </div>
          </div>

          <!-- Threshold bars -->
          <div v-if="difficulty.partyThresholds.deadly > 0" class="flex flex-col gap-2">
            <div class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">PARTY THRESHOLDS</div>
            <div
              v-for="tier in thresholdTiers"
              :key="tier.label"
              class="flex items-center gap-2"
            >
              <span class="font-cinzel text-[10px] w-14 shrink-0" :style="{ color: tier.color }">{{ tier.label }}</span>
              <div class="flex-1 h-2 rounded-full bg-muted overflow-hidden relative">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :style="{ width: `${tier.pct}%`, backgroundColor: tier.color }"
                />
                <!-- XP marker -->
                <div
                  v-if="difficulty.netXp > 0 && markerPct(tier) > 0 && markerPct(tier) <= 100"
                  class="absolute top-0 h-full w-0.5 bg-white/80"
                  :style="{ left: `${markerPct(tier)}%` }"
                />
              </div>
              <span class="font-cinzel text-[10px] text-muted-foreground w-12 text-right shrink-0">
                {{ tier.value.toLocaleString() }}
              </span>
            </div>
          </div>

          <!-- Enemy breakdown -->
          <div v-if="enemyEntries.length" class="flex flex-col gap-1 border-t border-border pt-3">
            <div class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">ENEMY BREAKDOWN</div>
            <div
              v-for="entry in enemyEntries"
              :key="entry.id"
              class="flex items-center justify-between font-cinzel text-[11px]"
            >
              <span class="text-foreground line-clamp-1 flex-1">
                {{ entry.name }}{{ entry.count > 1 ? ` ×${entry.count}` : '' }}
              </span>
              <span class="text-muted-foreground shrink-0 ml-2">
                CR {{ entry.cr }} · {{ (entry.xpEach * entry.count).toLocaleString() }} XP
              </span>
            </div>
          </div>
        </div>

        <!-- Factions -->
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
              <Plus class="h-3.5 w-3.5" />
              Add Custom
            </button>
          </div>

          <div class="flex flex-col gap-2">
            <div
              v-for="faction in allFactions"
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
                  <X class="h-3.5 w-3.5" />
                </button>
              </div>

              <!-- Hostile to chips -->
              <div class="flex flex-wrap gap-1">
                <span class="font-cinzel text-[10px] text-muted-foreground self-center mr-1">Hostile to:</span>
                <button
                  v-for="other in allFactions.filter(f => f.id !== faction.id)"
                  :key="other.id"
                  type="button"
                  class="px-2 py-0.5 rounded-full font-cinzel text-[10px] font-semibold border transition-colors"
                  :class="faction.hostile_to.includes(other.id)
                    ? 'bg-destructive/20 border-destructive/50 text-destructive'
                    : 'bg-muted border-border text-muted-foreground hover:border-primary/40'"
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import { ChevronLeft, Plus, X, Search, Play, Minus, RotateCcw, Square } from "lucide-vue-next";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { useNpcs } from "@/composables/useNpcs";
import { useCreateEncounter, useUpdateEncounter, useDeleteEncounter } from "@/composables/useEncounters";
import { useRunningEncounters, useEncounterLive } from "@/composables/useEncounterLive";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_FACTIONS,
  DIFFICULTY_COLORS,
  calculateDifficulty,
  crToXp,
} from "@/types/encounter.types";
import type { Encounter, CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";

const props = defineProps<{
  encounter: Encounter | null;
}>();

const router = useRouter();
const { data: monsters } = useAllMonsters();
const { data: party, isLoading: partyLoading } = useParty();
const { data: companions } = useCompanions();
const { data: npcs } = useNpcs();
const createEncounter = useCreateEncounter();
const updateEncounterMutation = useUpdateEncounter();
const deleteEncounter = useDeleteEncounter();

const { runningStates, isEncounterRunning, firstRunning } = useRunningEncounters();
const { endLive } = useEncounterLive(props.encounter?.id ?? "");

const thisIsLive = computed(() => !!props.encounter && isEncounterRunning(props.encounter.id));
const otherIsLive = computed(() => firstRunning.value !== null && !thisIsLive.value);
const otherName = computed(() => {
  if (!otherIsLive.value || !firstRunning.value) return "";
  return runningStates.value.find(() => true) ? (firstRunning.value!.encounter_id) : "another encounter";
});

// Form state
const form = reactive({
  name: props.encounter?.name ?? "New Encounter",
  description: props.encounter?.description ?? "",
  party_member_ids: [...(props.encounter?.party_member_ids ?? [])],
  companion_ids: [...(props.encounter?.companion_ids ?? [])],
  combatants: [...(props.encounter?.combatants ?? [])] as CombatantDef[],
  factions: props.encounter?.factions?.length
    ? [...props.encounter.factions]
    : [...DEFAULT_FACTIONS],
});

watch(
  () => props.encounter,
  (enc) => {
    if (!enc) return;
    form.name = enc.name;
    form.description = enc.description ?? "";
    form.party_member_ids = [...enc.party_member_ids];
    form.companion_ids = [...(enc.companion_ids ?? [])];
    form.combatants = [...enc.combatants];
    form.factions = enc.factions?.length ? [...enc.factions] : [...DEFAULT_FACTIONS];
  },
);

// Monster search
const showMonsterSearch = ref(false);
const monsterSearch = ref("");

const filteredMonsters = computed(() => {
  const q = monsterSearch.value.toLowerCase().trim();
  const all = monsters.value ?? [];
  if (!q) return all.slice(0, 10);
  return all.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 10);
});

function addMonsterToCombatants(monster: Monster) {
  form.combatants.push({
    id: crypto.randomUUID(),
    monster_id: monster.id,
    npc_id: null,
    count: 1,
    faction_id: "enemy",
    custom_name: null,
  });
  monsterSearch.value = "";
  showMonsterSearch.value = false;
}

// NPC search
const showNpcSearch = ref(false);
const npcSearch = ref("");

const filteredNpcs = computed(() => {
  const q = npcSearch.value.toLowerCase().trim();
  const all = (npcs.value ?? []).filter((n) => n.stat_block);
  if (!q) return all.slice(0, 10);
  return all.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 10);
});

function addNpcToCombatants(npc: Npc) {
  form.combatants.push({
    id: crypto.randomUUID(),
    monster_id: null,
    npc_id: npc.id,
    count: 1,
    faction_id: "ally",
    custom_name: null,
  });
  npcSearch.value = "";
  showNpcSearch.value = false;
}

function removeCombatant(id: string) {
  const idx = form.combatants.findIndex((c) => c.id === id);
  if (idx >= 0) form.combatants.splice(idx, 1);
}

// Monster lookup helpers
const monsterMap = computed(() => new Map((monsters.value ?? []).map((m) => [m.id, m])));

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

// NPC lookup helpers
const npcMap = computed(() => new Map((npcs.value ?? []).map((n) => [n.id, n])));

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

// Party member selection
function togglePartyMember(memberId: string) {
  const idx = form.party_member_ids.indexOf(memberId);
  if (idx >= 0) form.party_member_ids.splice(idx, 1);
  else form.party_member_ids.push(memberId);
}

function toggleCompanion(companionId: string) {
  const idx = form.companion_ids.indexOf(companionId);
  if (idx >= 0) form.companion_ids.splice(idx, 1);
  else form.companion_ids.push(companionId);
}

// Factions
const DEFAULT_FACTION_IDS = new Set(DEFAULT_FACTIONS.map((f) => f.id));

const allFactions = computed(() => form.factions);

function isCustomFaction(id: string): boolean {
  return !DEFAULT_FACTION_IDS.has(id);
}

function factionColor(factionId: string): string {
  return form.factions.find((f) => f.id === factionId)?.color ?? "#3D3D3D";
}

function addCustomFaction() {
  form.factions.push({
    id: crypto.randomUUID(),
    name: "Custom Faction",
    color: "#4A3A1A",
    hostile_to: [],
  });
}

function removeCustomFaction(id: string) {
  const idx = form.factions.findIndex((f) => f.id === id);
  if (idx >= 0) form.factions.splice(idx, 1);
}

function toggleFactionHostility(factionId: string, targetId: string) {
  const faction = form.factions.find((f) => f.id === factionId);
  if (!faction) return;
  const idx = faction.hostile_to.indexOf(targetId);
  if (idx >= 0) faction.hostile_to.splice(idx, 1);
  else faction.hostile_to.push(targetId);
}

function updateFactionColor(factionId: string, color: string) {
  const faction = form.factions.find((f) => f.id === factionId);
  if (faction) faction.color = color;
}

// Difficulty calculation
const enemyFactionIds = computed(() => {
  const ids = new Set<string>(["enemy"]);
  form.factions.forEach((f) => {
    if (f.hostile_to.includes("players")) ids.add(f.id);
  });
  return ids;
});

const enemyEntries = computed(() =>
  form.combatants
    .filter((c) => enemyFactionIds.value.has(c.faction_id))
    .map((c) => ({
      id: c.id,
      name: combatantLabel(c),
      cr: c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id),
      count: c.count,
      xpEach: c.npc_id ? npcCrXp(c.npc_id) : crXp(c.monster_id),
    })),
);

const partyLevels = computed(() => {
  const members = party.value ?? [];
  return form.party_member_ids
    .map((id) => members.find((m) => m.id === id)?.level ?? 1);
});

// Any faction hostile to at least one enemy faction is fighting on the party's side
const allyFactionIds = computed(() => {
  const ids = new Set<string>();
  for (const faction of form.factions) {
    if (faction.id === "players") continue; // already counted via partyLevels
    if (faction.hostile_to.some((id) => enemyFactionIds.value.has(id))) {
      ids.add(faction.id);
    }
  }
  return ids;
});

// Ally entries for difficulty — combatants on the party's side + selected companions (with CR lookup)
const allyEntries = computed(() => {
  const entries: { cr: string | null | undefined; count: number }[] = [];

  // Combatants in ally factions (monsters or NPCs)
  for (const c of form.combatants.filter((c) => allyFactionIds.value.has(c.faction_id))) {
    const cr = c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id);
    entries.push({ cr, count: c.count });
  }

  // Selected companions — look up their source CR
  for (const compId of form.companion_ids) {
    const comp = (companions.value ?? []).find((c) => c.id === compId);
    if (!comp) continue;
    let cr: string | null = null;
    if (comp.source_monster_id) {
      cr = monsterMap.value.get(comp.source_monster_id)?.stat_block.challenge_rating ?? null;
    } else if (comp.source_npc_id) {
      cr = npcMap.value.get(comp.source_npc_id)?.stat_block?.challenge_rating ?? null;
    }
    entries.push({ cr, count: 1 });
  }

  return entries;
});

const difficulty = computed(() =>
  calculateDifficulty(
    enemyEntries.value.map((e) => ({ cr: e.cr, count: e.count })),
    partyLevels.value.length ? partyLevels.value : [3],
    allyEntries.value,
  ),
);

const thresholdTiers = computed(() => {
  const t = difficulty.value.partyThresholds;
  const max = t.deadly * 1.5 || 1;
  return [
    { label: "Easy",   value: t.easy,   color: "#16A34A", pct: Math.min(100, (t.easy   / max) * 100) },
    { label: "Medium", value: t.medium, color: "#CA8A04", pct: Math.min(100, (t.medium / max) * 100) },
    { label: "Hard",   value: t.hard,   color: "#EA580C", pct: Math.min(100, (t.hard   / max) * 100) },
    { label: "Deadly", value: t.deadly, color: "#DC2626", pct: Math.min(100, (t.deadly / max) * 100) },
  ];
});

function markerPct(_tier: { value: number }): number {
  const max = difficulty.value.partyThresholds.deadly * 1.5 || 1;
  return Math.min(100, (difficulty.value.netXp / max) * 100);
}

// Save / Delete / Run
const isSaving = computed(() => createEncounter.isPending.value || updateEncounterMutation.isPending.value);

async function buildPayload() {
  return {
    name: form.name || "New Encounter",
    description: form.description || null,
    party_member_ids: form.party_member_ids,
    companion_ids: form.companion_ids,
    combatants: form.combatants,
    factions: form.factions,
  };
}

async function handleSave(): Promise<string | null> {
  const payload = await buildPayload();
  if (props.encounter) {
    await updateEncounterMutation.mutateAsync({ id: props.encounter.id, update: payload });
    return props.encounter.id;
  } else {
    const created = await createEncounter.mutateAsync(payload);
    router.replace(`/encounters/${created.id}`);
    return created.id;
  }
}

async function handleRunEncounter() {
  if (otherIsLive.value && firstRunning.value) {
    if (!confirm(`"${otherName.value}" is currently active. Stop it and run this one?`)) return;
    await supabase.from("encounter_state")
      .update({ is_running: false })
      .eq("encounter_id", firstRunning.value.encounter_id);
  }
  const id = await handleSave();
  if (id) router.push(`/encounters/${id}/run`);
}

async function handleStop() {
  if (!confirm("Stop this encounter? Party stats will NOT be updated.")) return;
  await endLive();
}

async function handleRestart() {
  if (!confirm("Restart this encounter from scratch?")) return;
  await endLive();
  router.push(`/encounters/${props.encounter!.id}/run`);
}

async function handleDelete() {
  if (!props.encounter) return;
  if (!confirm(`Delete encounter "${props.encounter.name}"? This cannot be undone.`)) return;
  await deleteEncounter.mutateAsync(props.encounter.id);
  router.push("/encounters");
}
</script>
