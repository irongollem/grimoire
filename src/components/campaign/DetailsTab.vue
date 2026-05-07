<template>
  <form class="space-y-6 max-w-lg" @submit.prevent="submitForm">
    <!-- Name -->
    <div>
      <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">NAME</label>
      <input
        v-model="form.name"
        required
        type="text"
        placeholder="The Lost Mine of Phandelver…"
        class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>

    <!-- World -->
    <div>
      <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">WORLD</label>
      <input
        v-model="form.setting"
        list="campaign-settings-list"
        type="text"
        placeholder="Forgotten Realms, Eberron, Homebrew…"
        class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
        <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">SETTING</label>
        <select
          v-model="form.calendar_id"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onCalendarChange"
        >
          <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
        </select>
      </div>
      <div>
        <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">CURRENT YEAR</label>
        <input
          v-model.number="form.current_year"
          type="number"
          min="1"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>

    <!-- Populate from Setting -->
    <div
      v-if="populateSetting"
      class="rounded-md border border-border bg-muted/40 px-3 py-3 space-y-2"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-foreground">
            POPULATE FROM {{ populateSetting.label.toUpperCase() }}
          </p>
          <p class="font-fell text-xs text-muted-foreground mt-0.5">
            Seeds locations, notable NPCs, and factions. Skips existing entries.
          </p>
        </div>
        <button
          type="button"
          :disabled="isPopulating"
          class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="doPopulate"
        >
          <IconGenerate class="h-3 w-3" />
          {{ isPopulating ? "Populating…" : "Populate" }}
        </button>
      </div>
      <p v-if="populateError" class="font-fell text-xs text-destructive">{{ populateError }}</p>
      <p v-else-if="populateResult" class="font-fell text-xs text-muted-foreground">
        Added {{ populateResult.locations }} location<span v-if="populateResult.locations !== 1">s</span>,
        {{ populateResult.npcs }} NPC<span v-if="populateResult.npcs !== 1">s</span>,
        {{ populateResult.factions }} faction<span v-if="populateResult.factions !== 1">s</span>.
      </p>
    </div>

    <!-- Theme -->
    <div>
      <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">THEME</label>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors text-left"
          :class="form.theme === theme.id ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80 hover:bg-muted/40'"
          @click="form.theme = theme.id"
        >
          <div class="shrink-0 flex gap-1">
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--background'] }" />
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--primary'] }" />
            <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--card'] }" />
          </div>
          <span class="flex-1 font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ theme.label }}</span>
          <IconCheck v-if="form.theme === theme.id" class="h-3.5 w-3.5 text-primary shrink-0" />
        </button>
      </div>
    </div>

    <!-- Health Visibility -->
    <div>
      <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">HEALTH VISIBILITY</label>
      <div class="flex flex-col gap-1.5">
        <button
          v-for="opt in HEALTH_VIS_OPTIONS"
          :key="opt.value"
          type="button"
          class="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors text-left"
          :class="form.health_visibility === opt.value ? 'border-primary bg-primary/10' : 'border-border hover:border-border/80 hover:bg-muted/40'"
          @click="form.health_visibility = opt.value"
        >
          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ opt.label }}</span>
            <p class="font-fell text-xs text-muted-foreground mt-0.5">{{ opt.desc }}</p>
          </div>
          <IconCheck v-if="form.health_visibility === opt.value" class="h-3.5 w-3.5 text-primary shrink-0" />
        </button>
      </div>
    </div>

    <!-- Immersive Rolls -->
    <div>
      <label class="flex items-start gap-3 cursor-pointer" @click="form.immersive_rolls = !form.immersive_rolls">
        <div class="shrink-0 mt-0.5">
          <div
            class="h-5 w-9 rounded-full border-2 transition-colors relative"
            :class="form.immersive_rolls ? 'bg-primary border-primary' : 'bg-muted border-border'"
          >
            <div
              class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
              :class="form.immersive_rolls ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Immersive Rolls</span>
          <p class="font-fell text-xs text-muted-foreground mt-0.5">
            Stealth, knowledge and insight checks show only flavor text in chat. Full result whispered to DM only — player does not see their dice outcome.
          </p>
        </div>
      </label>
    </div>

    <!-- Save -->
    <div class="flex justify-end pt-1">
      <button
        type="submit"
        :disabled="isSaving"
        class="px-5 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {{ isSaving ? "Saving…" : "Save Changes" }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconCheck, IconGenerate } from '@/lib/icons';
import { useTheme } from "@/composables/useTheme";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { listCalendarAdapters } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
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
  };
}

const form = ref(buildForm(campaign.value));

watch(
  () => campaign.value?.id,
  () => { form.value = buildForm(campaign.value); },
);

const populateSetting = computed(() => getSetting(form.value.calendar_id));

function onCalendarChange() {
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
