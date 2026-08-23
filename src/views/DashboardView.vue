<template>
  <PageHeader title="Campaign Dashboard" description="Your realm at a glance">
    <!--
      Composition only. Every widget owns its own queries and its own layout,
      and `DashboardWidget` owns the card and its height cap — so a widget can
      be added, reordered or removed here without touching anything else, and a
      campaign with thirty rumors cannot decide how tall its neighbours are.

      This file held all six widgets inline, with the card recipe written out
      six times and every query hoisted to the top regardless of which card
      needed it. See #759.
    -->
    <div class="flex flex-col gap-4">
      <LiveEncounterBanner />

      <PartyWidget />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QuestsWidget />
        <SessionWidget />
        <UnidentifiedWidget />
      </div>

      <RecentNpcsWidget />
      <PinnedNotesWidget />
      <DashboardStats />
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import PageHeader from "@/components/common/PageHeader.vue";
import LiveEncounterBanner from "@/components/dashboard/widgets/LiveEncounterBanner.vue";
import PartyWidget from "@/components/dashboard/widgets/PartyWidget.vue";
import QuestsWidget from "@/components/dashboard/widgets/QuestsWidget.vue";
import SessionWidget from "@/components/dashboard/widgets/SessionWidget.vue";
import UnidentifiedWidget from "@/components/dashboard/widgets/UnidentifiedWidget.vue";
import RecentNpcsWidget from "@/components/dashboard/widgets/RecentNpcsWidget.vue";
import PinnedNotesWidget from "@/components/dashboard/widgets/PinnedNotesWidget.vue";
import DashboardStats from "@/components/dashboard/widgets/DashboardStats.vue";
</script>
