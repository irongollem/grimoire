<template>
  <!--
    Mobile (< md): encounter panel on top, character sheet below.
    Tablet+ (md+): encounter panel lives in the layout sidebar;
    this view only renders the character sheet (the panel block is hidden via CSS).
  -->
  <div class="pb-8">
    <!-- Encounter panel — mobile only (hidden on md+, where the sidebar handles it) -->
    <div class="md:hidden mb-6">
      <PlayerEncounterPanel @close="handleClose" />
    </div>

    <!-- Character sheet — always rendered -->
    <PlayerCharacterView />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import PlayerEncounterPanel from "@/components/player/PlayerEncounterPanel.vue";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";

const router = useRouter();

function handleClose() {
  void router.push({ name: "play" });
}
</script>
