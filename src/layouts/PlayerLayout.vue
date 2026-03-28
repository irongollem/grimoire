<template>
  <div class="h-dvh bg-background flex flex-col overflow-hidden">
    <!-- Top bar -->
    <header class="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
      <div class="flex items-center gap-2 shrink-0">
        <span class="font-cinzel text-base font-bold text-gold-500 tracking-widest">Grimoire</span>
        <span class="font-fell text-xs text-muted-foreground italic hidden sm:inline">
          · {{ campaignName }}
        </span>
      </div>

      <!-- Nav tabs -->
      <nav class="flex-1 flex items-center gap-1 overflow-x-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-fell transition-colors shrink-0"
          :class="$route.path === item.to
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-navy-800'"
        >
          <component :is="item.icon" class="h-3.5 w-3.5 shrink-0" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <!-- Character name + sign out -->
      <div class="flex items-center gap-3 shrink-0">
        <span v-if="characterName" class="font-cinzel text-xs text-foreground hidden sm:inline">
          {{ characterName }}
        </span>
        <button
          class="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Sign out"
          @click="handleSignOut"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </header>

    <!-- DM preview banner -->
    <div
      v-if="ui.dmPreviewMode"
      class="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center gap-3 shrink-0"
    >
      <Eye class="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span class="font-cinzel text-xs text-amber-400 tracking-wider shrink-0">DM Preview — viewing as:</span>
      <select
        :value="ui.dmPreviewPartyMemberId ?? ''"
        class="flex-1 min-w-0 max-w-48 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 font-fell text-xs text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        @change="ui.dmPreviewPartyMemberId = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">— pick a character —</option>
        <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
      <button
        class="font-cinzel text-[10px] tracking-wider text-amber-400 hover:text-amber-300 border border-amber-500/40 hover:border-amber-400/60 px-2 py-0.5 rounded transition-colors shrink-0"
        @click="exitPreview"
      >
        Exit Preview
      </button>
    </div>

    <!-- Broadcast toast stack -->
    <Transition name="toast">
      <div
        v-if="latestMessage"
        class="fixed top-16 right-4 z-50 w-full max-w-sm"
      >
        <div class="rounded-lg border border-primary/30 bg-card shadow-gold-glow px-4 py-3 flex items-start gap-3">
          <Megaphone class="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">DM Announcement</p>
            <p class="font-fell text-sm text-foreground mt-0.5">{{ latestMessage.text }}</p>
          </div>
          <button
            class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            @click="dismiss(latestMessage.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- Content + chat side panel -->
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <main class="flex-1 overflow-y-auto">
        <div class="px-4 py-6">
          <RouterView />
        </div>
      </main>
      <CampaignChat :contained="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { LogOut, Shield, ScrollText, BookOpen, Package, User, Megaphone, X, Swords, PenLine, Eye, Settings, Library, Landmark, Globe, Sparkles } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignById } from "@/composables/useCampaigns";
import { useParty } from "@/composables/useParty";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useCampaignBroadcast } from "@/composables/useCampaignBroadcast";
import CampaignChat from "@/components/chat/CampaignChat.vue";

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();

// Bootstrap: set activeCampaignId from membership (needed for new players without localStorage entry)
// and load the campaign object so switchToCampaign can apply the DM's theme.
const membershipCampaignId = computed(() => auth.membership?.campaign_id ?? null);
watch(membershipCampaignId, (id) => {
  if (id && !campaign.activeCampaignId) campaign.activeCampaignId = id;
}, { immediate: true });

const { data: campaignData } = useCampaignById(() => campaign.activeCampaignId);
watch(campaignData, (c) => {
  if (c && (!campaign.activeCampaign || campaign.activeCampaign.theme !== c.theme)) {
    campaign.switchToCampaign(c);
  }
}, { immediate: true });
const router = useRouter();
const { data: partyMembers } = useParty();

// Auto-select the first party member when entering DM preview with no character chosen
watch(
  [() => ui.dmPreviewMode, partyMembers],
  ([previewMode, members]) => {
    if (previewMode && !ui.dmPreviewPartyMemberId && members?.length) {
      ui.dmPreviewPartyMemberId = members[0].id;
    }
  },
  { immediate: true },
);

// Join presence channel so DM can see player is online
useCampaignPresence();

// Subscribe to DM broadcasts
const { messages, dismiss } = useCampaignBroadcast();
const latestMessage = computed(() => messages.value[0] ?? null);

const campaignName = computed(() => campaign.activeCampaign?.name ?? "Campaign");

const characterName = computed(() => {
  if (!auth.linkedPartyMemberId || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId)?.name ?? null;
});

const navItems = [
  { to: "/play",            label: "Character", icon: User },
  { to: "/play/party",      label: "People",    icon: Shield },
  { to: "/play/inventory",  label: "Inventory", icon: Package },
  { to: "/play/quests",     label: "Quests",    icon: ScrollText },
  { to: "/play/journal",    label: "Journal",   icon: PenLine },
  { to: "/play/notes",      label: "DM Notes",  icon: BookOpen },
  { to: "/play/factions",   label: "Factions",   icon: Landmark },
  { to: "/play/atlas",      label: "Atlas",      icon: Globe },
  { to: "/play/encounter",  label: "Encounter",  icon: Swords },
  { to: "/play/spells",     label: "Spells",     icon: Sparkles },
  { to: "/play/rules",      label: "Reliquary",  icon: Library },
  { to: "/play/settings",   label: "Settings",   icon: Settings },
];

function exitPreview() {
  ui.exitDmPreview();
  router.push({ name: "dashboard" });
}

async function handleSignOut() {
  await auth.signOut();
  router.push({ name: "login" });
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
