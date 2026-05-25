<template>
  <div ref="containerRef" class="relative">
    <!-- IconSearch input -->
    <div class="relative">
      <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Search…"
        class="w-full pl-7 pr-7 py-1.5 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500 transition-colors"
        @focus="open = true"
        @keydown.escape="close"
        @keydown.down.prevent="moveFocus(1)"
        @keydown.up.prevent="moveFocus(-1)"
        @keydown.enter.prevent="selectFocused"
      />
      <button
        v-if="query"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabindex="-1"
        @click="clear"
      >
        <IconClose class="h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Dropdown -->
    <div
      v-if="open && query.trim().length >= 2"
      class="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden max-h-80 overflow-y-auto"
    >
      <!-- Loading -->
      <div v-if="isFetching" class="px-3 py-2 text-xs text-muted-foreground font-fell flex items-center gap-2">
        <IconLoading class="h-3.5 w-3.5 animate-spin" />
        Searching…
      </div>

      <!-- No results -->
      <div
        v-else-if="!isFetching && groups.length === 0"
        class="px-3 py-3 text-xs text-muted-foreground font-fell text-center"
      >
        No results for "{{ query.trim() }}"
      </div>

      <!-- Results -->
      <template v-else>
        <template v-for="group in groups" :key="group.type">
          <!-- Group header -->
          <div class="px-3 py-1.5 font-cinzel text-[10px] tracking-widest text-muted-foreground/60 uppercase bg-secondary/30 border-b border-border/50">
            {{ group.label }}
          </div>
          <!-- Group items -->
          <RouterLink
            v-for="(item, i) in group.items"
            :key="item.id"
            :to="item.route"
            class="flex items-center gap-2 px-3 py-2 text-sm font-fell text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
            :class="{ 'bg-secondary/60': flatIndex(group, i) === focusedIndex }"
            @click="close"
            @mouseenter="focusedIndex = flatIndex(group, i)"
          >
            <span class="truncate">{{ item.name }}</span>
          </RouterLink>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { IconClose, IconLoading, IconSearch } from '@/lib/icons';
import { useGlobalSearch } from "@/composables/useGlobalSearch";
import type { SearchGroup } from "@/composables/useGlobalSearch";

const router = useRouter();
const query = ref("");
const open = ref(false);
const focusedIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

const { data, isFetching } = useGlobalSearch(query);

const groups = computed<SearchGroup[]>(() => {
  if (query.value.trim().length < 2) return [];
  return data.value ?? [];
});

// Flat list of all results for keyboard navigation
const flatItems = computed(() =>
  groups.value.flatMap((g) => g.items.map((item) => item.route)),
);

function flatIndex(group: SearchGroup, itemIndex: number): number {
  let offset = 0;
  for (const g of groups.value) {
    if (g.type === group.type) return offset + itemIndex;
    offset += g.items.length;
  }
  return -1;
}

function moveFocus(delta: number) {
  const len = flatItems.value.length;
  if (len === 0) return;
  focusedIndex.value = (focusedIndex.value + delta + len) % len;
}

function selectFocused() {
  const route = flatItems.value[focusedIndex.value];
  if (route) {
    router.push(route);
    close();
  }
}

function close() {
  open.value = false;
  focusedIndex.value = -1;
  inputRef.value?.blur();
}

function clear() {
  query.value = "";
  focusedIndex.value = -1;
  inputRef.value?.focus();
}

// Reset focus index when results change
watch(groups, () => { focusedIndex.value = -1; });

// Close on outside click
function handleOutsideClick(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
    focusedIndex.value = -1;
  }
}

// Cmd/Ctrl+K to focus search
function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    inputRef.value?.focus();
    open.value = true;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", handleOutsideClick);
  document.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", handleOutsideClick);
  document.removeEventListener("keydown", handleKeydown);
});
</script>
