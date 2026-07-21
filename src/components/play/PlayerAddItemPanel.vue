<template>
  <form
    class="rounded-lg border border-border bg-card p-4"
    @submit.prevent="submit"
  >
    <p class="text-label-lg font-semibold text-muted-foreground mb-3">
      Add Item to Backpack
    </p>
    <div class="flex items-center gap-2">
      <div class="relative flex-1 min-w-0">
        <input
          v-model="newItemName"
          type="text"
          placeholder="Search vault…"
          autocomplete="off"
          class="w-full bg-muted/30 border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          :class="newItemName && !newItemSelectedId ? 'border-amber-500/50' : ''"
          @input="onAddInput"
          @focus="onAddInput"
          @keydown.escape="showDropdown = false"
          @keydown.down.prevent="focusDropdownItem(0)"
        />
        <div
          v-if="showDropdown && filteredItems.length"
          class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto"
        >
          <button
            v-for="(it, idx) in filteredItems"
            :key="it.id"
            :ref="(el) => { if (el) dropdownRefs[idx] = el as HTMLButtonElement; }"
            type="button"
            class="w-full text-left px-3 py-1.5 text-body text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
            @click="selectItem(it)"
            @keydown.down.prevent="focusDropdownItem(idx + 1)"
            @keydown.up.prevent="idx > 0 ? focusDropdownItem(idx - 1) : undefined"
            @keydown.escape="showDropdown = false"
          >
            <span class="truncate">{{ it.name }}</span>
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground shrink-0 capitalize">{{ it.rarity }}</span>
          </button>
        </div>
        <div
          v-if="showDropdown"
          class="fixed inset-0 z-10"
          @click="showDropdown = false"
        />
      </div>
      <input
        v-model.number="newItemQty"
        type="number"
        min="1"
        class="w-14 bg-muted/30 border border-border rounded-md px-2 py-1.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="submit"
        class="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-label-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="!newItemSelectedId"
      >
        Add
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import type { Item } from "@/types/item.types";

const { allItems } = defineProps<{
  allItems: Item[];
}>();

const emit = defineEmits<{
  submit: [selectedId: string, name: string, qty: number];
}>();

const newItemName = ref("");
const newItemQty = ref(1);
const newItemSelectedId = ref("");
const showDropdown = ref(false);
const dropdownRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredItems = computed((): Item[] => {
  const q = newItemName.value.trim().toLowerCase();
  if (!q) return allItems.slice(0, 8);
  return allItems.filter((it) => it.name.toLowerCase().includes(q));
});

function onAddInput() {
  newItemSelectedId.value = "";
  showDropdown.value = true;
}

function selectItem(it: Item) {
  newItemName.value = it.name;
  newItemSelectedId.value = it.id;
  showDropdown.value = false;
}

function focusDropdownItem(idx: number) {
  dropdownRefs[idx]?.focus();
}

function submit() {
  if (!newItemSelectedId.value) return;
  // Clamp to a positive integer — a cleared field submits "" (silent insert
  // failure) and 0 / -3 create bad inventory rows.
  const qty = Math.max(1, Math.floor(Number(newItemQty.value) || 1));
  emit("submit", newItemSelectedId.value, newItemName.value.trim(), qty);
  newItemName.value = "";
  newItemSelectedId.value = "";
  newItemQty.value = 1;
  showDropdown.value = false;
}
</script>
