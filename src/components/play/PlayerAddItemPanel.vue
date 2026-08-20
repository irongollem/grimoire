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
        <AppInput
          v-model="newItemName"
          type="text"
          tone="muted"
          size="body"
          placeholder="Search vault…"
          autocomplete="off"
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
          <AppButton
            v-for="(it, idx) in filteredItems"
            :key="it.id"
            :ref="(el) => setDropdownRef(idx, el)"
            variant="menu"
            size="body"
            block
            @click="selectItem(it)"
            @keydown.down.prevent="focusDropdownItem(idx + 1)"
            @keydown.up.prevent="idx > 0 ? focusDropdownItem(idx - 1) : undefined"
            @keydown.escape="showDropdown = false"
          >
            <span class="flex items-baseline gap-2 w-full">
              <span class="truncate">{{ it.name }}</span>
              <span class="font-cinzel text-2xs text-muted-foreground shrink-0 capitalize">{{ it.rarity }}</span>
            </span>
          </AppButton>
        </div>
        <div
          v-if="showDropdown"
          class="fixed inset-0 z-10"
          @click="showDropdown = false"
        />
      </div>
      <AppInput
        v-model.number="newItemQty"
        type="number"
        tone="muted"
        size="sm"
        align="center"
        :block="false"
        class="w-14"
        min="1"
      />
      <AppButton
        type="submit"
        variant="primary"
        size="sm"
        label="Add"
        :disabled="!newItemSelectedId"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
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

// AppButton exposes `$el` (the real <button>), not the raw DOM node, when bound
// via `ref` — see reka-ui's useForwardExpose. Unwrap it here so
// `focusDropdownItem` above keeps calling `.focus()` on an actual HTMLButtonElement,
// exactly as it did against the native `<button ref="...">` this replaced.
function setDropdownRef(idx: number, el: unknown) {
  if (el && typeof el === "object" && "$el" in el) {
    dropdownRefs[idx] = (el as { $el: HTMLButtonElement }).$el;
  }
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
