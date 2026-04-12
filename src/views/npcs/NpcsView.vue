<template>
  <PageHeader
    title="NPC Tracker"
    description="The denizens of your realm — allies, enemies, and unknowns"
  >
    <template #actions>
      <div class="flex gap-2">
        <RouterLink
          to="/npcs/web"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground tracking-wider hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Network class="h-3.5 w-3.5" />
          Web
        </RouterLink>
        <button
          v-if="hasSetting"
          type="button"
          :disabled="populateMutation.isPending.value"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 disabled:opacity-50 transition-colors"
          @click="handlePopulate"
        >
          <Sparkles class="h-3.5 w-3.5" />
          {{ populateStatusLabel }}
        </button>
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
      <div class="flex flex-col gap-2">
        <!-- Row 1: search (full width) -->
        <div class="relative w-full">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search NPCs…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Row 2: filters + sort -->
        <div class="flex flex-wrap items-center gap-2">
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
            class="flex-1 min-w-36"
            @update:model-value="locationFilter = $event"
          >
            <template #option="{ opt }">
              <span :style="{ paddingLeft: `${(opt as any).depth * 12}px` }">{{ opt.name }}</span>
            </template>
          </EntityCombobox>

          <EntityCombobox
            :model-value="partyMemberFilter"
            :options="partyOptions"
            placeholder="Connected to…"
            class="flex-1 min-w-36"
            @update:model-value="partyMemberFilter = $event"
          />

          <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
            <button
              v-for="opt in ([{ value: 'name', label: 'Name' }, { value: 'location', label: 'Location' }] as const)"
              :key="opt.value"
              class="px-2.5 py-1.5 transition-colors"
              :class="sortBy === opt.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="sortBy = opt.value"
            >{{ opt.label }}</button>
          </div>

          <button
            v-if="hasActiveFilters"
            type="button"
            class="px-2.5 py-1.5 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            @click="clearFilters"
          >
            Clear
          </button>
        </div>
      </div>
    </template>

    <NpcList
      :search="search"
      :status-filter="statusFilter"
      :rel-filter="relFilter"
      :location-filter="locationFilter"
      :party-member-filter="partyMemberFilter"
      :sort-by="sortBy"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { NpcStatus, NpcRelationship } from "@/types/npc.types";
import { Plus, Wand2, Search, Sparkles, Network } from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import NpcList from "@/components/npcs/NpcList.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/useLocations";
import { useParty } from "@/composables/useParty";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import { usePopulateSettingNpcs } from "@/composables/useNpcs";

const ui = useUiStore();
const campaign = useCampaignStore();
const { locationOptions } = useLocationTree();
const { data: party } = useParty();

const hasSetting = computed(() => !!getSetting(campaign.activeCampaign?.calendar_id ?? ""));

const populateMutation = usePopulateSettingNpcs();
const populateStatus = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount = ref(0);
const populateError = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} NPC${populatedCount.value !== 1 ? "s" : ""}`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Setting";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "alive", label: "Alive" },
  { value: "dead", label: "Dead" },
  { value: "missing", label: "Missing" },
  { value: "unknown", label: "?" },
] as const;

const REL_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ally", label: "Ally" },
  { value: "neutral", label: "Neutral" },
  { value: "enemy", label: "Enemy" },
] as const;

const search = computed({ get: () => ui.npcsSearchQuery, set: (v) => { ui.npcsSearchQuery = v; } });
const statusFilter = computed({ get: () => ui.npcsFilterStatus, set: (v: NpcStatus | "all") => { ui.npcsFilterStatus = v; } });
const relFilter = computed({ get: () => ui.npcsFilterRelationship, set: (v: NpcRelationship | "all") => { ui.npcsFilterRelationship = v; } });
const locationFilter = computed({ get: () => ui.npcsFilterLocation, set: (v) => { ui.npcsFilterLocation = v; } });
const partyMemberFilter = computed({ get: () => ui.npcsFilterPartyMember, set: (v) => { ui.npcsFilterPartyMember = v; } });
const sortBy = computed({ get: () => ui.npcsFilterSortBy, set: (v) => { ui.npcsFilterSortBy = v; } });

const partyOptions = computed(() => (party.value ?? []).map((m) => ({ id: m.id, name: m.name })));

const hasActiveFilters = computed(() => ui.npcsHasActiveFilters);
function clearFilters() { ui.resetNpcsFilters(); }
</script>
