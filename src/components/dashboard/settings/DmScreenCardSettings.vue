<template>
  <div class="space-y-2">
    <!-- Wrapping label: `EntityCombobox` takes no id or aria-label, so implicit
         association through the nested input is the only thing that names it. -->
    <label class="block space-y-1.5">
      <span class="block font-cinzel text-body-sm text-foreground">Reference table</span>
      <EntityCombobox v-model="tableId" :options="options" placeholder="Search the DM screen…">
        <template #option="{ opt }">
          <span class="flex flex-col gap-0.5 py-0.5">
            <span class="font-semibold">{{ opt.name }}</span>
            <span class="text-caption text-muted-foreground">{{ opt.section }}</span>
          </span>
        </template>
      </EntityCombobox>
    </label>
    <p class="text-caption text-muted-foreground">
      Add another DM screen card for each table you want in front of you.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Which of the DM screen's reference tables one quick card shows (#764).
 *
 * A settings editor, not a widget: `DashboardWidgetSettingsModal` mounts it for
 * whichever instance the DM opened, and every change is applied to the layout
 * straight away — the same as cycling a widget's width. There is no OK button
 * anywhere in Customize mode and this does not introduce one.
 *
 * `EntityCombobox` rather than `AppSelect` because the DM screen holds
 * twenty-nine tables across five sections. That is well past the "small fixed
 * option set" a native `<select>` is sanctioned for, and typing "fall" to reach
 * Falling & Suffocation is the whole difference between this being usable and
 * being a scroll.
 */
import { computed } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { DM_SCREEN_TABLE_OPTIONS, parseDmScreenCardSettings } from "@/lib/dashboard/dmScreenCard";

const { modelValue } = defineProps<{
  /** The instance's stored settings — absent on a card the DM has never configured. */
  modelValue?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [settings: Record<string, unknown>];
}>();

const options = computed(() => DM_SCREEN_TABLE_OPTIONS.map((option) => ({ ...option })));

/**
 * Reads through the same parser the widget uses, so an unconfigured card opens
 * the picker already showing the table it is actually displaying rather than an
 * empty box that implies nothing is chosen.
 */
const tableId = computed<string>({
  get: () => parseDmScreenCardSettings(modelValue).tableId,
  set: (next) => {
    // The combobox clears to "" through its own clear control; a card must
    // always show some table, so that reads as "leave it alone", not a value.
    if (next === "") return;
    emit("update:modelValue", { tableId: next });
  },
});
</script>
