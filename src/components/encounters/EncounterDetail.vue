<template>
  <div>
    <!-- Top action bar -->
    <div class="flex flex-wrap items-center gap-2 mb-6">
      <RouterLink
        to="/encounters"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconChevronLeft class="h-3.5 w-3.5" />
        All Encounters
      </RouterLink>

      <div class="ml-auto flex items-center gap-2">
        <!-- In-progress badge -->
        <span
          v-if="thisIsLive"
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/15 border border-green-500/30 text-label-lg font-semibold text-green-500 animate-pulse"
        >
          ● In Progress
        </span>

        <!-- Mark finished / reopen -->
        <button
          v-if="props.encounter"
          type="button"
          :disabled="updateEncounterMutation.isPending.value"
          class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-cinzel text-xs font-semibold transition-colors disabled:opacity-50"
          :class="
            props.encounter.is_finished
              ? 'border-border text-muted-foreground hover:text-foreground'
              : 'border-primary/40 text-primary hover:bg-primary/10'
          "
          @click="toggleFinished"
        >
          <IconCheckDouble class="h-3.5 w-3.5" />
          {{ props.encounter.is_finished ? "Reopen" : "Mark Done" }}
        </button>

        <button
          v-if="props.encounter"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          :disabled="deleting"
          @click="handleDelete"
        >
          <IconClose class="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          v-if="props.encounter"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
          @click="onCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
          :disabled="isSaving"
          @click="handleSaveAndReturn"
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
            <IconReset class="h-3.5 w-3.5" />
            Restart
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
            @click="handleStop"
          >
            <IconStop class="h-3.5 w-3.5" />
            Stop
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            @click="handleRunEncounter"
          >
            <IconPlay class="h-3.5 w-3.5" />
            Resume
          </button>
        </template>

        <!-- No encounter running or another is running -->
        <button
          v-else
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          :disabled="isSaving"
          @click="handleRunEncounter"
        >
          <IconPlay class="h-3.5 w-3.5" />
          Run Encounter
        </button>
      </div>
    </div>

    <!-- Main grid -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Left column (col-span-2) -->
      <div class="xl:col-span-2 flex flex-col gap-6">
        <!-- Name + Description + Location -->
        <EncounterMetadata
          :name="form.name"
          :description="form.description"
          :location-id="form.location_id"
          :all-locations="allLocations ?? []"
          @update:name="form.name = $event"
          @update:description="form.description = $event"
          @update:location-id="form.location_id = $event"
        />

        <!-- Party Members -->
        <EncounterPartyRoster
          :party="party"
          :party-loading="partyLoading"
          :companions="companions"
          :party-member-ids="form.party_member_ids"
          :companion-ids="form.companion_ids"
          :party-member-factions="form.party_member_factions"
          :factions="form.factions"
          :species-name-map="speciesNameMap"
          @toggle-party-member="togglePartyMember"
          @toggle-companion="toggleCompanion"
          @set-member-faction="setMemberFaction"
        />

        <!-- Combatants -->
        <EncounterCombatants
          v-model:combatants="form.combatants"
          :factions="form.factions"
          :monsters="monsters ?? []"
          :npcs="npcs ?? []"
          :excluded-monster-ids="excludedMonsterIds"
          @hide-monster="toggleHideMonster"
        />

        <!-- Battlefield Setup — pre-place monster tokens on the battle map -->
        <EncounterBattlefieldSetup
          :location-id="form.location_id"
          :combatants="form.combatants"
          :factions="form.factions"
          :monsters="monsters ?? []"
          :npcs="npcs ?? []"
          @update:combatants="form.combatants = $event"
        />

        <!-- Battle music, by theme rather than by track -->
        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold tracking-wide text-foreground">
            Battle music theme
          </label>
          <ThemeInput
            v-model="form.audio_theme"
            :suggestions="audioThemeOptions"
            placeholder="battle, boss…"
          />
          <p class="text-caption text-muted-foreground italic">
            Starting combat asks the soundboard for a music playlist tagged with this theme.
            Tag several and each fight picks one at random. Nothing matching means the audio is left alone.
          </p>
        </div>

        <!-- Boss Mechanics (legendary/lair) -->
        <EncounterBossMechanics
          :lair-enabled="form.lair_enabled"
          :lair-owner-def-id="form.lair_owner_def_id"
          :lair-owner-options="lairOwnerOptions"
          @update:lair-enabled="form.lair_enabled = $event"
          @update:lair-owner-def-id="form.lair_owner_def_id = $event"
        />
      </div>

      <!-- Right column -->
      <div class="flex flex-col gap-6">
        <!-- Linked Quests (back-reference) -->
        <EncounterLinkedQuests :quests="linkedQuests ?? []" />
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
          @update:item-ids="form.item_ids = $event"
          @update:currency-pools="form.reward_currency_pools = $event"
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

  <PaywallModal v-model="showPaywall" resource="encounters" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconCheckDouble, IconChevronLeft, IconClose, IconPlay, IconReset, IconStop } from '@/lib/icons';
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useCompanions } from "@/composables/useCompanions";
import { useEncounterDifficulty } from "@/composables/useEncounterDifficulty";
import { useNpcs } from "@/composables/useNpcs";
import { useItems } from "@/composables/useItems";
import { useTraps } from "@/composables/useTraps";
import { useAllLocations } from "@/composables/useLocations";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists } from "@/composables/useSoundboardPlaylists";
import { collectThemes } from "@/lib/audio/audioThemes";
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
} from "@/types/encounter.types";
import type {
  Encounter,
  CombatantDef,
  EncounterEvent,
} from "@/types/encounter.types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import EncounterMetadata from "@/components/encounters/EncounterMetadata.vue";
import EncounterCombatants from "@/components/encounters/EncounterCombatants.vue";
import EncounterBattlefieldSetup from "@/components/encounters/EncounterBattlefieldSetup.vue";
import EncounterDifficulty from "@/components/encounters/EncounterDifficulty.vue";
import EncounterEvents from "@/components/encounters/EncounterEvents.vue";
import EncounterFactions from "@/components/encounters/EncounterFactions.vue";
import EncounterLoot from "@/components/encounters/EncounterLoot.vue";
import EncounterTraps from "@/components/encounters/EncounterTraps.vue";
import EncounterPartyRoster from "@/components/encounters/EncounterPartyRoster.vue";
import EncounterBossMechanics from "@/components/encounters/EncounterBossMechanics.vue";
import ThemeInput from "@/components/common/ThemeInput.vue";
import EncounterLinkedQuests from "@/components/encounters/EncounterLinkedQuests.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";

