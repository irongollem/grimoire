<template>
  <div class="grid grid-cols-[5rem_1fr_auto] gap-2 items-start rounded-md border border-border bg-card p-2">
    <div class="flex items-center gap-1">
      <AppInput
        v-model.number="min"
        type="number"
        tone="filled"
        size="caption"
        align="center"
        :min="1"
        :max="dieMax"
        class="w-9"
      />
      <span class="text-caption text-muted-foreground">–</span>
      <AppInput
        v-model.number="max"
        type="number"
        tone="filled"
        size="caption"
        align="center"
        :min="entry.min"
        :max="dieMax"
        class="w-9"
      />
    </div>
    <div class="flex flex-col gap-1.5 min-w-0">
      <AppInput v-model="label" size="body-xs" tone="filled" placeholder="What happens?" />
      <EntryRefPicker :model-value="entry.ref ?? null" :picture="picture" @update:model-value="patch({ ref: $event })" @picked="onPicked" />
      <AppInput v-model="blurb" size="body-xs" tone="filled" placeholder="What the players read under the picture" />
      <EntityCombobox
        :model-value="entry.encounter_id ?? ''"
        :options="encounterOptions"
        placeholder="Link encounter…"
        @update:model-value="patch({ encounter_id: $event || null })"
      />
    </div>
    <AppButton
      variant="ghost"
      tone="danger"
      size="icon-xs"
      :icon="IconDelete"
      tooltip="Remove entry"
      class="mt-0.5"
      @click="emit('remove')"
    />
    <textarea
      v-if="entry.notes !== null && entry.notes !== undefined"
      :value="entry.notes"
      rows="1"
      placeholder="Notes for you only (optional)"
      class="col-span-3 w-full bg-muted border border-border rounded px-2 py-1 text-caption text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
      @input="patch({ notes: ($event.target as HTMLTextAreaElement).value })"
    />
    <AppButton
      v-else
      variant="ghost"
      size="inline-caption"
      class="col-span-3 justify-start italic"
      label="+ add note (only you see it)"
      @click="patch({ notes: '' })"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * One editable row of a roll table: range, label, what the entry is (with its
 * picture), the blurb players read, an encounter link and a DM-only note.
 * The parent keeps the range validation; this owns the row's layout.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import EntryRefPicker from "@/components/dungeon-features/EntryRefPicker.vue";
import { IconDelete } from "@/lib/icons";
import { labelAfterRefPick } from "@/lib/dungeon-features/entryRefLabel";
import type { EntryPicture } from "@/lib/tableQuestions/options";
import type { RollTableEntry } from "@/types/rollTable.types";

const { dieMax, encounterOptions, picture = null } = defineProps<{
  dieMax: number;
  encounterOptions: { id: string; name: string }[];
  picture?: EntryPicture | null;
}>();
const entry = defineModel<RollTableEntry>({ required: true });
const emit = defineEmits<{ remove: [] }>();

function patch(change: Partial<RollTableEntry>) {
  entry.value = { ...entry.value, ...change };
}

function field<K extends "min" | "max" | "label">(key: K) {
  return computed({
    get: () => entry.value[key],
    set: (v: RollTableEntry[K]) => patch({ [key]: v }),
  });
}
const min = field("min");
const max = field("max");
const label = field("label");
const blurb = computed({
  get: () => entry.value.blurb ?? "",
  set: (v: string) => patch({ blurb: v.trim() === "" ? null : v }),
});

function onPicked(name: string) {
  patch({ label: labelAfterRefPick(entry.value.label, name) });
}
</script>
