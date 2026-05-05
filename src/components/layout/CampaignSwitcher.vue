<template>
  <div class="px-3 py-3 border-b border-border">
    <!-- Active campaign + switcher — show immediately if we have a stored campaign ID,
         even before the campaigns list finishes loading -->
    <div
      v-if="campaigns.length > 0 || campaignStore.activeCampaignId"
      class="relative"
    >
      <button
        class="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left"
        @click="open = !open"
      >
        <div
          class="h-7 w-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0"
        >
          <BookOpen class="h-3.5 w-3.5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <p
            class="font-cinzel text-xs font-bold text-foreground truncate leading-tight"
          >
            {{
              activeCampaign?.name ??
              (campaignsLoading ? "Loading…" : "Select Campaign")
            }}
          </p>
          <p
            class="font-fell text-[10px] text-muted-foreground italic truncate leading-tight flex items-center gap-1.5"
          >
            {{
              activeCampaign?.setting ??
              (campaignsLoading ? "" : "No campaign active")
            }}
            <span
              v-if="onlineCount > 0"
              class="inline-flex items-center gap-0.5 not-italic"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
              <span
                class="font-cinzel text-[9px] text-green-500 tracking-wider"
                >{{ onlineCount }}</span
              >
            </span>
          </p>
        </div>
        <ChevronDown
          class="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform"
          :class="open ? 'rotate-180' : ''"
        />
      </button>

      <!-- Click-outside backdrop -->
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />

      <!-- Dropdown -->
      <div
        v-if="open"
        class="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden"
      >
        <div class="py-1">
          <div
            v-for="c in campaigns"
            :key="c.id"
            class="group flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors cursor-pointer border-l-2"
            :class="c.id === activeCampaign?.id ? 'bg-primary/10 border-primary' : 'border-transparent'"
          >
            <!-- Campaign select area -->
            <button
              class="flex items-center gap-2 flex-1 min-w-0 text-left"
              @click="select(c)"
            >
              <span
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :class="
                  c.id === activeCampaign?.id
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                "
              />
              <div class="flex-1 min-w-0">
                <p
                  class="font-cinzel text-xs font-semibold text-foreground truncate"
                >
                  {{ c.name }}
                </p>
                <p
                  class="font-fell text-[10px] text-muted-foreground italic truncate"
                >
                  {{ c.setting }} · {{ c.current_year }}
                  {{ calendarEpoch(c.calendar_id) }}
                </p>
              </div>
            </button>
            <!-- Settings icon — always faintly visible, full on hover -->
            <RouterLink
              class="p-1 rounded opacity-25 group-hover:opacity-100 hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0"
              title="Campaign settings"
              :to="{ name: 'campaign-settings' }"
              @click.stop="select(c); open = false"
            >
              <Settings class="h-3 w-3" />
            </RouterLink>
          </div>
        </div>

        <!-- Archived campaigns -->
        <div v-if="archivedCampaigns.length > 0" class="border-t border-border py-1">
          <button
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left"
            @click="showArchived = !showArchived"
          >
            <Archive class="h-3 w-3 text-muted-foreground/60" />
            <span class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wider uppercase flex-1">
              Archived ({{ archivedCampaigns.length }})
            </span>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground/60 transition-transform"
              :class="showArchived ? 'rotate-180' : ''"
            />
          </button>
          <template v-if="showArchived">
            <div
              v-for="c in archivedCampaigns"
              :key="c.id"
              class="flex items-center gap-2 px-3 py-1.5"
            >
              <span class="flex-1 min-w-0">
                <p class="font-cinzel text-[10px] text-muted-foreground/60 truncate">{{ c.name }}</p>
              </span>
              <button
                class="font-cinzel text-[9px] tracking-wider text-primary/70 hover:text-primary transition-colors disabled:opacity-40 shrink-0"
                :disabled="!canCreateCampaign || isRestoring"
                :title="canCreateCampaign ? 'Restore campaign' : 'Upgrade to restore'"
                @click.stop="restore(c.id)"
              >
                Restore
              </button>
            </div>
          </template>
        </div>

        <div class="border-t border-border py-1">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            :disabled="isClaiming"
            @click="claimForActive"
          >
            <Download class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground">
              {{ isClaiming ? "Claiming…" : "Claim unclaimed data" }}
            </span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            @click="startCreate"
          >
            <Plus class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground"
              >New Campaign</span
            >
          </button>
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
            @click="showImport = true; open = false"
          >
            <UploadCloud class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground">Import from backup</span>
          </button>
        </div>
      </div>
    </div>

    <!-- No campaigns yet — only show after loading confirms there are truly none -->
    <div v-else-if="!campaignsLoading" class="px-2 py-1">
      <p class="font-fell text-xs text-muted-foreground italic mb-2">
        No campaigns yet.
      </p>
      <button
        class="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="startCreate"
      >
        <Plus class="h-3.5 w-3.5" />
        Create Campaign
      </button>
    </div>
  </div>

  <!-- New Campaign modal -->
  <Teleport to="body">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeModal"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-lg font-bold text-foreground">New Campaign</h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="closeModal"
          >
            ✕
          </button>
        </div>

        <form class="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="submitForm">
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

          <!-- Claim existing data — only shown when creating the first campaign -->
          <div
            v-if="isFirstCampaign"
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
              @click="closeModal"
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
  <ImportBackupModal v-model="showImport" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Archive, BookOpen, ChevronDown, Download, Plus, Settings, UploadCloud } from "lucide-vue-next";
