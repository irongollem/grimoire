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

    <!-- Theme -->
    <div>
      <label class="block text-label-lg font-semibold text-muted-foreground mb-2">THEME</label>
      <div class="flex flex-col gap-1.5">
        <ThemeSwatchButton
          v-for="theme in themes"
          :key="theme.id"
          :theme="theme"
          :active="form.theme === theme.id"
          @select="form.theme = theme.id"
        />
      </div>
    </div>

    <SettingChoiceList v-model="form.health_visibility" label="HEALTH VISIBILITY" :options="HEALTH_VIS_OPTIONS" />

    <SettingChoiceList v-model="form.map_memory" label="MAP MEMORY" :options="MAP_MEMORY_OPTIONS" />

    <SettingChoiceList v-model="form.player_sight" label="SIGHT" :options="PLAYER_SIGHT_OPTIONS" />

    <div>
      <SettingChoiceList v-model="form.table_violence" label="VIOLENCE AND HORROR AT THE AI TABLE" :options="TABLE_VIOLENCE_OPTIONS" />
      <!-- Fixed for every table, so it is said here beside the one dial rather than left to be discovered. -->
      <p class="text-caption text-muted-foreground mt-1.5">The rules on sexual content are the same at every table and cannot be changed.</p>
      <p class="text-caption text-muted-foreground mt-1.5" data-testid="violence-canon-link">
        What must never happen, or only off screen, is set in the
        <AppButton to="/canon" variant="link" size="inline" label="canon's lines and veils" />.
      </p>
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
import { TABLE_VIOLENCE_OPTIONS } from "@/lib/campaign/tableViolence";
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { computed } from "vue";
import ThemeSwatchButton from '@/components/common/settings/ThemeSwatchButton.vue';
import { useTheme } from "@/composables/useTheme";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById, useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import type { Campaign } from "@/types/campaign.types";
import SettingChoiceList from "@/components/campaign/SettingChoiceList.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import DemoCampaignPanel from "@/components/campaign/DemoCampaignPanel.vue";

const { themes, setTheme } = useTheme();
const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign, isPending: isSaving } = useUpdateCampaign();

// The live campaign row, not the store's copy: the store is set once per boot,
// so seeding the form from it made a save write every untouched field back at
// its boot-time value (#946). The store copy only covers the first paint.
const { data: liveCampaign } = useCampaignById(() => campaignStore.activeCampaignId);
const campaign = computed(() => liveCampaign.value ?? campaignStore.activeCampaign);

const HEALTH_VIS_OPTIONS = [
  { value: "strategic" as const, label: "Strategic", desc: "HP bars + labels for all. Exact numbers for PCs only." },
  { value: "immersive" as const, label: "Immersive", desc: "PCs show bar only (no numbers). Monsters show status words only." },
  { value: "unknown" as const, label: "Unknown", desc: "No health info shown for non-PCs." },
] as const;

const MAP_MEMORY_OPTIONS = [
  { value: "remembered" as const, label: "Remembered", desc: "What the party has seen stays on the map, shaded where they cannot see it now." },
  { value: "strict" as const, label: "Strict", desc: "The map shows only what the party can see right now, and what you reveal by hand." },
] as const;

const PLAYER_SIGHT_OPTIONS = [
  { value: "shared" as const, label: "Shared by the party", desc: "Every screen shows what any character can see. Best when everyone sits at one table." },
  { value: "own" as const, label: "Each their own", desc: "A player's phone shows only what their own character can see. For online play." },
] as const;

function buildForm(c: Campaign | null) {
  return {
    name: c?.name ?? "",
    theme: c?.theme ?? DEFAULT_THEME_ID,
    health_visibility: (c?.health_visibility as "strategic" | "immersive" | "unknown") ?? "strategic",
    map_memory: c?.map_memory ?? "remembered",
    player_sight: c?.player_sight ?? "shared",
    table_violence: c?.table_violence ?? "standard",
    immersive_rolls: c?.immersive_rolls ?? false,
    battle_map_show_tokens: c?.battle_map_show_tokens ?? true,
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
  theme: "Theme",
  health_visibility: "Health visibility",
  map_memory: "Map memory",
  player_sight: "Sight",
  table_violence: "AI table violence",
  immersive_rolls: "Immersive Rolls",
  battle_map_show_tokens: "VTT tokens",
};
const conflictLabels = computed(() => conflicts.value.map((key) => CONFLICT_LABELS[key]));

/** The columns this form owns, as a pure function of the form so unchanged ones can be left out. */
function campaignRow(f: CampaignForm) {
  return {
    name: f.name,
    theme: f.theme,
    health_visibility: f.health_visibility,
    map_memory: f.map_memory,
    player_sight: f.player_sight,
    table_violence: f.table_violence,
    immersive_rolls: f.immersive_rolls,
    battle_map_show_tokens: f.battle_map_show_tokens,
  };
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
</script>
