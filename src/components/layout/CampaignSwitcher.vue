<template>
  <div class="px-3 py-3 border-b border-border">
    <!-- Active campaign + switcher — show immediately if we have a stored campaign ID,
         even before the campaigns list finishes loading -->
    <div
      v-if="campaigns.length > 0 || campaignStore.activeCampaignId"
      class="relative"
    >
      <AppButton
        variant="menu"
        size="body"
        block
        @click="open = !open"
      >
        <div
          class="h-7 w-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0"
        >
          <IconNavCampaign class="h-3.5 w-3.5 text-primary" />
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
            class="text-caption-sm text-muted-foreground italic truncate leading-tight flex items-center gap-1.5"
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
                class="text-label text-green-500"
                >{{ onlineCount }}</span
              >
            </span>
          </p>
        </div>
        <IconChevronDown
          class="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform"
          :class="open ? 'rotate-180' : ''"
        />
      </AppButton>

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
                  class="text-caption-sm text-muted-foreground italic truncate"
                >
                  {{ c.setting }} · {{ c.current_year }}
                  {{ calendarEpoch(c.calendar_id) }}
                </p>
              </div>
            </button>
            <!-- IconSettingsAlt icon — always faintly visible, full on hover -->
            <RouterLink
              class="p-1 rounded opacity-25 group-hover:opacity-100 hover:bg-background text-muted-foreground hover:text-foreground transition-all shrink-0"
              title="Campaign settings"
              :to="{ name: 'campaign-settings' }"
              @click.stop="select(c); open = false"
            >
              <IconSettingsAlt class="h-3 w-3" />
            </RouterLink>
          </div>
        </div>

        <!-- Archived campaigns -->
        <div v-if="archivedCampaigns.length > 0" class="border-t border-border py-1">
          <AppButton
            variant="menu"
            size="sm"
            block
            @click="showArchived = !showArchived"
          >
            <IconArchive class="h-3 w-3 text-muted-foreground/60" />
            <span class="text-eyebrow text-muted-foreground/60 flex-1">
              Archived ({{ archivedCampaigns.length }})
            </span>
            <IconChevronDown
              class="h-3 w-3 text-muted-foreground/60 transition-transform"
              :class="showArchived ? 'rotate-180' : ''"
            />
          </AppButton>
          <template v-if="showArchived">
            <div
              v-for="c in archivedCampaigns"
              :key="c.id"
              class="flex items-center gap-2 px-3 py-1.5"
            >
              <span class="flex-1 min-w-0">
                <p class="font-cinzel text-2xs text-muted-foreground/60 truncate">{{ c.name }}</p>
              </span>
              <button
                class="text-label text-primary/70 hover:text-primary transition-colors disabled:opacity-40 shrink-0"
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
          <AppButton
            variant="menu"
            size="sm"
            block
            :disabled="isClaiming"
            @click="claimForActive"
          >
            <IconDownload class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground">
              {{ isClaiming ? "Claiming…" : "Claim unclaimed data" }}
            </span>
          </AppButton>
          <AppButton
            variant="menu"
            size="sm"
            block
            @click="startCreate"
          >
            <IconAdd class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground"
              >New Campaign</span
            >
          </AppButton>
          <AppButton
            variant="menu"
            size="sm"
            block
            @click="showImport = true; open = false"
          >
            <IconUploadCloud class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="font-cinzel text-xs text-muted-foreground">Import from backup</span>
          </AppButton>
        </div>
      </div>
    </div>

    <!-- No campaigns yet — only show after loading confirms there are truly none -->
    <div v-else-if="!campaignsLoading" class="px-2 py-1">
      <p class="text-caption text-muted-foreground italic mb-2">
        No campaigns yet.
      </p>
      <AppButton
        variant="primary"
        size="sm"
        block
        :icon="IconAdd"
        label="Create Campaign"
        @click="startCreate"
      />
    </div>
  </div>

  <NewCampaignModal
    v-if="newCampaignMounted"
    v-model="showModal"
    :show-claim-option="isFirstCampaign"
    @created="onCampaignCreated"
  />
  <PaywallModal v-model="showPaywall" resource="campaigns" />
  <ImportBackupModal v-if="importMounted" v-model="showImport" />
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch } from "vue";
import { IconAdd, IconArchive, IconChevronDown, IconDownload, IconNavCampaign, IconSettingsAlt, IconUploadCloud } from '@/lib/icons';
import { useLazyMount } from "@/composables/useLazyMount";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useAuthStore } from "@/stores/auth";
import {
  useCampaigns,
  useArchivedCampaigns,
  useClaimOrphanedData,
  useRestoreCampaign,
} from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { getCalendarAdapter } from "@/calendars/index";
import type { Campaign } from "@/types/campaign.types";
import { useQuota } from "@/composables/useQuota";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";

const campaignStore = useCampaignStore();
const { onlineUsers } = useCampaignPresence();
const auth = useAuthStore();

const onlineCount = computed(() => {
  const others = onlineUsers.value.filter((u) => u.user_id !== auth.user?.id);
  return new Set(others.map((u) => u.user_id)).size;
});

const { data: campaignList, isLoading: campaignsLoading } = useCampaigns();
const { data: archivedList } = useArchivedCampaigns();
const { mutateAsync: claimOrphans, isPending: isClaiming } = useClaimOrphanedData();
const { mutateAsync: restoreCampaign, isPending: isRestoring } = useRestoreCampaign();

const campaigns = computed(() => campaignList.value ?? []);
const archivedCampaigns = computed(() => archivedList.value ?? []);
const activeCampaign = computed(() => campaignStore.activeCampaign);
const showArchived = ref(false);

const isFirstCampaign = computed(() => campaigns.value.length === 0);

const open = ref(false);
// Deferred — the switcher sits in the always-mounted sidebar, so anything it
// imports statically is entry-chunk weight on every cold load. NewCampaignModal
// pulls CalendarEditor; ImportBackupModal pulls useCampaignBackup. Neither is
// reachable without a click, and most sessions never click.
const NewCampaignModal = defineAsyncComponent(
  () => import("@/components/campaign/NewCampaignModal.vue"),
);
const ImportBackupModal = defineAsyncComponent(
  () => import("@/components/campaign/ImportBackupModal.vue"),
);

const showModal = ref(false);
const showPaywall = ref(false);
const showImport = ref(false);
const newCampaignMounted = useLazyMount(showModal);
const importMounted = useLazyMount(showImport);

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
  showModal.value = true;
}

function onCampaignCreated(campaign: Campaign) {
  campaignStore.switchToCampaign(campaign);
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
