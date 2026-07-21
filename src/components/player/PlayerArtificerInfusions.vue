<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border flex items-center justify-between">
      <p class="text-label-lg font-semibold text-muted-foreground">Infusions</p>
      <span class="text-label text-muted-foreground">
        {{ activeCount }} / {{ slotsMax }} active
      </span>
    </div>

    <!-- Unified known infusions list — active ones highlighted, inactive show Apply -->
    <div class="divide-y divide-border">
      <div v-for="inf in knownInfusions" :key="inf.name" class="px-4 py-2.5">

        <!-- Row: name + item name + badges + actions -->
        <div class="flex items-center gap-2">
          <button
            class="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
            @click="toggleExpanded(`infusion-${inf.name}`)"
          >
            <span
              class="text-body flex-1 min-w-0 truncate"
              :class="isActive(inf.name) ? 'text-primary' : 'text-foreground'"
            >{{ inf.name }}</span>
            <span
              v-if="activeItemName(inf.name)"
              class="text-caption text-muted-foreground italic shrink-0"
            >{{ activeItemName(inf.name) }}</span>
            <span
              v-if="inf.min_level > 2"
              class="text-label rounded px-1.5 py-0.5 shrink-0 bg-muted/50 text-muted-foreground border border-border"
            >Lv {{ inf.min_level }}+</span>
            <span
              v-if="isActive(inf.name)"
              class="text-label rounded px-1.5 py-0.5 shrink-0 bg-primary/10 text-primary border border-primary/20"
            >Active</span>
            <IconChevronDown
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`infusion-${inf.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <button
            v-if="isActive(inf.name)"
            class="text-label text-muted-foreground hover:text-destructive transition-colors shrink-0"
            @click="emit('remove', inf.name)"
          >Remove</button>
          <button
            v-else-if="!isActive(inf.name) && activeCount < slotsMax"
            class="text-label text-primary hover:opacity-80 transition-opacity shrink-0"
            @click="openApplyForm(inf.name)"
          >Apply</button>
        </div>

        <!-- Inline apply form (opens per-row) -->
        <div v-if="pendingApplyName === inf.name" class="mt-2 space-y-2">
          <select
            v-model="pendingItemId"
            class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">No specific item</option>
            <option v-for="item in inventoryItems" :key="item.id" :value="item.id">
              {{ item.name }}
            </option>
          </select>
          <div class="flex gap-2">
            <button
              class="text-label px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              @click="confirmApply"
            >Confirm</button>
            <button
              class="text-label px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              @click="cancelApplyForm"
            >Cancel</button>
          </div>
        </div>

        <!-- Description -->
        <div
          v-if="expanded.has(`infusion-${inf.name}`)"
          class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 text-body text-muted-foreground leading-relaxed"
        >
          {{ inf.description }}
        </div>
      </div>
    </div>

    <!-- Learn new infusion -->
    <div v-if="availableToLearn.length > 0" class="px-4 py-2.5 border-t border-border">
      <div v-if="!showLearnForm" class="flex justify-start">
        <button
          class="text-label text-muted-foreground hover:text-foreground transition-colors"
          @click="showLearnForm = true"
        >+ Learn Infusion</button>
      </div>
      <div v-else class="space-y-2">
        <select
          v-model="pendingLearnName"
          class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Select infusion to learn…</option>
          <option v-for="inf in availableToLearn" :key="inf.name" :value="inf.name">
            {{ inf.name }}{{ inf.min_level > 2 ? ` (Lv ${inf.min_level}+)` : '' }}
          </option>
        </select>
        <div class="flex gap-2">
          <button
            :disabled="!pendingLearnName"
            class="text-label px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
            @click="confirmLearn"
          >Learn</button>
          <button
            class="text-label px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
            @click="showLearnForm = false; pendingLearnName = ''"
          >Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronDown } from "@/lib/icons";
import type { ArtificerInfusion } from "@/data/artificerInfusions";

interface InventoryItem {
  id: string;
  name: string;
}

interface ActiveInfusion {
  name: string;
  inv_item_id: string | null;
}

const {
  knownInfusions,
  availableToLearn,
  activeInfusions,
  slotsMax,
  inventoryItems,
} = defineProps<{
  knownInfusions: ArtificerInfusion[];
  availableToLearn: ArtificerInfusion[];
  activeInfusions: ActiveInfusion[];
  slotsMax: number;
  inventoryItems: InventoryItem[];
}>();

const emit = defineEmits<{
  remove: [name: string];
  apply: [name: string, invItemId: string | null];
  learn: [name: string];
}>();

const activeCount = computed(() => activeInfusions.length);

function isActive(name: string): boolean {
  return activeInfusions.some(a => a.name === name);
}

function activeItemName(name: string): string {
  const entry = activeInfusions.find(a => a.name === name);
  if (!entry?.inv_item_id) return "";
  return inventoryItems.find(i => i.id === entry.inv_item_id)?.name ?? "";
}

const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value);
}

const pendingApplyName = ref("");
const pendingItemId = ref<string>("");

function openApplyForm(name: string) {
  pendingApplyName.value = name;
  pendingItemId.value = "";
}

function cancelApplyForm() {
  pendingApplyName.value = "";
  pendingItemId.value = "";
}

function confirmApply() {
  if (!pendingApplyName.value) return;
  emit("apply", pendingApplyName.value, pendingItemId.value || null);
  cancelApplyForm();
}

const showLearnForm = ref(false);
const pendingLearnName = ref("");

function confirmLearn() {
  if (!pendingLearnName.value) return;
  emit("learn", pendingLearnName.value);
  showLearnForm.value = false;
  pendingLearnName.value = "";
}
</script>