const showPaywall = ref(false);
const deleting = ref(false);

const props = defineProps<{
  encounter: Encounter | null;
}>();

const router = useRouter();
const route  = useRoute();

// Cancel strips ?edit=true to flip back to the sheet; preserves other
// query params.
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}
const campaign = useCampaignStore();
const { data: monsters } = useAllMonsters();

/** Combatants eligible as lair owners — any monster/NPC slot in this encounter.
 *  Shows an indicator next to entries whose stat block already has lair_actions. */
const lairOwnerOptions = computed(() => {
  return form.combatants.map((c) => {
    const monster = c.monster_id ? (monsters.value ?? []).find((m) => m.id === c.monster_id) : null;
    const npc = c.npc_id ? (npcs.value ?? []).find((n) => n.id === c.npc_id) : null;
    const hasLairActions = !!(monster?.stat_block?.lair_actions?.length);
    const baseName = c.custom_name ?? monster?.name ?? npc?.name ?? "Combatant";
    return {
      id: c.id,
      name: hasLairActions ? `★ ${baseName}` : baseName,
    };
  });
});

const { data: party, isLoading: partyLoading } = useParty();
const speciesNameMap = useSpeciesNameMap();
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
  lair_enabled: props.encounter?.lair_enabled ?? false,
  lair_owner_def_id: props.encounter?.lair_owner_def_id ?? (null as string | null),
  audio_theme: props.encounter?.audio_theme ?? (null as string | null),
  ai_provenance: props.encounter?.ai_provenance ?? (null as AiProvenance | null),
});

