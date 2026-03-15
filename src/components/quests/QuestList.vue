<template>
  <div>
    <!-- Toolbar -->
    <div class="flex flex-col gap-2 mb-5">
      <div class="flex items-center gap-2">
        <!-- Search -->
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search quests…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <!-- View toggle -->
        <button
          type="button"
          :title="isKanban ? 'Switch to list view' : 'Switch to kanban view'"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          @click="isKanban = !isKanban"
        >
          <Columns2 v-if="isKanban" class="h-3.5 w-3.5" />
          <LayoutList v-else class="h-3.5 w-3.5" />
          <span class="font-cinzel text-[10px] font-semibold tracking-wider">{{ isKanban ? 'Kanban' : 'List' }}</span>
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!allQuests?.length"
      title="No quests yet"
      description="Track your party's adventures, contracts, and personal goals."
    >
      <template #action>
        <RouterLink
          to="/quests/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first quest
        </RouterLink>
      </template>
    </EmptyState>

    <!-- Kanban board -->
    <template v-else-if="isKanban">
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div
          v-for="col in kanbanColumns"
          :key="col.status"
          class="flex flex-col gap-2"
        >
          <!-- Column header -->
          <div class="flex items-center gap-2 px-1 pb-1 border-b-2" :style="{ borderColor: col.color }">
            <span
              class="h-2 w-2 rounded-full shrink-0"
              :style="{ backgroundColor: col.color }"
            />
            <span class="font-cinzel text-xs font-bold tracking-wider text-foreground">
              {{ col.label }}
            </span>
            <span class="ml-auto font-fell text-xs text-muted-foreground">{{ col.quests.length }}</span>
          </div>

          <!-- Quest cards -->
          <div class="flex flex-col gap-2 min-h-12">
            <p v-if="!col.quests.length" class="font-fell text-xs text-muted-foreground italic text-center py-6">
              None
            </p>

            <RouterLink
              v-for="quest in col.quests"
              :key="quest.id"
              :to="`/quests/${quest.id}`"
              class="group flex flex-col gap-2 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
            >
              <!-- Status bar -->
              <div
                class="absolute top-0 left-0 right-0 h-0.5"
                :style="{ backgroundColor: col.color }"
              />
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2">
                {{ quest.title || "Untitled Quest" }}
              </h3>
              <p v-if="quest.summary" class="font-fell text-xs text-muted-foreground italic line-clamp-2">
                {{ quest.summary }}
              </p>
              <div v-if="quest.tags.length" class="flex flex-wrap gap-1">
                <span
                  v-for="tag in quest.tags.slice(0, 2)"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
                >
                  {{ tag }}
                </span>
              </div>
              <span class="font-fell text-[10px] text-muted-foreground italic ml-auto">
                {{ timeAgo(quest.updated_at) }}
              </span>
            </RouterLink>
          </div>
        </div>
      </div>
    </template>

    <!-- List view -->
    <template v-else>
      <p v-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-12">
        No quests match your search.
      </p>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <RouterLink
          v-for="quest in filtered"
          :key="quest.id"
          :to="`/quests/${quest.id}`"
          class="group relative flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
        >
          <div class="h-1.5 w-full shrink-0" :style="{ backgroundColor: QUEST_STATUS_COLORS[quest.status] }" />

          <div class="p-3 flex flex-col gap-2 flex-1">
            <div class="flex items-start gap-2">
              <div
                class="h-7 w-7 shrink-0 rounded flex items-center justify-center mt-0.5"
                :style="{ backgroundColor: QUEST_STATUS_COLORS[quest.status] + '22' }"
              >
                <ScrollText class="h-3.5 w-3.5" :style="{ color: QUEST_STATUS_COLORS[quest.status] }" />
              </div>
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-2 flex-1">
                {{ quest.title || "Untitled Quest" }}
              </h3>
            </div>

            <span
              class="self-start px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider"
              :style="{
                backgroundColor: QUEST_STATUS_COLORS[quest.status] + '22',
                color: QUEST_STATUS_COLORS[quest.status],
              }"
            >
              {{ QUEST_STATUS_LABELS[quest.status] }}
            </span>

            <p v-if="quest.summary" class="font-fell text-xs text-muted-foreground italic line-clamp-3 flex-1">
              {{ quest.summary }}
            </p>
            <div v-else class="flex-1" />

            <div class="flex items-end justify-between gap-2 mt-auto">
              <div v-if="quest.tags.length" class="flex flex-wrap gap-1">
                <span
                  v-for="tag in quest.tags.slice(0, 2)"
                  :key="tag"
                  class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
                >
                  {{ tag }}
                </span>
              </div>
              <span class="font-fell text-[10px] text-muted-foreground italic shrink-0 ml-auto">
                {{ timeAgo(quest.updated_at) }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>

      <p v-if="filtered.length" class="mt-4 font-fell text-xs text-muted-foreground italic text-right">
        {{ filtered.length }} of {{ allQuests?.length ?? 0 }} quests
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, Columns2, LayoutList, ScrollText } from "lucide-vue-next";
import { useAllQuests } from "@/composables/useQuests";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import {
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
} from "@/types/quest.types";

const search = ref("");
const isKanban = ref(true);

const { data: allQuests, isLoading } = useAllQuests();

const filtered = computed(() => {
  let list = [...(allQuests.value ?? [])];
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter((quest) =>
      quest.title.toLowerCase().includes(q) ||
      quest.summary?.toLowerCase().includes(q) ||
      quest.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return list;
});

const kanbanColumns = computed(() =>
  QUEST_STATUSES.map((status) => ({
    status,
    label: QUEST_STATUS_LABELS[status],
    color: QUEST_STATUS_COLORS[status],
    quests: filtered.value.filter((q) => q.status === status),
  })),
);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
</script>
