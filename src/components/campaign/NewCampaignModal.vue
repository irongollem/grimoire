<template>
  <AppModal :open="open" :size="form.calendar_id === 'custom' ? 'lg' : 'md'" @close="close">
    <ModalHeader title="New Campaign" closeable @close="close" />

    <form class="min-h-0 flex-1 flex flex-col overflow-hidden" @submit.prevent="submit">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1">GAME SYSTEM</label>
          <GameSystemPicker v-model="form.game_system" label="Game system" />
          <p class="text-caption text-muted-foreground mt-1">
            Decides the character sheets, creatures, items, rests and encounter rules this campaign uses. It cannot be changed to an unrelated system later.
          </p>
          <AppCheckbox
            v-if="compatibleLabels.length > 0"
            v-model="form.allows_mixed_rulesets"
            :label="`Allow characters built for ${compatibleLabels.join(' or ')}`"
            hint="When unticked, a character built for another system is asked to bring a converted copy."
            class="mt-2 gap-2.5"
          />
        </div>

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

        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1">WORLD</label>
          <AppInput
            v-model="form.setting"
            list="new-campaign-settings-list"
            tone="filled"
            size="body"
            placeholder="Forgotten Realms, Eberron, Homebrew…"
          />
          <datalist id="new-campaign-settings-list">
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
              <option :value="null" disabled>Choose a calendar…</option>
              <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
              <option value="custom">Blank calendar (make your own)…</option>
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

        <CalendarEditor
          v-if="form.calendar_id === 'custom' && customCalendarDef"
          v-model="customCalendarDef"
        />

        <div
          v-if="showClaimOption"
          class="rounded-md border border-border bg-muted/50 px-3 py-2.5"
        >
          <AppCheckbox
            v-model="claimExisting"
            label="Import existing data"
            hint="Assign your existing notes, NPCs, party members, calendar events, and encounters to this campaign."
            class="gap-2.5"
          />
        </div>
      </div>

      <div class="shrink-0 flex items-center justify-end gap-2 px-5 py-3">
        <DemoCampaignOffer layout="compact" class="mr-auto" :disabled="isSaving" @loaded="onDemoLoaded" />
        <AppButton variant="subtle" size="md" label="Cancel" @click="close" />
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          :disabled="isSaving || form.calendar_id === null || calendarProblem !== null"
          :label="isSaving ? 'Saving…' : 'Create Campaign'"
        />
      </div>
    </form>
  </AppModal>

  <PaywallModal v-model="showPaywall" resource="campaigns" />
</template>

<script setup lang="ts">
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { computed, ref, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { listCalendarAdapters, getCalendarAdapter, createDefaultCustomCalendarDef } from "@/settings/index";
import { getSetting, listSettings } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import { useCreateCampaign, useClaimOrphanedData } from "@/composables/campaign/useCampaigns";
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import { customCalendarProblem } from "@/lib/calendar/customCalendar";
import DemoCampaignOffer from "@/components/campaign/DemoCampaignOffer.vue";
import type { Campaign } from "@/types/campaign.types";
import GameSystemPicker from "@/components/rules/GameSystemPicker.vue";
import { DEFAULT_GAME_SYSTEM, defaultCurrencyFor, gameSystemLabel, switchableGameSystems, type GameSystemKey } from "@/systems/registry";

const open = defineModel<boolean>({ required: true });
const { showClaimOption = false } = defineProps<{
  showClaimOption?: boolean;
}>();

const emit = defineEmits<{
  created: [campaign: Campaign];
}>();

const { mutateAsync: createCampaign, isPending: isSaving } = useCreateCampaign();
const { mutateAsync: claimOrphans } = useClaimOrphanedData();

const availableCalendars = listCalendarAdapters();

// The game system and the calendar both start unchosen. The system is asked
// first (#943, #934), and a preselected one is a system nobody picked; a
// preselected calendar was Faerûn, a world nobody picked. The form cannot be
// submitted without either.
const form = ref<{
  name: string;
  setting: string;
  calendar_id: string | null;
  current_year: number;
  game_system: GameSystemKey;
  allows_mixed_rulesets: boolean;
}>({
  name: "",
  setting: "",
  calendar_id: null,
  current_year: 1,
  game_system: DEFAULT_GAME_SYSTEM,
  allows_mixed_rulesets: false,
});
// The systems whose characters this one can seat, named for the checkbox. None for
// a system compatible with nothing (Generic), which has no such choice to offer.
const compatibleLabels = computed(() =>
  switchableGameSystems(form.value.game_system).map(gameSystemLabel),
);
const customCalendarDef = ref<SettingCalendarDef | null>(null);
const claimExisting = ref(true);
const showPaywall = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      name: "",
      setting: "",
      calendar_id: null,
      current_year: 1,
      game_system: DEFAULT_GAME_SYSTEM,
      allows_mixed_rulesets: false,
    };
    customCalendarDef.value = null;
    claimExisting.value = true;
  }
});

function close() {
  open.value = false;
}

function onDemoLoaded(campaign: Campaign) {
  close();
  emit("created", campaign);
}

function onCalendarChange() {
  if (form.value.calendar_id === "custom") {
    if (!customCalendarDef.value) customCalendarDef.value = createDefaultCustomCalendarDef();
    form.value.current_year = customCalendarDef.value.defaultYear;
    return;
  }
  customCalendarDef.value = null;
  const calendarId = form.value.calendar_id;
  if (calendarId === null) return;
  form.value.current_year = getCalendarAdapter(calendarId).defaultYear;
  const newLabel = getSetting(calendarId)?.label ?? "";
  const knownLabels = new Set(listSettings().map((s) => s.label));
  if (newLabel && (!form.value.setting || knownLabels.has(form.value.setting))) {
    form.value.setting = newLabel;
  }
}

// The editor shows the problem; this keeps a calendar it flags from being saved.
const calendarProblem = computed(() =>
  form.value.calendar_id === "custom" && customCalendarDef.value ? customCalendarProblem(customCalendarDef.value) : null,
);

async function submit() {
  const gameSystem = form.value.game_system;
  const calendarId = form.value.calendar_id;
  if (calendarId === null || calendarProblem.value !== null) return;
  try {
    const created = await createCampaign({
      name: form.value.name,
      setting: form.value.setting.trim() || null,
      calendar_id: calendarId,
      current_year: form.value.current_year,
      game_system: gameSystem,
      // A box ticked for one system must not follow the DM to a system that has no such choice.
      allows_mixed_rulesets: compatibleLabels.value.length > 0 && form.value.allows_mixed_rulesets,
      // A Generic campaign starts with one coin, not the five of 5e.
      currency: defaultCurrencyFor(gameSystem),
      theme: DEFAULT_THEME_ID,
      health_visibility: "strategic",
      immersive_rolls: false,
      description: null,
      spotify_client_id: null,
      is_archived: false,
      // ai_enabled deliberately omitted — new campaigns start unchosen
      // (null); see the column comment on campaigns.ai_enabled.
      battle_map_show_tokens: true,
      custom_calendar: calendarId === "custom" ? customCalendarDef.value : null,
    });
    if (showClaimOption && claimExisting.value) {
      await claimOrphans(created.id);
    }
    close();
    emit("created", created);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) {
      close();
      showPaywall.value = true;
      return;
    }
    throw e;
  }
}
</script>
