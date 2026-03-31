<template>
  <div class="px-3 py-3 border-b border-border">
    <!-- Active campaign + switcher -->
    <div v-if="campaigns.length > 0" class="relative">
      <button
        class="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent transition-colors text-left"
        @click="open = !open"
      >
        <div class="h-7 w-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
          <BookOpen class="h-3.5 w-3.5 text-primary" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-xs font-bold text-foreground truncate leading-tight">
            {{ activeCampaign?.name ?? "Select Campaign" }}
          </p>
          <p class="font-fell text-[10px] text-muted-foreground italic truncate leading-tight flex items-center gap-1.5">
            {{ activeCampaign?.setting ?? "No campaign active" }}
            <span v-if="onlineCount > 0" class="inline-flex items-center gap-0.5 not-italic">
              <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
              <span class="font-cinzel text-[9px] text-green-500 tracking-wider">{{ onlineCount }}</span>
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
            class="group flex items-center gap-2 px-3 py-2 hover:bg-navy-800 transition-colors"
            :class="c.id === activeCampaign?.id ? 'bg-navy-800' : ''"
          >
            <!-- Campaign select area -->
            <button class="flex items-center gap-2 flex-1 min-w-0 text-left" @click="select(c)">
              <span
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :class="c.id === activeCampaign?.id ? 'bg-primary' : 'bg-muted-foreground/30'"
              />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ c.name }}</p>
                <p class="font-fell text-[10px] text-muted-foreground italic truncate">
                  {{ c.setting }} · {{ c.current_year }} {{ calendarEpoch(c.calendar_id) }}
                </p>
              </div>
            </button>
            <!-- Edit icon — visible on row hover -->
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                class="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                title="Edit campaign"
                @click.stop="startEdit(c)"
              >
                <Pencil class="h-3 w-3" />
              </button>
            </div>
          </div>
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
            <span class="font-cinzel text-xs text-muted-foreground">New Campaign</span>
          </button>
        </div>
      </div>
    </div>

    <!-- No campaigns yet -->
    <div v-else class="px-2 py-1">
      <p class="font-fell text-xs text-muted-foreground italic mb-2">No campaigns yet.</p>
      <button
        class="w-full flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        @click="startCreate"
      >
        <Plus class="h-3.5 w-3.5" />
        Create Campaign
      </button>
    </div>
  </div>

  <!-- Create / Edit modal -->
  <Teleport to="body">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeModal"
    >
      <div
        class="bg-card border border-border rounded-lg w-full shadow-xl transition-all"
        :class="editing && activeModalTab !== 'details' ? 'max-w-xl' : 'max-w-md'"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-lg font-bold text-foreground">
            {{ editing ? "Edit Campaign" : "New Campaign" }}
          </h2>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="closeModal"
          >
            ✕
          </button>
        </div>

        <!-- Tabs — only shown when editing an existing campaign -->
        <div v-if="editing" class="flex gap-1 px-5 pt-4 pb-0">
          <button
            v-for="tab in modalTabs"
            :key="tab.id"
            class="px-3 py-1.5 rounded text-xs font-cinzel tracking-wide transition-colors"
            :class="tab.id === 'danger'
              ? activeModalTab === 'danger' ? 'bg-destructive/10 text-destructive' : 'text-destructive/60 hover:text-destructive'
              : activeModalTab === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
            @click="activeModalTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Members tab -->
        <div v-if="editing && activeModalTab === 'members'" class="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <MembersTab @switch-tab="activeModalTab = $event as ModalTab" />
        </div>

        <!-- Invites tab -->
        <div v-else-if="editing && activeModalTab === 'invites'" class="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <InvitesTab />
        </div>

        <!-- AI Assistant tab -->
        <div v-else-if="editing && activeModalTab === 'ai'" class="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <AiTab />
        </div>

        <!-- Danger Zone tab -->
        <div v-else-if="editing && activeModalTab === 'danger'" class="px-5 py-6 space-y-4">
          <div class="border border-destructive/40 rounded-lg p-4 space-y-3">
            <p class="font-cinzel text-xs font-semibold tracking-wider text-destructive">DELETE CAMPAIGN</p>
            <p class="font-fell text-sm text-muted-foreground">
              This permanently deletes <span class="text-foreground font-semibold">{{ editing.name }}</span>.
              Your notes, NPCs, party members, calendar events, and encounters will have their campaign link removed but will not be deleted.
            </p>
            <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">
              TYPE <span class="text-foreground">{{ editing.name }}</span> TO CONFIRM
            </p>
            <input
              v-model="deleteConfirmInput"
              type="text"
              autocomplete="off"
              :placeholder="editing.name"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
            />
            <button
              type="button"
              :disabled="deleteConfirmInput !== editing.name || isDeleting"
              class="w-full px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-destructive text-destructive-foreground rounded-md hover:opacity-90 disabled:opacity-30 transition-opacity"
              @click="doDelete"
            >
              {{ isDeleting ? "Deleting…" : "Delete Campaign" }}
            </button>
          </div>
        </div>

        <!-- Details tab (default, and only content when creating) -->
        <form v-else class="px-5 py-4 space-y-4" @submit.prevent="submitForm">
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
              NAME
            </label>
            <input
              v-model="form.name"
              required
              type="text"
              placeholder="The Lost Mine of Phandelver…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
              WORLD
            </label>
            <input
              v-model="form.setting"
              type="text"
              placeholder="Faerûn, Eberron, Homebrew…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
                SETTING
              </label>
              <select
                v-model="form.calendar_id"
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @change="onCalendarChange"
              >
                <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">
                  {{ cal.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">
                CURRENT YEAR
              </label>
              <input
                v-model.number="form.current_year"
                type="number"
                min="1"
                class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
              THEME
            </label>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="theme in themes"
                :key="theme.id"
                type="button"
                class="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors text-left"
                :class="form.theme === theme.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border/80 hover:bg-muted/40'"
                @click="form.theme = theme.id"
              >
                <div class="shrink-0 flex gap-1">
                  <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--background'] }" />
                  <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--primary'] }" />
                  <span class="block h-4 w-4 rounded-full border border-black/10" :style="{ background: theme.vars['--card'] }" />
                </div>
                <span class="flex-1 font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ theme.label }}</span>
                <Check v-if="form.theme === theme.id" class="h-3.5 w-3.5 text-primary shrink-0" />
              </button>
            </div>
          </div>

          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
              HEALTH VISIBILITY
            </label>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="opt in HEALTH_VIS_OPTIONS"
                :key="opt.value"
                type="button"
                class="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors text-left"
                :class="form.health_visibility === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border/80 hover:bg-muted/40'"
                @click="form.health_visibility = opt.value"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-cinzel text-xs font-semibold text-foreground tracking-wide">{{ opt.label }}</span>
                  <p class="font-fell text-xs text-muted-foreground mt-0.5">{{ opt.desc }}</p>
                </div>
                <Check v-if="form.health_visibility === opt.value" class="h-3.5 w-3.5 text-primary shrink-0" />
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

          <!-- Claim existing data — only shown when creating the first campaign -->
          <div v-if="isFirstCampaign && !editing" class="rounded-md border border-border bg-muted/50 px-3 py-2.5">
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
              {{ isSaving ? "Saving…" : editing ? "Save Changes" : "Create Campaign" }}
            </button>
          </div>

        </form>
      </div>
    </div>

  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { BookOpen, ChevronDown, Check, Download, Pencil, Plus } from "lucide-vue-next";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useTheme } from "@/composables/useTheme";
import { useAuthStore } from "@/stores/auth";
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useClaimOrphanedData,
} from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { listCalendarAdapters, getCalendarAdapter } from "@/calendars/index";
import type { Campaign } from "@/types/campaign.types";
import MembersTab from "@/components/campaign/MembersTab.vue";
import InvitesTab from "@/components/campaign/InvitesTab.vue";
import AiTab from "@/components/campaign/AiTab.vue";

