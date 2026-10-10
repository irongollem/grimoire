<template>
  <DemoCampaignPanel class="max-w-lg mb-6" />

  <form class="space-y-6 max-w-lg" @submit.prevent="submitForm">
    <!-- Name -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-1">NAME</label>
      <AppInput
        v-model="form.name"
        required
        tone="filled"
        size="heading"
        placeholder="The Lost Mine of Phandelver…"
      />
    </div>

    <!-- World -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-1">WORLD</label>
      <AppInput
        v-model="form.setting"
        list="campaign-settings-list"
        tone="filled"
        size="body"
        placeholder="Forgotten Realms, Eberron, Homebrew…"
      />
      <datalist id="campaign-settings-list">
        <option value="Forgotten Realms" />
        <option value="Eberron" />
        <option value="Ravenloft" />
        <option value="Dragonlance" />
        <option value="Greyhawk" />
        <option value="Planescape" />
        <option value="Spelljammer" />
        <option value="Dark Sun" />
        <option value="Mystara" />
        <option value="Homebrew" />
      </datalist>
    </div>

    <!-- Calendar + Year -->
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">CALENDAR</label>
        <AppSelect
          v-model="form.calendar_id"
          tone="filled"
          weight="normal"
          size="body"
          block
          @change="onCalendarChange"
        >
          <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
          <option value="custom">Custom calendar…</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1">CURRENT YEAR</label>
        <AppInput
          v-model.number="form.current_year"
          type="number"
          min="1"
          tone="filled"
          size="body"
        />
      </div>
    </div>

    <!-- Custom calendar editor -->
    <div v-if="form.calendar_id === 'custom' && form.custom_calendar" class="max-w-3xl -mx-2 sm:mx-0">
      <CalendarEditor v-model="form.custom_calendar" />
    </div>

    <!-- Populate from Setting -->
    <div
      v-if="populateSetting"
      class="rounded-md border border-border bg-muted/40 px-3 py-3 space-y-2"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="text-label-lg font-semibold text-foreground">
            POPULATE FROM {{ populateSetting.label.toUpperCase() }}
          </p>
          <p class="text-caption text-muted-foreground mt-0.5">
            Seeds locations, notable NPCs, and factions. Skips existing entries.
          </p>
        </div>
        <AppButton
          type="button"
          variant="primary"
          size="sm"
          class="shrink-0"
          :disabled="isPopulating"
          :label="isPopulating ? 'Populating…' : 'Populate'"
          :icon="IconGenerate"
          icon-size="xs"
          @click="doPopulate"
        />
      </div>
      <p v-if="populateError" class="text-caption text-destructive">{{ populateError }}</p>
      <p v-else-if="populateResult" class="text-caption text-muted-foreground">
        Added {{ populateResult.locations }} location<span v-if="populateResult.locations !== 1">s</span>,
        {{ populateResult.npcs }} NPC<span v-if="populateResult.npcs !== 1">s</span>,
        {{ populateResult.factions }} faction<span v-if="populateResult.factions !== 1">s</span>.
      </p>
    </div>

    <!-- Theme -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-2">THEME</label>
      <div class="flex flex-col gap-1.5">
        <AppButton
          v-for="theme in themes"
          :key="theme.id"
          variant="outline"
          fill="muted"
          size="md"
          block
          :active="form.theme === theme.id"
          @click="form.theme = theme.id"
        >
          <div class="shrink-0 flex gap-1">
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--background'] }" />
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--primary'] }" />
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--card'] }" />
          </div>
          <span class="flex-1 text-caption font-semibold text-foreground">{{ theme.label }}</span>
          <IconCheck v-if="form.theme === theme.id" class="h-3.5 w-3.5 text-primary shrink-0" />
        </AppButton>
      </div>
    </div>

    <!-- Health Visibility -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-2">HEALTH VISIBILITY</label>
      <div class="flex flex-col gap-1.5">
        <AppButton
          v-for="opt in HEALTH_VIS_OPTIONS"
          :key="opt.value"
          variant="outline"
          fill="muted"
          size="md"
          block
          :active="form.health_visibility === opt.value"
          @click="form.health_visibility = opt.value"
        >
          <div class="flex-1 min-w-0">
            <span class="text-caption font-semibold text-foreground">{{ opt.label }}</span>
            <p class="text-caption text-muted-foreground mt-0.5">{{ opt.desc }}</p>
          </div>
          <IconCheck v-if="form.health_visibility === opt.value" class="h-3.5 w-3.5 text-primary shrink-0" />
        </AppButton>
      </div>
    </div>

    <!-- Immersive Rolls -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer">
        <ToggleSwitch v-model="form.immersive_rolls" size="lg" aria-label="Immersive Rolls" class="shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <span class="text-caption font-semibold text-foreground">Immersive Rolls</span>
          <p class="text-caption text-muted-foreground mt-0.5">
            Stealth, knowledge and insight checks show only flavor text in chat. Full result whispered to DM only. The player does not see their dice outcome.
          </p>
          <p class="text-caption text-muted-foreground mt-0.5">
            Not used with young players: a young player, or an adult at a young player's table who isn't their parent, rolls openly.
          </p>
        </div>
      </label>
    </div>

    <!-- VTT tokens visible to players -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer">
        <ToggleSwitch v-model="form.battle_map_show_tokens" size="lg" aria-label="Show VTT tokens to players" class="shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <span class="text-caption font-semibold text-foreground">Show VTT tokens to players</span>
          <p class="text-caption text-muted-foreground mt-0.5">
            When off, the player battle map shows only the map and fog of war; no character or monster tokens. Use for in-person sessions where combat happens with physical minis or theater of the mind. The DM's view is unaffected.
          </p>
        </div>
      </label>
    </div>

    <!-- Save -->
    <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" />
    <div class="flex justify-end pt-1">
      <AppButton
        type="submit"
        variant="primary"
        size="md"
        :disabled="isSaving"
        :label="isSaving ? 'Saving…' : 'Save Changes'"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { ref, computed } from "vue";
