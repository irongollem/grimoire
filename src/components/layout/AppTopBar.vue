<template>
  <header
    class="sidenav:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card sticky top-0 z-30"
  >
    <h1 class="font-cinzel text-lg font-semibold text-gold-500 tracking-wider flex-1 truncate">
      {{ pageTitle }}
    </h1>

    <!-- At md+ within bar mode (a tablet), the top bar carries the real
         search input inline, freeing the bottom bar's width for more nav
         tabs. `:hotkey="false"` — the always-mounted sidebar instance owns
         mod+k. -->
    <div class="hidden w-64 md:block">
      <GlobalSearch :hotkey="false" />
    </div>

    <!-- Phones only: at md+ within bar mode (a tablet), the inline search
         above replaces this icon button. -->
    <AppButton
      variant="ghost"
      size="inline"
      icon-size="lg"
      :icon="IconSearch"
      class="md:hidden"
      aria-label="Search"
      @click="searchOpen = true"
    />

    <!-- The session control. One implementation at both widths now: it used to
         be a segmented pair at md+ and a separate single-word pill on phones,
         which meant two components rendering the same state and drifting. The
         control is already compact at rest ("Start session") and becomes a
         status once running, so the phone case needed nothing of its own. -->
    <div v-if="isDm" class="w-32 shrink-0 md:w-44">
      <SessionControl />
    </div>

    <SoundboardWidgetToggle icon-only size="xs" class="shrink-0" />

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
            <AppInput
              ref="mobileInputRef"
              v-model="mobileQuery"
              tone="default"
              size="body"
              placeholder="Search anything…"
              class="pl-8 pr-8"
              @keydown.escape="searchOpen = false"
            />
            <AppButton
              variant="ghost"
              size="inline"
              icon-size="md"
              :icon="IconClose"
              aria-label="Close"
              class="absolute right-2.5 top-1/2 -translate-y-1/2"
              @click="searchOpen = false"
            />
          </div>
        </div>

        <!-- Results -->
        <div class="flex-1 overflow-y-auto bg-card">
          <div v-if="mobileQuery.trim().length < 2" class="px-4 py-8 text-center text-body text-muted-foreground">
            Type at least 2 characters to search
          </div>
          <div v-else-if="isFetching" class="px-4 py-4 flex items-center gap-2 text-body text-muted-foreground">
            <IconLoading class="h-4 w-4 animate-spin" />
            Searching…
          </div>
          <div v-else-if="mobileGroups.length === 0" class="px-4 py-8 text-center text-body text-muted-foreground">
            No results for "{{ mobileQuery.trim() }}"
          </div>
          <template v-else>
            <template v-for="group in mobileGroups" :key="group.type">
              <div class="px-4 py-2 font-cinzel text-2xs tracking-widest text-muted-foreground/60 uppercase bg-secondary/30 border-b border-t border-border/50">
                {{ group.label }}
              </div>
              <AppButton
                v-for="item in group.items"
                :key="item.id"
                :to="item.route"
                variant="menu"
                size="body"
                block
                class="px-4 py-3 border-b border-border/30"
                :label="item.name"
                @click="searchOpen = false"
              />
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import SoundboardWidgetToggle from "@/components/soundboard/SoundboardWidgetToggle.vue";
import GlobalSearch from "./GlobalSearch.vue";
import SessionControl from "./SessionControl.vue";
import { useGlobalSearch } from "@/composables/useGlobalSearch";

const route = useRoute();
const auth = useAuthStore();
const isDm = computed(() => auth.currentRole === "dm");

const pageTitle = computed(() => (route.meta.title as string | undefined) ?? "Grimoire");

const searchOpen = ref(false);
const mobileQuery = ref("");
const mobileInputRef = ref<AppInputHandle | null>(null);

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
