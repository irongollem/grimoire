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
      <Eye v-if="isShared" class="h-3.5 w-3.5" />
      <EyeOff v-else class="h-3.5 w-3.5" />
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
          :class="sharedWithAll
            ? 'bg-primary/15 border-primary/40 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'"
          @click="toggleAll"
        >
          <Users class="h-3.5 w-3.5 shrink-0" />
          All players
          <span
            v-if="sharedWithAll"
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
            <Check v-if="isMemberSelected(member.id)" class="h-2.5 w-2.5 text-primary-foreground" />
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
import { Eye, EyeOff, Users, Check } from "lucide-vue-next";
import { useParty } from "@/composables/useParty";

const props = defineProps<{
  sharedWithAll: boolean;
  visibleTo: string[] | null;
}>();

const emit = defineEmits<{
  "update:sharedWithAll": [val: boolean];
  "update:visibleTo": [val: string[] | null];
}>();

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);

const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

// Edge-aware positioning: computed when the popover opens.
// POPOVER_W must match the w-56 (224px) class on the popover div.
const POPOVER_W = 224;
// Rough estimate: header + "All players" btn + up-to-6 members + hide btn
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

const isShared = computed(
  () => props.sharedWithAll || (props.visibleTo !== null && props.visibleTo.length > 0),
);

const label = computed(() => {
  if (props.sharedWithAll) return "Visible to all players";
  if (props.visibleTo?.length) return `Visible to ${props.visibleTo.length} player(s)`;
  return "Hidden from players";
});

function isMemberSelected(id: string): boolean {
  return (props.visibleTo ?? []).includes(id);
}

function toggleAll() {
  if (props.sharedWithAll) {
    emit("update:sharedWithAll", false);
  } else {
    emit("update:sharedWithAll", true);
    emit("update:visibleTo", null);
  }
}

function toggleMember(id: string) {
  // Switching to per-member mode clears the "all" flag
  if (props.sharedWithAll) {
    emit("update:sharedWithAll", false);
    // Start with everyone except this one (deselect this person from "all")
    const next = party.value.map((m) => m.id).filter((mid) => mid !== id);
    emit("update:visibleTo", next.length ? next : null);
    return;
  }
  const current = [...(props.visibleTo ?? [])];
  const idx = current.indexOf(id);
  const next = idx === -1 ? [...current, id] : current.filter((mid) => mid !== id);
  emit("update:visibleTo", next.length ? next : null);
}

function hide() {
  emit("update:sharedWithAll", false);
  emit("update:visibleTo", null);
  open.value = false;
}

// Close on outside click
function onOutsideClick(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}
onMounted(() => document.addEventListener("mousedown", onOutsideClick));
onUnmounted(() => document.removeEventListener("mousedown", onOutsideClick));
</script>
