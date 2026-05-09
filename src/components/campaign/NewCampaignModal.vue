<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-lg font-bold text-foreground">New Campaign</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <form class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="submit">
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

          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">WORLD</label>
            <input
              v-model="form.setting"
              list="new-campaign-settings-list"
              type="text"
              placeholder="Forgotten Realms, Eberron, Homebrew…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                <span class="font-fell text-sm text-foreground">Import existing data</span>
                <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
                  Assign your existing notes, NPCs, party members, calendar events, and encounters to this campaign.
                </p>
              </div>
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="isSaving"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {{ isSaving ? "Saving…" : "Create Campaign" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>

  <PaywallModal v-model="showPaywall" resource="campaigns" />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { listCalendarAdapters, getCalendarAdapter } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import { useCreateCampaign, useClaimOrphanedData } from "@/composables/useCampaigns";
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/PaywallModal.vue";
import type { Campaign } from "@/types/campaign.types";

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
});
const claimExisting = ref(true);
const showPaywall = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      name: "",
      setting: "",
      calendar_id: defaultCalendar?.id ?? "faerun",
      current_year: defaultCalendar?.defaultYear ?? 1495,
    };
    claimExisting.value = true;
  }
});

function close() {
  open.value = false;
}

function onCalendarChange() {
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
      theme: "grimoire",
      health_visibility: "strategic",
      immersive_rolls: false,
      description: null,
      spotify_client_id: null,
      is_archived: false,
      ai_enabled: true,
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
