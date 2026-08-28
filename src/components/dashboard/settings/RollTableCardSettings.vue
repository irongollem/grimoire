<template>
  <div class="space-y-2">
    <label class="block space-y-1.5">
      <span class="block font-cinzel text-body-sm text-foreground">Roll table</span>
      <EntityCombobox v-model="tableId" :options="options" :placeholder="placeholder">
        <template #option="{ opt }">
          <span class="flex flex-col gap-0.5 py-0.5">
            <span class="font-semibold">{{ opt.name }}</span>
            <span class="text-caption text-muted-foreground">{{ opt.detail }}</span>
          </span>
        </template>
      </EntityCombobox>
    </label>
    <p class="text-caption text-muted-foreground">
      Add another card for each table you want to roll from the dashboard.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Which saved roll table one card rolls (#764).
 *
 * Unlike the DM screen card's editor, the options here are a *query* — roll
 * tables are campaign rows, so the list is empty until it loads and can be
 * genuinely empty afterwards. The placeholder says which of the two the DM is
 * looking at; an empty picker with a "Search…" prompt reads as broken.
 */
import { computed } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { parseRollTableCardSettings } from "@/lib/dashboard/rollTableCard";

const { modelValue } = defineProps<{
  modelValue?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [settings: Record<string, unknown>];
}>();

const { data: tables, isLoading } = useRollTables();

const options = computed(() => {
  const loaded = tables.value;
  // Empty because nothing has loaded, not because nothing exists — the
  // placeholder below is what tells the DM which of the two they are seeing.
  if (loaded === undefined) return [];
  return loaded.map((table) => ({
    id: table.id,
    name: table.name,
    detail: `${table.dice} · ${table.entries.length} ${table.entries.length === 1 ? "entry" : "entries"}`,
  }));
});

const placeholder = computed(() => {
  if (isLoading.value) return "Loading your tables…";
  if (options.value.length === 0) return "No roll tables in this campaign yet";
  return "Search your roll tables…";
});

/**
 * Empty while unconfigured, on purpose — the widget's fallback to the first
 * table is a *default*, not a choice, and showing it here would make the DM
 * think they had already picked it.
 */
const tableId = computed<string>({
  get: () => {
    const { tableId: stored } = parseRollTableCardSettings(modelValue);
    // "" is `EntityCombobox`'s own "nothing selected" value — its clear control
    // writes exactly this — so it is the API's word for absence rather than a
    // null being coerced away.
    return stored === undefined ? "" : stored;
  },
  set: (next) => {
    if (next === "") return;
    emit("update:modelValue", { tableId: next });
  },
});
</script>
