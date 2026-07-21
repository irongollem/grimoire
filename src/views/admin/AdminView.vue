<template>
  <div class="flex flex-col h-full min-h-0 overflow-hidden">
    <!-- Header -->
    <div class="px-4 pt-4 pb-3 md:px-6 md:pt-6 shrink-0">
      <h1 class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide">
        Admin Panel
      </h1>
      <p class="text-body md:text-base text-muted-foreground italic mt-0.5">
        Plans, subscriptions, invites &amp; AI management
      </p>
      <div class="gold-divider mt-3" />
    </div>

    <!-- Tabs bar -->
    <div class="px-4 md:px-6 shrink-0 flex gap-1 border-b border-border overflow-x-auto">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="flex items-center gap-1.5 px-4 py-2.5 text-label-lg font-semibold border-b-2 -mb-px transition-colors shrink-0"
        :class="
          activeTab === tab.id
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="setTab(tab.id)"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab body -->
    <div class="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5">
      <AdminPlansTab     v-if="activeTab === 'plans'" />
      <AdminUsersTab     v-else-if="activeTab === 'users'" />
      <AdminInvitesTab   v-else-if="activeTab === 'invites'" />
      <AdminContentTab   v-else-if="activeTab === 'content'" />
      <AdminPricingTab   v-else-if="activeTab === 'pricing'" />
      <AdminCreditsTab   v-else-if="activeTab === 'credits'" />
      <AdminPromptsTab   v-else-if="activeTab === 'prompts'" />
      <AdminProvidersTab v-else-if="activeTab === 'providers'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAddUser, IconCoins, IconDocument, IconGridView, IconLibrary, IconParty, IconSettings, IconTag } from "@/lib/icons";
import AdminPlansTab     from "@/components/admin/AdminPlansTab.vue";
import AdminUsersTab     from "@/components/admin/AdminUsersTab.vue";
import AdminInvitesTab   from "@/components/admin/AdminInvitesTab.vue";
import AdminContentTab   from "@/components/admin/AdminContentTab.vue";
import AdminPricingTab   from "@/components/admin/AdminPricingTab.vue";
import AdminCreditsTab   from "@/components/admin/AdminCreditsTab.vue";
import AdminPromptsTab   from "@/components/admin/AdminPromptsTab.vue";
import AdminProvidersTab from "@/components/admin/AdminProvidersTab.vue";

const route = useRoute();
const router = useRouter();

type TabId = "plans" | "users" | "invites" | "content" | "pricing" | "credits" | "prompts" | "providers";
const VALID_TABS = new Set<string>(["plans", "users", "invites", "content", "pricing", "credits", "prompts", "providers"]);
const TABS = [
  { id: "plans"     as TabId, label: "Plans",     icon: IconGridView },
  { id: "users"     as TabId, label: "Users",     icon: IconParty },
  { id: "invites"   as TabId, label: "Invites",   icon: IconAddUser },
  { id: "content"   as TabId, label: "Content",   icon: IconLibrary },
  { id: "pricing"   as TabId, label: "Pricing",   icon: IconTag },
  { id: "credits"   as TabId, label: "Credits",   icon: IconCoins },
  { id: "prompts"   as TabId, label: "Prompts",   icon: IconDocument },
  { id: "providers" as TabId, label: "Providers", icon: IconSettings },
];

const activeTab = computed<TabId>(() => {
  const q = route.query.tab;
  // 'keys' tab was merged into 'providers'
  if (q === "keys") return "providers";
  return VALID_TABS.has(q as string) ? (q as TabId) : "plans";
});

function setTab(id: TabId) {
  router.replace({ query: { ...route.query, tab: id } });
}
</script>
