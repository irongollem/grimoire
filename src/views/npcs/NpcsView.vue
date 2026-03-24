<template>
  <PageHeader
    title="NPC Tracker"
    description="The denizens of your realm — allies, enemies, and unknowns"
  >
    <template #actions>
      <div class="flex gap-2">
        <button
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground tracking-wider hover:bg-accent hover:text-accent-foreground transition-colors"
          @click="ui.npcGeneratorOpen = true"
        >
          <Wand2 class="h-3.5 w-3.5" />
          Generate
        </button>
        <RouterLink
          to="/npcs/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          New NPC
        </RouterLink>
      </div>
    </template>

    <template #sticky>
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative flex-1 min-w-48">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search NPCs…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="s in STATUS_OPTIONS"
            :key="s.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="statusFilter === s.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="statusFilter = s.value"
          >
            {{ s.label }}
          </button>
        </div>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="r in REL_OPTIONS"
            :key="r.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="relFilter === r.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="relFilter = r.value"
          >
            {{ r.label }}
          </button>
        </div>

        <EntityCombobox
          :model-value="locationFilter"
          :options="locationOptions"
          placeholder="All locations"
          class="min-w-44 max-w-56"
          @update:model-value="locationFilter = $event"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as any).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>

        <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
          <button
            v-for="opt in ([{ value: 'name', label: 'Name' }, { value: 'location', label: 'Location' }] as const)"
            :key="opt.value"
            class="px-2.5 py-1.5 transition-colors"
            :class="sortBy === opt.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="sortBy = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>
    </template>

    <NpcList
      :search="search"
      :status-filter="statusFilter"
      :rel-filter="relFilter"
      :location-filter="locationFilter"
      :sort-by="sortBy"
    />
    <NpcGeneratorPanel />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Plus, Wand2, Search } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import NpcList from "@/components/npcs/NpcList.vue";
import NpcGeneratorPanel from "@/components/npcs/NpcGeneratorPanel.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/useLocations";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { locationOptions } = useLocationTree();

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "missing", label: "Missing" },
  { value: "unknown", label: "?" },
];

const REL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ally", label: "Ally" },
  { value: "neutral", label: "Neutral" },
  { value: "enemy", label: "Enemy" },
];

const search = ref("");
const statusFilter = ref("all");
const relFilter = ref("all");
const locationFilter = ref("");
const sortBy = ref<"name" | "location">("location");
</script>