import ImportBackupModal from "@/components/campaign/ImportBackupModal.vue";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useAuthStore } from "@/stores/auth";
import {
  useCampaigns,
  useArchivedCampaigns,
  useCreateCampaign,
  useClaimOrphanedData,
  useRestoreCampaign,
} from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { listCalendarAdapters, getCalendarAdapter } from "@/calendars/index";
import { getSetting, listSettings } from "@/settings/index";
import type { Campaign } from "@/types/campaign.types";
import { useQuota } from "@/composables/useQuota";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";

const campaignStore = useCampaignStore();
const { onlineUsers } = useCampaignPresence();
const auth = useAuthStore();

const onlineCount = computed(() => {
  const others = onlineUsers.value.filter((u) => u.user_id !== auth.user?.id);
  return new Set(others.map((u) => u.user_id)).size;
});

const { data: campaignList, isLoading: campaignsLoading } = useCampaigns();
const { data: archivedList } = useArchivedCampaigns();
const { mutateAsync: createCampaign, isPending: isSaving } = useCreateCampaign();
const { mutateAsync: claimOrphans, isPending: isClaiming } = useClaimOrphanedData();
const { mutateAsync: restoreCampaign, isPending: isRestoring } = useRestoreCampaign();

const campaigns = computed(() => campaignList.value ?? []);
const archivedCampaigns = computed(() => archivedList.value ?? []);
const activeCampaign = computed(() => campaignStore.activeCampaign);
const showArchived = ref(false);

const isFirstCampaign = computed(() => campaigns.value.length === 0);
const claimExisting = ref(true);

const availableCalendars = listCalendarAdapters();
const defaultCalendar = availableCalendars[0];

const form = ref({
  name: "",
  setting: "",
  calendar_id: defaultCalendar?.id ?? "faerun",
  current_year: defaultCalendar?.defaultYear ?? 1495,
});

const open = ref(false);
const showModal = ref(false);
const showPaywall = ref(false);
const showImport = ref(false);

const { canCreate: canCreateCampaign } = useQuota("campaigns");

// Auto-select first campaign on load if none is active
watch(
  campaigns,
  (list) => {
    if (list.length > 0 && !campaignStore.activeCampaignId) {
      campaignStore.switchToCampaign(list[0]);
    } else if (campaignStore.activeCampaignId && !campaignStore.activeCampaign) {
      const found = list.find((c) => c.id === campaignStore.activeCampaignId);
      if (found) campaignStore.switchToCampaign(found);
    }
  },
  { immediate: true },
);

function calendarEpoch(calendarId: string): string {
  return getCalendarAdapter(calendarId).epochName;
}

function select(campaign: Campaign) {
  campaignStore.switchToCampaign(campaign);
  open.value = false;
}

function startCreate() {
  open.value = false;
  if (!canCreateCampaign.value) { showPaywall.value = true; return; }
  form.value = {
    name: "",
    setting: "",
    calendar_id: defaultCalendar?.id ?? "faerun",
    current_year: defaultCalendar?.defaultYear ?? 1495,
  };
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

function onCalendarChange() {
  form.value.current_year = getCalendarAdapter(form.value.calendar_id).defaultYear;
  const newLabel = getSetting(form.value.calendar_id)?.label ?? "";
  const knownLabels = new Set(listSettings().map((s) => s.label));
  if (newLabel && (!form.value.setting || knownLabels.has(form.value.setting))) {
    form.value.setting = newLabel;
  }
}

async function submitForm() {
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
    });
    if (isFirstCampaign.value && claimExisting.value) {
      await claimOrphans(created.id);
    }
    campaignStore.switchToCampaign(created);
    closeModal();
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { closeModal(); showPaywall.value = true; return; }
    throw e;
  }
}

async function claimForActive() {
  if (!campaignStore.activeCampaignId) return;
  await claimOrphans(campaignStore.activeCampaignId);
  open.value = false;
}

async function restore(id: string) {
  await restoreCampaign(id);
  open.value = false;
}
</script>