type ModalTab = "details" | "members" | "invites" | "ai" | "danger";

const modalTabs: { id: ModalTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invite Links" },
  { id: "ai",      label: "AI Assistant" },
  { id: "danger",  label: "Danger Zone" },
];

const activeModalTab = ref<ModalTab>("details");

const { themes, setTheme } = useTheme();
const campaignStore = useCampaignStore();
const { onlineUsers } = useCampaignPresence();
const auth = useAuthStore();
// Count distinct users online (excluding yourself)
const onlineCount = computed(() => {
  const others = onlineUsers.value.filter((u) => u.user_id !== auth.user?.id);
  return new Set(others.map((u) => u.user_id)).size;
});
const { data: campaignList } = useCampaigns();
const { mutateAsync: createCampaign, isPending: isCreating } = useCreateCampaign();
const { mutateAsync: updateCampaign, isPending: isUpdating } = useUpdateCampaign();
const { mutateAsync: deleteCampaign, isPending: isDeleting } = useDeleteCampaign();
const { mutateAsync: claimOrphans, isPending: isClaiming } = useClaimOrphanedData();

const campaigns = computed(() => campaignList.value ?? []);
const activeCampaign = computed(() => campaignStore.activeCampaign);
const isSaving = computed(() => isCreating.value || isUpdating.value);

