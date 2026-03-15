<template>
  <div class="min-h-screen bg-background flex flex-col">
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

    <CampaignChat />

    <!-- Content -->
    <main class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-4 py-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { LogOut, Shield, ScrollText, BookOpen, Package, User, Megaphone, X } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/useParty";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useCampaignBroadcast } from "@/composables/useCampaignBroadcast";
import CampaignChat from "@/components/chat/CampaignChat.vue";

const auth = useAuthStore();
const campaign = useCampaignStore();
const router = useRouter();
const { data: partyMembers } = useParty();

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
  { to: "/play",           label: "Character", icon: User },
  { to: "/play/party",     label: "Party",     icon: Shield },
  { to: "/play/quests",    label: "Quests",    icon: ScrollText },
  { to: "/play/notes",     label: "Notes",     icon: BookOpen },
  { to: "/play/inventory", label: "Inventory", icon: Package },
];

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
