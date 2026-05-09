<template>
  <div class="relative" ref="containerRef">
    <button
      type="button"
      :title="label"
      class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors focus:outline-none"
      :class="isShared
        ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/20'
        : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'"
      @click="toggleOpen()"
    >
      <IconReveal v-if="isShared" class="h-3.5 w-3.5" />
      <IconHide v-else class="h-3.5 w-3.5" />
    </button>

    <!-- Popover -->
    <div
      v-if="open"
      class="absolute z-50 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
      :class="[
        openUpward  ? 'bottom-full mb-1' : 'top-full mt-1',
        openLeftward ? 'left-0'          : 'right-0',
      ]"
    >
      <div class="px-3 pt-3 pb-1">
        <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-widest mb-2">VISIBLE TO</p>

        <!-- All players toggle -->
        <button
          type="button"
          class="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 mb-1 font-cinzel text-xs font-semibold tracking-wider transition-colors border"
          :class="allSelected
            ? 'bg-primary/15 border-primary/40 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'"
          @click="toggleAll"
        >
          <IconParty class="h-3.5 w-3.5 shrink-0" />
          All players
          <span
            v-if="allSelected"
            class="ml-auto font-fell text-[10px] font-normal normal-case text-primary/70"
          >on</span>
        </button>
      </div>

      <!-- Individual members -->
      <div v-if="party.length" class="px-3 pb-2 flex flex-col gap-0.5">
        <p class="font-cinzel text-[9px] text-muted-foreground tracking-widest mt-1 mb-1">OR SPECIFIC</p>
        <button
          v-for="member in party"
          :key="member.id"
          type="button"
          class="w-full flex items-center gap-2 rounded px-2 py-1 text-left font-fell text-xs transition-colors"
          :class="isMemberSelected(member.id)
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted'"
          @click="toggleMember(member.id)"
        >
          <span
            class="h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center transition-colors"
            :class="isMemberSelected(member.id) ? 'bg-primary border-primary' : 'border-border'"
          >
            <IconCheck v-if="isMemberSelected(member.id)" class="h-2.5 w-2.5 text-primary-foreground" />
          </span>
          <span class="truncate">{{ member.name }}</span>
        </button>
      </div>

      <!-- Hide button -->
      <div v-if="isShared" class="border-t border-border px-3 py-2">
        <button
          type="button"
          class="w-full font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-80 transition-opacity text-left"
          @click="hide"
        >
          Hide from all players
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { IconCheck, IconHide, IconParty, IconReveal } from '@/lib/icons';
import { useParty } from "@/composables/useParty";

const visibleTo = defineModel<string[]>("visibleTo", { required: true });

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);

const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const POPOVER_W = 224;
const POPOVER_H_EST = 280;
const openUpward = ref(false);
const openLeftward = ref(false);

function computePosition() {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  openUpward.value  = vh - rect.bottom < POPOVER_H_EST && rect.top > vh - rect.bottom;
  openLeftward.value = rect.right < POPOVER_W && vw - rect.left >= POPOVER_W;
}

function toggleOpen() {
  if (!open.value) computePosition();
  open.value = !open.value;
}

const isShared = computed(() => visibleTo.value.length > 0);

const allSelected = computed(
  () => party.value.length > 0 && party.value.every((m) => visibleTo.value.includes(m.id)),
);

const label = computed(() => {
  if (allSelected.value) return "Visible to all players";
  if (visibleTo.value.length) return `Visible to ${visibleTo.value.length} player(s)`;
  return "Hidden from players";
});

function isMemberSelected(id: string): boolean {
  return visibleTo.value.includes(id);
}

function toggleAll() {
  visibleTo.value = allSelected.value ? [] : party.value.map((m) => m.id);
}

function toggleMember(id: string) {
  visibleTo.value = visibleTo.value.includes(id)
    ? visibleTo.value.filter((mid) => mid !== id)
    : [...visibleTo.value, id];
}

function hide() {
  visibleTo.value = [];
  open.value = false;
}

function onOutsideClick(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}
onMounted(() => document.addEventListener("mousedown", onOutsideClick));
onUnmounted(() => document.removeEventListener("mousedown", onOutsideClick));
</script>
