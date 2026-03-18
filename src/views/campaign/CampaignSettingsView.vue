<template>
  <div>
    <PageHeader
      title="Campaign Settings"
      description="Manage players, invite links, and campaign configuration"
    />

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 rounded-md border border-border p-1 bg-muted w-fit">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="px-4 py-1.5 rounded text-sm font-cinzel tracking-wide transition-colors"
        :class="activeTab === tab.id
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <MembersTab  v-if="activeTab === 'members'"  @switch-tab="activeTab = $event as typeof activeTab" />
    <InvitesTab  v-else-if="activeTab === 'invites'" />
    <WorldTab    v-else-if="activeTab === 'world'" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import PageHeader from "@/components/common/PageHeader.vue";
import MembersTab from "@/components/campaign/MembersTab.vue";
import InvitesTab from "@/components/campaign/InvitesTab.vue";
import WorldTab from "@/components/campaign/WorldTab.vue";

const tabs = [
  { id: "members", label: "Members" },
  { id: "invites", label: "Invite Links" },
  { id: "world",   label: "World Settings" },
] as const;

const activeTab = ref<(typeof tabs)[number]["id"]>("members");
</script>
