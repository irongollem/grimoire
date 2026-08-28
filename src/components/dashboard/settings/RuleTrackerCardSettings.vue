<template>
  <div class="space-y-2">
    <label class="block space-y-1.5">
      <span class="block font-cinzel text-body-sm text-foreground">Rule tracker</span>
      <EntityCombobox v-model="ruleId" :options="options" :placeholder="placeholder">
        <template #option="{ opt }">
          <span class="flex flex-col gap-0.5 py-0.5">
            <span class="font-semibold">{{ opt.name }}</span>
            <span class="text-caption text-muted-foreground">{{ opt.detail }}</span>
          </span>
        </template>
      </EntityCombobox>
    </label>
    <p class="text-caption text-muted-foreground">
      Add another card for each tracker you want pinned to the dashboard.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Which custom rule's tracker one card shows (#764).
 *
 * Like the roll-table card's editor, the options here are a query scoped to
 * rules that actually carry a tracker — a homebrew rule with no `tracker`
 * has nothing this card could show, so it never appears in the list. The
 * placeholder distinguishes "still loading" from "genuinely nothing to pick"
 * so an empty picker never reads as broken.
 */
import { computed } from "vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useRules } from "@/composables/rules/useRules";
import { parseRuleTrackerCardSettings } from "@/lib/dashboard/ruleTrackerCard";

const { modelValue } = defineProps<{
  modelValue?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [settings: Record<string, unknown>];
}>();

const { data: rules, isLoading } = useRules();

const options = computed(() => {
  const loaded = rules.value;
  // Empty because nothing has loaded, not because nothing exists — the
  // placeholder below is what tells the DM which of the two they are seeing.
  if (loaded === undefined) return [];
  return loaded
    .filter((rule) => rule.tracker !== null)
    .map((rule) => ({
      id: rule.id,
      name: rule.title,
      detail: `${rule.tracker!.label} · ${rule.tracker!.type} · ${rule.tracker!.min}–${rule.tracker!.max}`,
    }));
});

const placeholder = computed(() => {
  if (isLoading.value) return "Loading your rules…";
  if (options.value.length === 0) return "No rule trackers in this campaign yet";
  return "Search your rules…";
});

/**
 * Empty while unconfigured, on purpose — the widget's fallback to the first
 * tracker-bearing rule is a *default*, not a choice, and showing it here
 * would make the DM think they had already picked it.
 */
const ruleId = computed<string>({
  get: () => {
    const { ruleId: stored } = parseRuleTrackerCardSettings(modelValue);
    // "" is `EntityCombobox`'s own "nothing selected" value — its clear
    // control writes exactly this — so it is the API's word for absence
    // rather than a null being coerced away.
    return stored === undefined ? "" : stored;
  },
  set: (next) => {
    if (next === "") return;
    emit("update:modelValue", { ruleId: next });
  },
});
</script>
