<template>
  <div class="flex h-screen overflow-hidden bg-background">
    <AppSidebar />
    <AppMobileNav />

    <div class="flex-1 flex flex-col min-w-0">
      <AppTopBar />

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <CampaignChat />

    <!--
      Generator panels are always mounted here so that background generation
      (started when the panel is open then dismissed) survives navigation.
      Each panel renders nothing visually when its open flag is false.
      To add a new generator: mount its panel here, register it in its
      useXxxGeneration.ts via registerAiGenerator(), and that's it.
    -->
    <NpcGeneratorPanel />
    <MonsterGeneratorPanel />
    <ItemGeneratorPanel />
    <PuzzleGeneratorPanel />

    <!-- Shows a pill for every active/completed/errored AI generation -->
    <AiGenerationBadge />
  </div>
</template>

<script setup lang="ts">
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopBar from "@/components/layout/AppTopBar.vue";
import AppMobileNav from "@/components/layout/AppMobileNav.vue";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import NpcGeneratorPanel from "@/components/npcs/NpcGeneratorPanel.vue";
import MonsterGeneratorPanel from "@/components/monsters/MonsterGeneratorPanel.vue";
import ItemGeneratorPanel from "@/components/items/ItemGeneratorPanel.vue";
import PuzzleGeneratorPanel from "@/components/puzzles/PuzzleGeneratorPanel.vue";
import AiGenerationBadge from "@/components/common/AiGenerationBadge.vue";
import { useCampaignPresence } from "@/composables/useCampaignPresence";

useCampaignPresence();
</script>