const open = ref(false);
const editing = ref<Campaign | null>(null);
const deleteConfirmInput = ref("");

// True when there are no campaigns yet — offer to claim pre-existing data
const isFirstCampaign = computed(() => campaigns.value.length === 0);
const claimExisting = ref(true);

const availableCalendars = listCalendarAdapters();
const defaultCalendar = availableCalendars[0];

const form = ref({
  name: "",
  setting: "",
  calendar_id: defaultCalendar?.id ?? "faerun",
  current_year: defaultCalendar?.defaultYear ?? 1495,
  theme: "grimoire",
  health_visibility: "strategic" as "strategic" | "immersive" | "unknown",
  immersive_rolls: false,
});

const HEALTH_VIS_OPTIONS = [
  { value: "strategic" as const, label: "Strategic", desc: "HP bars + labels for all. Exact numbers for PCs only." },
  { value: "immersive" as const, label: "Immersive", desc: "PCs show bar only (no numbers). Monsters show status words only." },
  { value: "unknown" as const,   label: "Unknown",   desc: "No health info shown for non-PCs." },
];

const showModal = ref(false);

// Auto-select first campaign on load if none is active
watch(campaigns, (list) => {
  if (list.length > 0 && !campaignStore.activeCampaignId) {
    const first = list[0];
    campaignStore.switchToCampaign(first);
  } else if (campaignStore.activeCampaignId && !campaignStore.activeCampaign) {
    const found = list.find((c) => c.id === campaignStore.activeCampaignId);
    if (found) campaignStore.switchToCampaign(found);
  }
}, { immediate: true });

function calendarEpoch(calendarId: string): string {
  return getCalendarAdapter(calendarId).epochName;
}

function select(campaign: Campaign) {
  campaignStore.switchToCampaign(campaign);
  open.value = false;
}

function startCreate() {
  editing.value = null;
  form.value = {
    name: "",
    setting: "",
    calendar_id: defaultCalendar?.id ?? "faerun",
    current_year: defaultCalendar?.defaultYear ?? 1495,
    theme: "grimoire",
    health_visibility: "strategic",
    immersive_rolls: false,
  };
  showModal.value = true;
  open.value = false;
}

function startEdit(campaign: Campaign) {
  editing.value = campaign;
  deleteConfirmInput.value = "";
  form.value = {
    name: campaign.name,
    setting: campaign.setting,
    calendar_id: campaign.calendar_id,
    current_year: campaign.current_year,
    theme: campaign.theme ?? "grimoire",
    health_visibility: (campaign.health_visibility as "strategic" | "immersive" | "unknown") ?? "strategic",
    immersive_rolls: campaign.immersive_rolls ?? false,
  };
  showModal.value = true;
  open.value = false;
}

function closeModal() {
  showModal.value = false;
  editing.value = null;
  activeModalTab.value = "details";
  deleteConfirmInput.value = "";
}

function onCalendarChange() {
  // Only reset year when creating — don't clobber user's campaign year when editing
  if (!editing.value) {
    form.value.current_year = getCalendarAdapter(form.value.calendar_id).defaultYear;
  }
}

async function submitForm() {
  if (editing.value) {
    const updated = await updateCampaign({
      id: editing.value.id,
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
    // If editing the active campaign, re-sync store (also applies theme)
    if (campaignStore.activeCampaignId === updated.id) {
      campaignStore.switchToCampaign(updated);
    } else {
      setTheme(form.value.theme);
    }
  } else {
    const created = await createCampaign({
      name: form.value.name,
      setting: form.value.setting || "Custom Setting",
      calendar_id: form.value.calendar_id,
      current_year: form.value.current_year,
      theme: form.value.theme,
      health_visibility: form.value.health_visibility,
      immersive_rolls: form.value.immersive_rolls,
      description: null,
    });
    if (isFirstCampaign.value && claimExisting.value) {
      await claimOrphans(created.id);
    }
    campaignStore.switchToCampaign(created);
  }
  closeModal();
}

async function doDelete() {
  if (!editing.value || deleteConfirmInput.value !== editing.value.name) return;
  const deletedId = editing.value.id;
  await deleteCampaign(deletedId);
  closeModal();
  if (campaignStore.activeCampaignId === deletedId) {
    const remaining = campaigns.value.filter((c) => c.id !== deletedId);
    if (remaining.length > 0) {
      campaignStore.switchToCampaign(remaining[0]);
    } else {
      campaignStore.clearActiveCampaign();
    }
  }
}

async function claimForActive() {
  if (!campaignStore.activeCampaignId) return;
  await claimOrphans(campaignStore.activeCampaignId);
  open.value = false;
}
</script>
