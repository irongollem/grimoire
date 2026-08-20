<template>
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
          <option value="custom">— Custom calendar…</option>
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
          <span class="flex-1 font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ theme.label }}</span>
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
            <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ opt.label }}</span>
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
          <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Immersive Rolls</span>
          <p class="text-caption text-muted-foreground mt-0.5">
            Stealth, knowledge and insight checks show only flavor text in chat. Full result whispered to DM only — player does not see their dice outcome.
          </p>
        </div>
      </label>
    </div>

    <!-- VTT tokens visible to players -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer">
        <ToggleSwitch v-model="form.battle_map_show_tokens" size="lg" aria-label="Show VTT tokens to players" class="shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Show VTT tokens to players</span>
          <p class="text-caption text-muted-foreground mt-0.5">
            When off, the player battle map shows only the map and fog of war — no character or monster tokens. Use for in-person sessions where combat happens with physical minis or theater of the mind. The DM's view is unaffected.
          </p>
        </div>
      </label>
    </div>

    <!-- Save -->
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
import { ref, computed, watch } from "vue";
import { IconCheck, IconGenerate } from '@/lib/icons';
import { useTheme } from "@/composables/useTheme";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { listCalendarAdapters, createDefaultCustomCalendarDef } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import { usePopulateLocations } from "@/composables/useLocations";
import { usePopulateFactions } from "@/composables/useFactions";
import { usePopulateSettingNpcs } from "@/composables/useNpcs";

const { themes, setTheme } = useTheme();
const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign, isPending: isSaving } = useUpdateCampaign();

const campaign = computed(() => campaignStore.activeCampaign);
const availableCalendars = listCalendarAdapters();

const HEALTH_VIS_OPTIONS = [
  { value: "strategic" as const, label: "Strategic", desc: "HP bars + labels for all. Exact numbers for PCs only." },
  { value: "immersive" as const, label: "Immersive", desc: "PCs show bar only (no numbers). Monsters show status words only." },
  { value: "unknown" as const, label: "Unknown", desc: "No health info shown for non-PCs." },
] as const;

function buildForm(c: typeof campaign.value) {
  return {
    name: c?.name ?? "",
    setting: c?.setting ?? "",
    calendar_id: c?.calendar_id ?? "faerun",
    current_year: c?.current_year ?? 1495,
    theme: c?.theme ?? "grimoire",
    health_visibility: (c?.health_visibility as "strategic" | "immersive" | "unknown") ?? "strategic",
    immersive_rolls: c?.immersive_rolls ?? false,
    battle_map_show_tokens: c?.battle_map_show_tokens ?? true,
    custom_calendar: (c?.custom_calendar ?? null) as SettingCalendarDef | null,
  };
}

const form = ref(buildForm(campaign.value));

watch(
  () => campaign.value?.id,
  () => { form.value = buildForm(campaign.value); },
);

const populateSetting = computed(() => getSetting(form.value.calendar_id));

function onCalendarChange() {
  if (form.value.calendar_id === "custom") {
    if (!form.value.custom_calendar) form.value.custom_calendar = createDefaultCustomCalendarDef();
    return;
  }
  form.value.custom_calendar = null;
  const newLabel = getSetting(form.value.calendar_id)?.label ?? "";
  const knownLabels = new Set(listSettings().map((s) => s.label));
  if (newLabel && (!form.value.setting || knownLabels.has(form.value.setting))) {
    form.value.setting = newLabel;
  }
}

async function submitForm() {
  if (!campaign.value) return;
  const updated = await updateCampaign({
    id: campaign.value.id,
    update: {
      name: form.value.name,
      setting: form.value.setting || "Custom Setting",
      calendar_id: form.value.calendar_id,
      current_year: form.value.current_year,
      theme: form.value.theme,
      health_visibility: form.value.health_visibility,
      immersive_rolls: form.value.immersive_rolls,
      battle_map_show_tokens: form.value.battle_map_show_tokens,
      custom_calendar: form.value.calendar_id === "custom" ? form.value.custom_calendar : null,
    },
  });
  campaignStore.switchToCampaign(updated);
  setTheme(form.value.theme);
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
