<template>
  <AppModal :open="open" :size="form.calendar_id === 'custom' ? 'lg' : 'md'" @close="close">
    <ModalHeader title="New Campaign" closeable @close="close" />

    <form class="min-h-0 flex-1 flex flex-col overflow-hidden" @submit.prevent="submit">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1">RULES EDITION</label>
          <RulesetPicker v-model="form.ruleset" label="Rules edition" />
          <p class="text-caption text-muted-foreground mt-1">
            Applies to character options, spells, creatures, items, rests, and encounter rules.
          </p>
          <AppCheckbox
            v-model="form.allows_mixed_rulesets"
            label="Allow characters built with the other edition"
            hint="Off: a character built with the other edition is asked to bring a converted copy."
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
          :disabled="isSaving || !form.ruleset"
          :label="isSaving ? 'Saving…' : 'Create Campaign'"
        />
      </div>
    </form>
  </AppModal>

  <PaywallModal v-model="showPaywall" resource="campaigns" />
</template>

<script setup lang="ts">
import { DEFAULT_THEME_ID } from "@/lib/themes";
import { ref, watch } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { listCalendarAdapters, getCalendarAdapter, createDefaultCustomCalendarDef } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import { useCreateCampaign, useClaimOrphanedData } from "@/composables/campaign/useCampaigns";
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import DemoCampaignOffer from "@/components/campaign/DemoCampaignOffer.vue";
import type { Campaign } from "@/types/campaign.types";
import type { RulesetKey } from "@/types/ruleset.types";
import RulesetPicker from "@/components/rules/RulesetPicker.vue";

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
const defaultCalendar = availableCalendars[0];

// The edition starts unchosen: it is asked first (#943), and a preselected one
// is an edition nobody picked. The form cannot be submitted without it.
const form = ref<{
  name: string;
  setting: string;
  calendar_id: string;
  current_year: number;
  ruleset: RulesetKey | null;
  allows_mixed_rulesets: boolean;
}>({
  name: "",
  setting: "",
  calendar_id: defaultCalendar?.id ?? "faerun",
  current_year: defaultCalendar?.defaultYear ?? 1495,
  ruleset: null,
  allows_mixed_rulesets: false,
});
const customCalendarDef = ref<SettingCalendarDef | null>(null);
const claimExisting = ref(true);
const showPaywall = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      name: "",
      setting: "",
      calendar_id: defaultCalendar?.id ?? "faerun",
      current_year: defaultCalendar?.defaultYear ?? 1495,
      ruleset: null,
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
  form.value.current_year = getCalendarAdapter(form.value.calendar_id).defaultYear;
  const newLabel = getSetting(form.value.calendar_id)?.label ?? "";
  const knownLabels = new Set(listSettings().map((s) => s.label));
  if (newLabel && (!form.value.setting || knownLabels.has(form.value.setting))) {
    form.value.setting = newLabel;
  }
}

async function submit() {
  const ruleset = form.value.ruleset;
  if (!ruleset) return;
  try {
    const created = await createCampaign({
      name: form.value.name,
      setting: form.value.setting || "Custom Setting",
      calendar_id: form.value.calendar_id,
      current_year: form.value.current_year,
      ruleset,
      allows_mixed_rulesets: form.value.allows_mixed_rulesets,
      theme: DEFAULT_THEME_ID,
      health_visibility: "strategic",
      immersive_rolls: false,
      description: null,
      spotify_client_id: null,
      is_archived: false,
      // ai_enabled deliberately omitted — new campaigns start unchosen
      // (null); see the column comment on campaigns.ai_enabled.
      battle_map_show_tokens: true,
      custom_calendar: form.value.calendar_id === "custom" ? customCalendarDef.value : null,
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
