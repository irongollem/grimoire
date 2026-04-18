<template>
  <div class="space-y-8 overflow-y-auto h-full px-4 pt-4 pb-4 md:px-6 md:pt-6">
    <!-- Section tabs -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="section in sections"
        :key="section.id"
        class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider transition-colors"
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
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border bg-muted/20">
                  <th
                    v-for="col in table.columns"
                    :key="col"
                    class="px-4 py-2 text-left font-cinzel text-xs font-semibold text-muted-foreground tracking-wider whitespace-nowrap"
                  >
                    {{ col }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in table.rows"
                  :key="i"
                  class="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td
                    v-for="(cell, j) in row"
                    :key="j"
                    class="px-4 py-2.5 font-fell text-foreground align-top"
                    :class="j === 0 ? 'font-semibold whitespace-nowrap' : ''"
                  >
                    {{ cell }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="table.note" class="px-4 py-2.5 font-fell text-xs text-muted-foreground italic border-t border-border/50">
            {{ table.note }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { DM_SCREEN_SECTIONS } from "@/data/dmScreen";

const sections = DM_SCREEN_SECTIONS;
const activeSection = ref(sections[0]?.id ?? "");
</script>