// Theme suggestions come from what the DM has already labelled, but the field
// stays free text: labelling the encounter before building the playlist is a
// perfectly reasonable order to work in.
const { data: themePlaylists } = usePlaylists();
const { data: themeSounds } = useSounds();
const audioThemeOptions = computed(() =>
  collectThemes(
    themePlaylists.value === undefined ? [] : themePlaylists.value,
    themeSounds.value === undefined ? [] : themeSounds.value,
  ),
);

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

  // Same auto-select for companions — a new encounter starts with the whole
  // party (companions included) and the DM benches anyone that shouldn't join.
  watch(
    companions,
    (comps) => {
      if (comps?.length && !form.companion_ids.length) {
        form.companion_ids = comps.map((c) => c.id);
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
    form.ai_provenance = enc.ai_provenance ?? null;
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

// Difficulty calculation (delegated to composable)
const { difficulty, thresholdTiers, enemyEntries } = useEncounterDifficulty({
  combatants: computed(() => form.combatants),
  factions: computed(() => form.factions),
  partyMemberIds: computed(() => form.party_member_ids),
  companionIds: computed(() => form.companion_ids),
  trapIds: computed(() => form.trap_ids),
  monsters: computed(() => monsters.value ?? []),
  npcs: computed(() => npcs.value ?? []),
  party,
  companions,
  allTraps,
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
    lair_enabled: form.lair_enabled,
    lair_owner_def_id: form.lair_enabled ? form.lair_owner_def_id : null,
    // Empty means "ask for nothing", which is null rather than an empty string —
    // the resolver treats a blank theme as no request at all either way, but the
    // column should say what it means.
    audio_theme: form.audio_theme === null || form.audio_theme.trim() === "" ? null : form.audio_theme.trim(),
    ai_provenance: form.ai_provenance,
  };
}

async function handleSave(): Promise<string | null> {
  if (props.encounter) {
    // Material edit detection (#606): only the fields the AI encounter
    // generator actually writes — logistics (roster, location, loot, audio
    // theme, lair mechanics) are DM configuration, not generated content.
    const contentChanged =
      form.name !== props.encounter.name ||
      !deepEqual(form.description || null, props.encounter.description) ||
      !deepEqual(form.combatants, props.encounter.combatants);
    if (contentChanged) form.ai_provenance = markEdited(form.ai_provenance);
  }
  const payload = await buildPayload();
  if (props.encounter) {
    try {
      await updateEncounterMutation.mutateAsync({
        id: props.encounter.id,
        update: payload,
      });
      return props.encounter.id;
    } catch (e: unknown) {
      if (isQuotaExceeded(e)) { showPaywall.value = true; return null; }
      throw e;
    }
  } else {
    try {
      const created = await createEncounter.mutateAsync(payload);
      router.replace(`/encounters/${created.id}`);
      return created.id;
    } catch (e: unknown) {
      if (isQuotaExceeded(e)) { showPaywall.value = true; return null; }
      throw e;
    }
  }
}

// Save button: save then return to view mode (strip ?edit=true)
async function handleSaveAndReturn() {
  const id = await handleSave();
  if (props.encounter && id) onCancel();
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

function removeAllOfItem(id: string) {
  form.item_ids = form.item_ids.filter((i) => i !== id);
}

async function handleDelete() {
  if (!props.encounter) return;
  if (deleting.value) return;
  if (
    !(await confirm(
      `Delete encounter "${props.encounter.name}"? This cannot be undone.`,
    ))
  )
    return;
  deleting.value = true;
  try {
    await deleteEncounter.mutateAsync(props.encounter.id);
    router.push("/encounters");
  } catch {
    // failure is surfaced to the user by the mutation's onError toast
  } finally {
    deleting.value = false;
  }
}
</script>
