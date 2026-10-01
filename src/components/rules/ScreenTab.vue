<template>
  <div class="space-y-8 overflow-y-auto h-full px-4 pt-4 pb-4 md:px-6 md:pt-6">
    <!-- Section tabs -->
    <div class="section-tabs flex flex-wrap gap-2" role="tablist" aria-label="DM screen sections">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        role="tab"
        :aria-selected="activeSection === section.id"
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
      <!-- Two columns from xl: a DM screen is scanned, and a two-column table
           1,300px wide put the description a long way from its name. -->
      <div v-if="activeSection === section.id" class="columns-1 gap-6 xl:columns-2">
        <div
          v-for="table in section.tables"
          :key="table.id"
          class="screen-table torn mb-6 break-inside-avoid rounded-lg border border-border overflow-hidden"
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
