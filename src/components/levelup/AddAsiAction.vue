<template>
  <div class="flex flex-col gap-3 pt-1">
    <div v-if="!open">
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add Ability Score Improvement at levels…"
        @click="open = true"
      />
    </div>

    <div v-else class="rounded-md border border-border bg-muted/20 p-3 flex flex-col gap-3">
      <p class="text-body text-muted-foreground">
        Grants the official Ability Score Improvement feature at each level you tick. Levels that already have it are left alone.
      </p>
      <p v-if="!asi" class="text-body text-destructive" role="alert">
        The official Ability Score Improvement feature is not in the Abilities compendium for this edition yet.
      </p>
      <div class="grid grid-cols-5 sm:grid-cols-10 gap-x-3 gap-y-2">
        <AppCheckbox v-for="n in 20" :key="n" v-model="picked[n - 1]" :label="String(n)" label-role="caption" />
      </div>
      <div class="flex items-center gap-2">
        <AppButton variant="primary" size="sm" label="Add" :disabled="!asi || chosenLevels.length === 0" @click="add" />
        <AppButton variant="subtle" size="sm" label="Cancel" @click="close" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import { useRuleset } from "@/composables/rules/useRuleset";
import { DEFAULT_ASI_LEVELS, findOfficialAsiFeature, withFeatureAtLevels } from "@/lib/codex/asiFeature";
import type { RulesetKey } from "@/types/ruleset.types";

/** The helper that replaces a class's old ASI-levels list: it places the shared ASI feature at chosen levels. */
const { features, ruleset = null } = defineProps<{
  features: Record<string, string[]>;
  /** The class's own edition; the table's edition when it has none yet. */
  ruleset?: RulesetKey | null;
}>();
const emit = defineEmits<{ "update:features": [value: Record<string, string[]>] }>();

const { data: all } = useAllFeatures();
const { ruleset: activeRuleset } = useRuleset();
const asi = computed(() => findOfficialAsiFeature(all.value ?? [], ruleset ?? activeRuleset.value));

const open = ref(false);
const picked = ref<boolean[]>(Array.from({ length: 20 }, (_, i) => DEFAULT_ASI_LEVELS.some((l) => l === i + 1)));
const chosenLevels = computed(() => picked.value.flatMap((on, i) => (on ? [i + 1] : [])));

function add() {
  if (!asi.value) return;
  emit("update:features", withFeatureAtLevels(features, asi.value.id, chosenLevels.value));
  close();
}

function close() {
  open.value = false;
}
</script>
