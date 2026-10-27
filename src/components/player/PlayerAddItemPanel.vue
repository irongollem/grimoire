<template>
  <form
    class="rounded-lg border border-border bg-card p-4"
    @submit.prevent="submit"
  >
    <p class="text-label-lg font-semibold text-muted-foreground mb-3">
      Add Item to Backpack
    </p>
    <div class="flex items-center gap-2">
      <EntityCombobox v-model="newItemSelectedId" :options="allItems" placeholder="Search vault…">
        <template #option="{ opt }">
          <span class="flex w-full items-baseline gap-2">
            <span class="truncate">{{ opt.name }}</span>
            <span class="text-caption-sm text-muted-foreground shrink-0 capitalize">{{ opt.rarity }}</span>
          </span>
        </template>
      </EntityCombobox>
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
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import type { ItemIndexEntry } from "@/types/item.types";

const { allItems } = defineProps<{
  /** Slim picker rows; the full item is read once one is chosen. */
  allItems: ItemIndexEntry[];
}>();

const emit = defineEmits<{
  submit: [selectedId: string, name: string, qty: number];
}>();

const newItemQty = ref(1);
const newItemSelectedId = ref("");

function submit() {
  const picked = allItems.find((it) => it.id === newItemSelectedId.value);
  if (!picked) return;
  // Clamp to a positive integer — a cleared field submits "" (silent insert
  // failure) and 0 / -3 create bad inventory rows.
  const qty = Math.max(1, Math.floor(Number(newItemQty.value) || 1));
  emit("submit", picked.id, picked.name, qty);
  newItemSelectedId.value = "";
  newItemQty.value = 1;
}
</script>
