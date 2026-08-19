<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div
        class="bg-card border border-border rounded-lg w-full shadow-xl"
        :class="form.calendar_id === 'custom' ? 'max-w-3xl' : 'max-w-md'"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="text-heading font-bold text-foreground">New Campaign</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <form class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="submit">
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

          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1">RULESET</label>
            <AppSelect
              v-model="form.ruleset"
              tone="filled"
              weight="normal"
              size="body"
              block
            >
              <option v-for="option in RULESET_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </AppSelect>
            <p class="text-caption text-muted-foreground mt-1">
              Applies to character options, spells, creatures, items, rests, and encounter rules.
            </p>
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
            <label class="flex items-start gap-2.5 cursor-pointer">
              <input
                v-model="claimExisting"
                type="checkbox"
                class="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0"
              />
              <div>
                <span class="text-body text-foreground">Import existing data</span>
                <p class="text-caption text-muted-foreground italic mt-0.5">
                  Assign your existing notes, NPCs, party members, calendar events, and encounters to this campaign.
                </p>
              </div>
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <AppButton variant="subtle" size="md" label="Cancel" @click="close" />
            <AppButton
              type="submit"
              variant="primary"
              size="md"
              :disabled="isSaving"
              :label="isSaving ? 'Saving…' : 'Create Campaign'"
            />
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <PaywallModal v-model="showPaywall" resource="campaigns" />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { listCalendarAdapters, getCalendarAdapter, createDefaultCustomCalendarDef } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import { useCreateCampaign, useClaimOrphanedData } from "@/composables/useCampaigns";
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import type { Campaign } from "@/types/campaign.types";
import { DEFAULT_RULESET, RULESET_OPTIONS } from "@/types/ruleset.types";

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

const form = ref({
  name: "",
  setting: "",
  calendar_id: defaultCalendar?.id ?? "faerun",
  current_year: defaultCalendar?.defaultYear ?? 1495,
  ruleset: DEFAULT_RULESET,
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
      ruleset: DEFAULT_RULESET,
    };
    customCalendarDef.value = null;
    claimExisting.value = true;
  }
});

function close() {
  open.value = false;
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
  try {
    const created = await createCampaign({
      name: form.value.name,
      setting: form.value.setting || "Custom Setting",
      calendar_id: form.value.calendar_id,
      current_year: form.value.current_year,
      ruleset: form.value.ruleset,
      theme: "grimoire",
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
