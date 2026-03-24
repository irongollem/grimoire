<template>
  <div class="flex flex-col gap-4 p-4 md:p-6">
    <div class="flex items-center gap-3">
      <RouterLink to="/party" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider">
        ← Party
      </RouterLink>
    </div>
    <PlayerCharacterView :member-id="id" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import PlayerCharacterView from "@/views/play/PlayerCharacterView.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);
</script>
