<template>
  <div class="flex flex-col h-full">
    <PageHeader title="Campaign Settings" :subtitle="campaignStore.activeCampaign?.name ?? ''" />

    <div v-if="campaignStore.activeCampaign" class="flex flex-col md:flex-row flex-1 min-h-0">
      <!-- Sidebar tabs -->
      <aside class="hidden md:flex flex-col w-48 shrink-0 border-r border-border px-3 py-4 gap-0.5">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-cinzel tracking-wide transition-colors text-left w-full"
          :class="
            tab.id === 'danger'
              ? activeTab === 'danger'
                ? 'bg-destructive/10 text-destructive'
                : 'text-destructive/60 hover:text-destructive'
              : activeTab === tab.id
                ? 'bg-muted text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground'
          "
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </aside>

      <!-- Mobile top tabs -->
      <div class="md:hidden flex border-b border-border overflow-x-auto shrink-0 px-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="shrink-0 px-3 py-2.5 font-cinzel text-xs tracking-wide border-b-2 transition-colors whitespace-nowrap"
          :class="
            tab.id === 'danger'
              ? activeTab === 'danger'
                ? 'border-destructive text-destructive'
                : 'border-transparent text-destructive/60 hover:text-destructive'
              : activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
          "
          @click="setTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab content -->
      <main class="flex-1 overflow-y-auto px-6 py-6">
        <DetailsTab v-if="activeTab === 'details'" />
        <div v-else-if="activeTab === 'members'" class="space-y-6 max-w-2xl">
          <MembersTab />
          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-3">Invite Links</p>
            <InvitesTab />
          </div>
        </div>
        <div v-else-if="activeTab === 'scheduling'" class="max-w-2xl">
          <SchedulingTab />
        </div>
        <div v-else-if="activeTab === 'rules'" class="max-w-lg">
          <RulesTab />
        </div>
        <div v-else-if="activeTab === 'classes'" class="max-w-lg">
          <ClassesTab />
        </div>
        <div v-else-if="activeTab === 'species'" class="max-w-lg">
          <SpeciesTab />
        </div>
        <div v-else-if="activeTab === 'ai'" class="max-w-lg">
          <AiTab />
        </div>
        <div v-else-if="activeTab === 'connections'" class="max-w-2xl">
          <AiConnectionTab />
        </div>
        <div v-else-if="activeTab === 'spotify'" class="max-w-lg">
          <SpotifyTab />
        </div>
        <div v-else-if="activeTab === 'backup'" class="max-w-lg">
          <BackupTab />
        </div>
        <div v-else-if="activeTab === 'bundle'" class="max-w-lg">
          <WorldBundleTab />
        </div>
        <DangerZoneTab v-else-if="activeTab === 'danger'" />
      </main>
    </div>

    <!-- No active campaign fallback -->
    <div v-else class="flex flex-1 items-center justify-center">
      <EmptyState
        title="No campaign selected"
        description="Select or create a campaign to configure its settings."
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import PageHeader from "@/components/common/PageHeader.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import DetailsTab from "@/components/campaign/DetailsTab.vue";
import DangerZoneTab from "@/components/campaign/DangerZoneTab.vue";
import MembersTab from "@/components/campaign/MembersTab.vue";
import InvitesTab from "@/components/campaign/InvitesTab.vue";
import SchedulingTab from "@/components/campaign/SchedulingTab.vue";
import RulesTab from "@/components/campaign/RulesTab.vue";
import ClassesTab from "@/components/campaign/ClassesTab.vue";
import SpeciesTab from "@/components/campaign/SpeciesTab.vue";
import AiTab from "@/components/campaign/AiTab.vue";
import AiConnectionTab from "@/components/campaign/AiConnectionTab.vue";
import SpotifyTab from "@/components/campaign/SpotifyTab.vue";
import BackupTab from "@/components/campaign/BackupTab.vue";
import WorldBundleTab from "@/components/campaign/WorldBundleTab.vue";

type SettingsTab =
  | "details"
  | "members"
  | "scheduling"
  | "rules"
  | "classes"
  | "species"
  | "ai"
  | "connections"
  | "spotify"
  | "backup"
  | "bundle"
  | "danger";

const VALID_TABS = new Set<SettingsTab>([
  "details", "members", "scheduling", "rules", "classes", "species",
  "ai", "connections", "spotify", "backup", "bundle", "danger",
]);

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "members", label: "Members & Invites" },
  { id: "scheduling", label: "Scheduling" },
  { id: "rules", label: "Rules" },
  { id: "classes", label: "Classes" },
  { id: "species", label: "Species" },
  { id: "ai", label: "AI Assistant" },
  { id: "connections", label: "AI Connections" },
  { id: "spotify", label: "Spotify" },
  { id: "backup", label: "Backup" },
  { id: "bundle", label: "World Bundle" },
  { id: "danger", label: "Danger Zone" },
];

const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();

const activeTab = computed<SettingsTab>(() => {
  const t = route.query.tab as string;
  return VALID_TABS.has(t as SettingsTab) ? (t as SettingsTab) : "details";
});

function setTab(tab: SettingsTab) {
  router.replace({ query: { ...route.query, tab } });
}
</script>
