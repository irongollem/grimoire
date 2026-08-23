<template>
  <div class="space-y-8 overflow-y-auto h-full px-4 pt-4 pb-4 md:px-6 md:pt-6">
    <!-- Section tabs -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="section in sections"
        :key="section.id"
        class="px-3 py-1.5 rounded-md text-label-lg font-semibold transition-colors"
        :class="activeSection === section.id
          ? 'bg-primary text-primary-foreground'
          : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'"
        @click="activeSection = section.id"
      >
        {{ section.title }}
      </button>
    </div>

    <!-- Active section tables -->
    <div v-for="section in sections" :key="section.id">
      <div v-if="activeSection === section.id" class="space-y-6">
        <div
          v-for="table in section.tables"
          :key="table.id"
          class="rounded-lg border border-border overflow-hidden"
        >
          <div class="bg-muted/40 px-4 py-2.5 border-b border-border">
            <h3 class="font-cinzel text-sm font-bold text-foreground tracking-wider">{{ table.title }}</h3>
          </div>
          <!-- The table itself is shared with the dashboard's DM-screen quick
               card (#764); only this panel's chrome is local. -->
          <ScreenReferenceTable :table="table" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { DM_SCREEN_SECTIONS } from "@/data/dmScreen";
import ScreenReferenceTable from "./ScreenReferenceTable.vue";

const sections = DM_SCREEN_SECTIONS;
const activeSection = ref(sections[0]?.id ?? "");
</script>
