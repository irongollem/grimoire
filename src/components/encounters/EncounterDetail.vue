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
        <span
          v-if="thisIsLive"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/15 border border-green-500/30 font-cinzel text-xs font-semibold text-green-500 tracking-wider animate-pulse"
        >
          ● In Progress
        </span>

        <!-- Mark finished / reopen -->
        <button
          v-if="props.encounter"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-cinzel text-xs font-semibold transition-colors"
          :class="
            props.encounter.is_finished
              ? 'border-border text-muted-foreground hover:text-foreground'
              : 'border-primary/40 text-primary hover:bg-primary/10'
          "
          @click="toggleFinished"
        >
          <CheckCheck class="h-3.5 w-3.5" />
          {{ props.encounter.is_finished ? "Reopen" : "Mark Done" }}
        </button>

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
        <div
          class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4"
        >
          <h2
            class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase"
          >
            Details
          </h2>
          <div class="flex flex-col gap-3">
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
              >
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
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
              >
                DESCRIPTION
              </label>
              <RichTextEditor
                v-model="form.description"
                placeholder="Scene-setting notes, terrain, objectives…"
                min-height="120px"
              />
            </div>
            <div>
              <label
                class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1"
              >
                LOCATION
              </label>
              <EntityCombobox
                :model-value="form.location_id ?? ''"
                :options="allLocations ?? []"
                placeholder="— no location —"
                @update:model-value="form.location_id = $event || null"
              />
            </div>
          </div>
        </div>

        <!-- Party Members -->
        <div
          class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4"
        >
          <h2
            class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase"
          >
            Party Members
          </h2>
          <div v-if="partyLoading" class="flex justify-center py-4">
            <LoadingSpinner />
          </div>
          <p
            v-else-if="!party?.length"
            class="font-fell text-sm text-muted-foreground italic"
          >
            No party members found. Add heroes in the Party Tracker first.
          </p>
          <div v-else class="flex flex-col gap-2">
            <label
              v-for="member in party"
              :key="member.id"
              class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
              :class="
                form.party_member_ids.includes(member.id)
                  ? 'border-primary/50 bg-primary/5'
                  : ''
              "
            >
              <input
                type="checkbox"
                :checked="form.party_member_ids.includes(member.id)"
                class="accent-primary"
                @change="togglePartyMember(member.id)"
              />
              <div class="flex-1 min-w-0">
                <span
                  class="font-cinzel text-sm font-semibold text-foreground"
                  >{{ member.name }}</span
                >
                <span
                  class="ml-2 font-fell text-xs text-muted-foreground italic"
                >
                  {{
                    [
                      member.race,
                      member.class,
                      member.level ? `Lv${member.level}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }}
                </span>
              </div>
              <span
                class="font-cinzel text-[10px] text-muted-foreground shrink-0"
              >
                Lv {{ member.level }}
              </span>
              <select
                v-if="form.party_member_ids.includes(member.id)"
                :value="form.party_member_factions[member.id] ?? 'players'"
                class="shrink-0 bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                :style="{
                  borderColor:
                    form.factions.find(
                      (f) =>
                        f.id ===
                        (form.party_member_factions[member.id] ?? 'players'),
                    )?.color ?? undefined,
                }"
                @click.stop
                @change="
                  (e) =>
                    setMemberFaction(
                      member.id,
                      (e.target as HTMLSelectElement).value,
                    )
                "
              >
                <option v-for="f in form.factions" :key="f.id" :value="f.id">
                  {{ f.name }}
                </option>
              </select>
            </label>

            <!-- Companions -->
            <template v-if="companions?.length">
              <div class="mt-1 mb-0.5 flex items-center gap-2">
                <div class="h-px flex-1 bg-border" />
                <span
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase shrink-0"
                  >Companions</span
                >
                <div class="h-px flex-1 bg-border" />
              </div>
              <label
                v-for="comp in companions"
                :key="comp.id"
                class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
                :class="
                  form.companion_ids.includes(comp.id)
                    ? 'border-primary/50 bg-primary/5'
                    : ''
                "
              >
                <input
                  type="checkbox"
                  :checked="form.companion_ids.includes(comp.id)"
                  class="accent-primary"
                  @change="toggleCompanion(comp.id)"
                />
                <div class="flex-1 min-w-0">
                  <span
                    class="font-cinzel text-sm font-semibold text-foreground"
                    >{{ comp.name }}</span
                  >
                  <span
                    class="ml-2 font-fell text-xs text-muted-foreground italic capitalize"
                  >
                    {{ comp.companion_type.replace("_", " ") }}
                  </span>
                </div>
                <span
                  class="font-cinzel text-[10px] text-muted-foreground shrink-0"
                >
                  {{ comp.current_hp }}/{{ comp.max_hp }} HP
                </span>
                <select
                  v-if="form.companion_ids.includes(comp.id)"
                  :value="form.party_member_factions[comp.id] ?? 'players'"
                  class="shrink-0 bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  :style="{
                    borderColor:
                      form.factions.find(
                        (f) =>
                          f.id ===
                          (form.party_member_factions[comp.id] ?? 'players'),
                      )?.color ?? undefined,
                  }"
                  @click.stop
                  @change="
                    (e) =>
                      setMemberFaction(
                        comp.id,
                        (e.target as HTMLSelectElement).value,
                      )
                  "
                >
                  <option v-for="f in form.factions" :key="f.id" :value="f.id">
                    {{ f.name }}
                  </option>
                </select>
              </label>
            </template>
          </div>
        </div>

        <!-- Combatants -->
        <EncounterCombatants
          v-model:combatants="form.combatants"
          :factions="form.factions"
          :monsters="monsters ?? []"
          :npcs="npcs ?? []"
          :excluded-monster-ids="excludedMonsterIds"
          @hide-monster="toggleHideMonster"
        />
      </div>

      <!-- Right column -->
      <div class="flex flex-col gap-6">
        <!-- Linked Quests (back-reference) -->
        <div
          v-if="linkedQuests?.length"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Part of Quest
              <span class="font-fell font-normal"
                >({{ linkedQuests.length }})</span
              >
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <RouterLink
              v-for="q in linkedQuests"
              :key="q.id"
              :to="`/quests/${q.id}`"
              class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors group"
            >
              <ScrollText class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span
                class="font-fell text-sm text-foreground flex-1 truncate group-hover:text-primary transition-colors"
              >
                {{ q.title || "Untitled Quest" }}
              </span>
            </RouterLink>
          </div>
        </div>
        <!-- Difficulty Analysis -->
        <EncounterDifficulty
          :difficulty="difficulty"
          :threshold-tiers="thresholdTiers"
          :enemy-entries="enemyEntries"
        />

        <!-- Events -->
        <EncounterEvents
          v-model:events="form.events"
          :combatants="form.combatants"
          :monsters="monsters ?? []"
          :factions="form.factions"
        />

        <!-- Loot -->
        <EncounterLoot
          :item-ids="form.item_ids"
          :all-items="allItems ?? []"
          :currency-pools="form.reward_currency_pools"
          :art-objects="form.art_objects"
          @update:item-ids="form.item_ids = $event"
          @update:currency-pools="form.reward_currency_pools = $event"
          @update:art-objects="form.art_objects = $event"
          @drop-pool="
            sendCurrencyDrop(
              $event.pp,
              $event.gp,
              $event.ep,
              $event.sp,
              $event.cp,
              $event.label || undefined,
            )
          "
          @drop-item="handleDropLootItem($event.item, $event.qty)"
          @drop-art-object="handleDropArtObject($event)"
        />

        <!-- Traps & Hazards -->
        <EncounterTraps
          :trap-ids="form.trap_ids"
          :all-traps="allTraps ?? []"
          @update:trap-ids="form.trap_ids = $event"
        />

        <!-- Calendar Pins -->
        <EntityCalendarSection
          entity-type="encounter"
          :entity-id="props.encounter?.id ?? null"
          :entity-name="form.name || 'Untitled Encounter'"
        />

        <!-- Factions -->
        <EncounterFactions v-model:factions="form.factions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { computed, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronLeft,
  X,
  Play,
  RotateCcw,
  Square,
  CheckCheck,
  ScrollText,
} from "lucide-vue-next";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useCompanions } from "@/composables/useCompanions";
import { useNpcs } from "@/composables/useNpcs";
import { useItems } from "@/composables/useItems";
import { useTraps } from "@/composables/useTraps";
import { useAllLocations } from "@/composables/useLocations";
import {
  useCreateEncounter,
  useUpdateEncounter,
  useDeleteEncounter,
} from "@/composables/useEncounters";
import {
  useRunningEncounters,
  useEncounterLive,
} from "@/composables/useEncounterLive";
import { useQuestsForEncounter } from "@/composables/useQuests";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_FACTIONS,
  calculateDifficulty,
  crToXp,
} from "@/types/encounter.types";
import type {
  Encounter,
  CombatantDef,
  EncounterEvent,
} from "@/types/encounter.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import EncounterCombatants from "@/components/encounters/EncounterCombatants.vue";
import EncounterDifficulty from "@/components/encounters/EncounterDifficulty.vue";
import EncounterEvents from "@/components/encounters/EncounterEvents.vue";
import EncounterFactions from "@/components/encounters/EncounterFactions.vue";
import EncounterLoot from "@/components/encounters/EncounterLoot.vue";
import EncounterTraps from "@/components/encounters/EncounterTraps.vue";

const props = defineProps<{
  encounter: Encounter | null;
}>();

const router = useRouter();
const campaign = useCampaignStore();
const { data: monsters } = useAllMonsters();
const { data: party, isLoading: partyLoading } = useParty();
const { data: companions } = useCompanions();
const { data: npcs } = useNpcs();
const { data: allItems } = useItems();
const { data: allTraps } = useTraps();
const { sendCurrencyDrop, sendItemDrop } = useCampaignMessages();
const { data: allLocations } = useAllLocations();
const { data: linkedQuests } = useQuestsForEncounter(
  computed(() => props.encounter?.id ?? ""),
);
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const excludedMonsterIds = computed(
  () => new Set(campaign.activeCampaign?.excluded_monster_ids ?? []),
);

async function toggleHideMonster(monsterId: string) {
  const cid = campaign.activeCampaignId;
  if (!cid || !campaign.activeCampaign) return;
  const current = campaign.activeCampaign.excluded_monster_ids ?? [];
  const next = current.includes(monsterId)
    ? current.filter((id) => id !== monsterId)
    : [...current, monsterId];
  await updateCampaign({ id: cid, update: { excluded_monster_ids: next } });
  campaign.activeCampaign = {
    ...campaign.activeCampaign,
    excluded_monster_ids: next,
  };
}

const createEncounter = useCreateEncounter();
const updateEncounterMutation = useUpdateEncounter();
const deleteEncounter = useDeleteEncounter();

const { runningStates, isEncounterRunning, firstRunning } =
  useRunningEncounters();
const { endLive } = useEncounterLive(props.encounter?.id ?? "");

const thisIsLive = computed(
  () => !!props.encounter && isEncounterRunning(props.encounter.id),
);
const otherIsLive = computed(
  () => firstRunning.value !== null && !thisIsLive.value,
);
const otherName = computed(() => {
  if (!otherIsLive.value || !firstRunning.value) return "";
  return runningStates.value.find(() => true)
    ? firstRunning.value!.encounter_id
    : "another encounter";
});

// Form state
const form = reactive({
  name: props.encounter?.name ?? "New Encounter",
  description: props.encounter?.description ?? "",
  location_id: props.encounter?.location_id ?? (null as string | null),
  party_member_ids: [...(props.encounter?.party_member_ids ?? [])],
  companion_ids: [...(props.encounter?.companion_ids ?? [])],
  party_member_factions: {
    ...(props.encounter?.party_member_factions),
  } as Record<string, string>,
  combatants: [...(props.encounter?.combatants ?? [])] as CombatantDef[],
  factions: props.encounter?.factions?.length
    ? [...props.encounter.factions]
    : [...DEFAULT_FACTIONS],
  item_ids: [...(props.encounter?.item_ids ?? [])],
  trap_ids: [...(props.encounter?.trap_ids ?? [])],
  reward_currency_pools: [
    ...(props.encounter?.reward_currency_pools ?? []),
  ] as import("@/types/quest.types").RewardCurrencyPool[],
  art_objects: [
    ...(props.encounter?.art_objects ?? []),
  ] as import("@/types/encounter.types").ArtObject[],
  events: [...(props.encounter?.events ?? [])] as EncounterEvent[],
});

// For new encounters, auto-select all party members once the party data loads
if (!props.encounter) {
  watch(
    party,
    (members) => {
      if (members?.length && !form.party_member_ids.length) {
        form.party_member_ids = members.map((m) => m.id);
      }
    },
    { immediate: true, once: true },
  );
}

// Only reset form when navigating to a different encounter
watch(
  () => props.encounter?.id,
  (id) => {
    const enc = props.encounter;
    if (!enc || !id) return;
    form.name = enc.name;
    form.description = enc.description ?? "";
    form.party_member_ids = [...enc.party_member_ids];
    form.companion_ids = [...(enc.companion_ids ?? [])];
    form.party_member_factions = { ...enc.party_member_factions };
    form.combatants = [...enc.combatants];
    form.factions = enc.factions?.length
      ? [...enc.factions]
      : [...DEFAULT_FACTIONS];
    form.item_ids = [...(enc.item_ids ?? [])];
    form.trap_ids = [...(enc.trap_ids ?? [])];
    form.reward_currency_pools = [...(enc.reward_currency_pools ?? [])];
    form.art_objects = [...(enc.art_objects ?? [])];
    form.location_id = enc.location_id ?? null;
    form.events = [...(enc.events ?? [])];
  },
);

// Party member selection
function togglePartyMember(memberId: string) {
  const idx = form.party_member_ids.indexOf(memberId);
  if (idx >= 0) form.party_member_ids.splice(idx, 1);
  else form.party_member_ids.push(memberId);
}

function setMemberFaction(memberId: string, factionId: string) {
  form.party_member_factions[memberId] = factionId;
}

function toggleCompanion(companionId: string) {
  const idx = form.companion_ids.indexOf(companionId);
  if (idx >= 0) form.companion_ids.splice(idx, 1);
  else form.companion_ids.push(companionId);
}

// Monster / NPC lookup helpers (needed for difficulty computeds)
const monsterMap = computed(
  () => new Map((monsters.value ?? []).map((m) => [m.id, m])),
);
const npcMap = computed(
  () => new Map((npcs.value ?? []).map((n) => [n.id, n])),
);

function monsterCr(monsterId: string | null): string {
  if (!monsterId) return "0";
  return monsterMap.value.get(monsterId)?.stat_block.challenge_rating ?? "0";
}
function crXp(monsterId: string | null): number {
  if (!monsterId) return 0;
  return crToXp(monsterMap.value.get(monsterId)?.stat_block.challenge_rating);
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
  if (entry.npc_id)
    return (
      entry.custom_name || (npcMap.value.get(entry.npc_id)?.name ?? "Unknown")
    );
  return (
    entry.custom_name ||
    (monsterMap.value.get(entry.monster_id ?? "")?.name ?? "Unknown")
  );
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
  return form.party_member_ids.map(
    (id) => members.find((m) => m.id === id)?.level ?? 1,
  );
});

const allyFactionIds = computed(() => {
  const ids = new Set<string>();
  for (const faction of form.factions) {
    if (faction.id === "players") continue;
    if (faction.hostile_to.some((id) => enemyFactionIds.value.has(id))) {
      ids.add(faction.id);
    }
  }
  return ids;
});

const allyEntries = computed(() => {
  const entries: { cr: string | null | undefined; count: number }[] = [];
  for (const c of form.combatants.filter((c) =>
    allyFactionIds.value.has(c.faction_id),
  )) {
    const cr = c.npc_id ? npcCr(c.npc_id) : monsterCr(c.monster_id);
    entries.push({ cr, count: c.count });
  }
  for (const compId of form.companion_ids) {
    const comp = (companions.value ?? []).find((c) => c.id === compId);
    if (!comp) continue;
    let cr: string | null = null;
    if (comp.source_monster_id) {
      cr =
        monsterMap.value.get(comp.source_monster_id)?.stat_block
          .challenge_rating ?? null;
    } else if (comp.source_npc_id) {
      cr =
        npcMap.value.get(comp.source_npc_id)?.stat_block?.challenge_rating ??
        null;
    }
    entries.push({ cr, count: 1 });
  }
  return entries;
});

const trapMap = computed(
  () => new Map((allTraps.value ?? []).map((t) => [t.id, t])),
);

const hazardXp = computed(() =>
  form.trap_ids.reduce((sum, id) => {
    const trap = trapMap.value.get(id);
    return sum + crToXp(trap?.cr);
  }, 0),
);

const difficulty = computed(() =>
  calculateDifficulty(
    enemyEntries.value.map((e) => ({ cr: e.cr, count: e.count })),
    partyLevels.value.length ? partyLevels.value : [3],
    allyEntries.value,
    hazardXp.value,
  ),
);

const thresholdTiers = computed(() => {
  const t = difficulty.value.partyThresholds;
  const max = t.deadly * 1.5 || 1;
  return [
    {
      label: "Easy",
      value: t.easy,
      color: "#16A34A",
      pct: Math.min(100, (t.easy / max) * 100),
    },
    {
      label: "Medium",
      value: t.medium,
      color: "#CA8A04",
      pct: Math.min(100, (t.medium / max) * 100),
    },
    {
      label: "Hard",
      value: t.hard,
      color: "#EA580C",
      pct: Math.min(100, (t.hard / max) * 100),
    },
    {
      label: "Deadly",
      value: t.deadly,
      color: "#DC2626",
      pct: Math.min(100, (t.deadly / max) * 100),
    },
  ];
});

// Loot
const isSaving = computed(
  () =>
    createEncounter.isPending.value || updateEncounterMutation.isPending.value,
);

// Save / Delete / Run
async function buildPayload() {
  return {
    name: form.name || "New Encounter",
    description: form.description || null,
    location_id: form.location_id || null,
    party_member_ids: form.party_member_ids,
    companion_ids: form.companion_ids,
    party_member_factions: form.party_member_factions,
    combatants: form.combatants,
    factions: form.factions,
    item_ids: form.item_ids,
    trap_ids: form.trap_ids,
    reward_currency_pools: form.reward_currency_pools,
    art_objects: form.art_objects,
    is_finished: props.encounter?.is_finished ?? false,
    events: form.events,
  };
}

async function handleSave(): Promise<string | null> {
  const payload = await buildPayload();
  if (props.encounter) {
    await updateEncounterMutation.mutateAsync({
      id: props.encounter.id,
      update: payload,
    });
    return props.encounter.id;
  } else {
    const created = await createEncounter.mutateAsync(payload);
    router.replace(`/encounters/${created.id}`);
    return created.id;
  }
}

async function handleRunEncounter() {
  if (otherIsLive.value && firstRunning.value) {
    if (
      !(await confirm(
        `"${otherName.value}" is currently active. Stop it and run this one?`,
      ))
    )
      return;
    await supabase
      .from("encounter_state")
      .update({ is_running: false })
      .eq("encounter_id", firstRunning.value.encounter_id);
  }
  const id = await handleSave();
  if (id) router.push(`/encounters/${id}/run`);
}

async function handleStop() {
  if (!(await confirm("Stop this encounter? Party stats will NOT be updated.")))
    return;
  await endLive();
}

async function handleRestart() {
  if (!(await confirm("Restart this encounter from scratch?"))) return;
  await endLive();
  router.push(`/encounters/${props.encounter!.id}/run`);
}

async function toggleFinished() {
  if (!props.encounter) return;
  await updateEncounterMutation.mutateAsync({
    id: props.encounter.id,
    update: { is_finished: !props.encounter.is_finished },
  });
}

async function handleDropLootItem(
  item: import("@/types/item.types").Item,
  qty: number,
) {
  await sendItemDrop(item.name, item.id, qty, item.rarity ?? null);
  removeAllOfItem(item.id);
  await handleSave();
}

async function handleDropArtObject(
  obj: import("@/types/encounter.types").ArtObject,
) {
  const rarity = obj.value_gp > 0 ? `${obj.value_gp} gp` : "Art Object";
  await sendItemDrop(
    obj.name || "Art Object",
    null,
    1,
    rarity,
    undefined,
    obj.image_url,
    obj.description,
  );
  form.art_objects = form.art_objects.filter((o) => o.id !== obj.id);
  await handleSave();
}

function removeAllOfItem(id: string) {
  form.item_ids = form.item_ids.filter((i) => i !== id);
}

async function handleDelete() {
  if (!props.encounter) return;
  if (
    !(await confirm(
      `Delete encounter "${props.encounter.name}"? This cannot be undone.`,
    ))
  )
    return;
  const id = props.encounter.id;
  router.push("/encounters");
  try {
    await deleteEncounter.mutateAsync(id);
  } catch (e) {
  }
}
</script>