import { IconCheck, IconGenerate } from '@/lib/icons';
import { useTheme } from "@/composables/useTheme";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById, useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import type { Campaign } from "@/types/campaign.types";
import { listCalendarAdapters, createDefaultCustomCalendarDef } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import DemoCampaignPanel from "@/components/campaign/DemoCampaignPanel.vue";
import { usePopulateLocations } from "@/composables/locations/useLocations";
import { usePopulateFactions } from "@/composables/factions/useFactions";
import { usePopulateSettingNpcs } from "@/composables/npcs/useNpcs";

const { themes, setTheme } = useTheme();
const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign, isPending: isSaving } = useUpdateCampaign();

// The live campaign row, not the store's copy: the store is set once per boot,
// so seeding the form from it made a save write every untouched field back at
// its boot-time value (#946). The store copy only covers the first paint.
const { data: liveCampaign } = useCampaignById(() => campaignStore.activeCampaignId);
const campaign = computed(() => liveCampaign.value ?? campaignStore.activeCampaign);
const availableCalendars = listCalendarAdapters();

const HEALTH_VIS_OPTIONS = [
  { value: "strategic" as const, label: "Strategic", desc: "HP bars + labels for all. Exact numbers for PCs only." },
  { value: "immersive" as const, label: "Immersive", desc: "PCs show bar only (no numbers). Monsters show status words only." },
  { value: "unknown" as const, label: "Unknown", desc: "No health info shown for non-PCs." },
] as const;

function buildForm(c: Campaign | null) {
  return {
    name: c?.name ?? "",
    setting: c?.setting ?? "",
    calendar_id: c?.calendar_id ?? "faerun",
    current_year: c?.current_year ?? 1495,
    theme: c?.theme ?? DEFAULT_THEME_ID,
    health_visibility: (c?.health_visibility as "strategic" | "immersive" | "unknown") ?? "strategic",
    immersive_rolls: c?.immersive_rolls ?? false,
    battle_map_show_tokens: c?.battle_map_show_tokens ?? true,
    custom_calendar: (c?.custom_calendar ?? null) as SettingCalendarDef | null,
  };
}

type CampaignForm = ReturnType<typeof buildForm>;

const { draft: form, changes, commit, reset, conflicts } = useRecordDraft({
  source: () => campaign.value,
  identity: (c: Campaign) => c.id,
  toDraft: (c: Campaign | null): CampaignForm => buildForm(c),
});

const CONFLICT_LABELS: Record<keyof CampaignForm, string> = {
  name: "Name",
  setting: "World",
  calendar_id: "Calendar",
  current_year: "Current year",
  theme: "Theme",
  health_visibility: "Health visibility",
  immersive_rolls: "Immersive Rolls",
  battle_map_show_tokens: "VTT tokens",
  custom_calendar: "Custom calendar",
};
const conflictLabels = computed(() => conflicts.value.map((key) => CONFLICT_LABELS[key]));

/** The columns this form owns, as a pure function of the form so unchanged ones can be left out. */
function campaignRow(f: CampaignForm) {
  return {
    name: f.name,
    setting: f.setting || "Custom Setting",
    calendar_id: f.calendar_id,
    current_year: f.current_year,
    theme: f.theme,
    health_visibility: f.health_visibility,
    immersive_rolls: f.immersive_rolls,
    battle_map_show_tokens: f.battle_map_show_tokens,
    custom_calendar: f.calendar_id === "custom" ? f.custom_calendar : null,
  };
}

const populateSetting = computed(() => getSetting(form.calendar_id));

function onCalendarChange() {
  if (form.calendar_id === "custom") {
    if (!form.custom_calendar) form.custom_calendar = createDefaultCustomCalendarDef();
    return;
  }
  form.custom_calendar = null;
  const newLabel = getSetting(form.calendar_id)?.label ?? "";
  const knownLabels = new Set(listSettings().map((s) => s.label));
  if (newLabel && (!form.setting || knownLabels.has(form.setting))) {
    form.setting = newLabel;
  }
}

async function submitForm() {
  if (!campaign.value) return;
  const update = changes(campaignRow);
  if (Object.keys(update).length === 0) return;
  const updated = await updateCampaign({ id: campaign.value.id, update });
  commit();
  campaignStore.switchToCampaign(updated);
  setTheme(form.theme);
}

// ── Populate from setting ─────────────────────────────────────────────────────

const { mutateAsync: populateLocations, isPending: isPopulatingLocations } = usePopulateLocations();
const { mutateAsync: populateFactions, isPending: isPopulatingFactions } = usePopulateFactions();
const { mutateAsync: populateNpcs, isPending: isPopulatingNpcs } = usePopulateSettingNpcs();

const isPopulating = computed(
  () => isPopulatingLocations.value || isPopulatingFactions.value || isPopulatingNpcs.value,
);

const populateResult = ref<{ locations: number; factions: number; npcs: number } | null>(null);
const populateError = ref<string | null>(null);

async function doPopulate() {
  populateResult.value = null;
  populateError.value = null;
  try {
    const [locations, factions, npcs] = await Promise.all([
      populateLocations(),
      populateFactions(),
      populateNpcs(),
    ]);
    populateResult.value = { locations, factions, npcs };
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
