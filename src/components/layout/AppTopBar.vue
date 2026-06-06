<template>
  <header
    class="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card sticky top-0 z-30"
  >
    <h1 class="font-cinzel text-lg font-semibold text-gold-500 tracking-wider flex-1 truncate">
      {{ pageTitle }}
    </h1>

    <button
      class="text-muted-foreground hover:text-foreground transition-colors"
      aria-label="Search"
      @click="searchOpen = true"
    >
      <IconSearch class="h-5 w-5" />
    </button>

    <!-- DM Prep/Play toggle — compact single-word pill showing current state. -->
    <button
      v-if="isDm"
      type="button"
      :title="ui.dmMode === 'play' ? 'Play mode — click to stop broadcasting' : 'Prep mode — click to broadcast'"
      class="rounded border px-2 py-0.5 font-cinzel text-[9px] tracking-widest font-bold transition-colors shrink-0"
      :class="ui.dmMode === 'play'
        ? 'border-primary/60 bg-primary/15 text-primary'
        : 'border-border text-muted-foreground'"
      @click="ui.toggleDmMode()"
    >
      {{ ui.dmMode === 'play' ? 'PLAY' : 'PREP' }}
    </button>

    <SoundboardWidgetToggle :icon-only="true" class="px-1.5! py-1!" />

    <!-- Mobile search overlay -->
    <Teleport to="body">
      <div
        v-if="searchOpen"
        class="fixed inset-0 z-50 bg-black/60 flex flex-col"
        @click.self="searchOpen = false"
      >
        <div class="bg-card border-b border-border px-4 py-3">
          <div class="relative">
            <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref="mobileInputRef"
              v-model="mobileQuery"
              type="text"
              placeholder="Search anything…"
              class="w-full pl-8 pr-8 py-2 rounded-md bg-background border border-border text-sm font-fell text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-gold-500"
              @keydown.escape="searchOpen = false"
            />
            <button
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="searchOpen = false"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto bg-card">
          <div v-if="mobileQuery.trim().length < 2" class="px-4 py-8 text-center text-sm text-muted-foreground font-fell">
            Type at least 2 characters to search
          </div>
          <div v-else-if="isFetching" class="px-4 py-4 flex items-center gap-2 text-sm text-muted-foreground font-fell">
            <IconLoading class="h-4 w-4 animate-spin" />
            Searching…
          </div>
          <div v-else-if="mobileGroups.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground font-fell">
            No results for "{{ mobileQuery.trim() }}"
          </div>
          <template v-else>
            <template v-for="group in mobileGroups" :key="group.type">
              <div class="px-4 py-2 font-cinzel text-[10px] tracking-widest text-muted-foreground/60 uppercase bg-secondary/30 border-b border-t border-border/50">
                {{ group.label }}
              </div>
              <RouterLink
                v-for="item in group.items"
                :key="item.id"
                :to="item.route"
                class="flex items-center px-4 py-3 text-sm font-fell text-foreground hover:bg-secondary/60 border-b border-border/30 transition-colors"
                @click="searchOpen = false"
              >
                {{ item.name }}
              </RouterLink>
            </template>
          </template>
        </div>
      </div>
    </Teleport>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { IconClose, IconLoading, IconSearch } from '@/lib/icons';
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import SoundboardWidgetToggle from "@/components/soundboard/SoundboardWidgetToggle.vue";
import { useGlobalSearch } from "@/composables/useGlobalSearch";

const route = useRoute();
const ui = useUiStore();
const auth = useAuthStore();
const isDm = computed(() => auth.currentRole === "dm");

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? "Grimoire");

const searchOpen = ref(false);
const mobileQuery = ref("");
const mobileInputRef = ref<HTMLInputElement | null>(null);

const { data, isFetching } = useGlobalSearch(mobileQuery);

const mobileGroups = computed(() => {
  if (mobileQuery.value.trim().length < 2) return [];
  return data.value ?? [];
});

watch(searchOpen, async (val) => {
  if (val) {
    mobileQuery.value = "";
    await nextTick();
    mobileInputRef.value?.focus();
  }
});
</script>
