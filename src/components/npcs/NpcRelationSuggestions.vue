<template>
  <div class="border border-border rounded-lg p-3 mb-4 bg-muted/30 space-y-2">
    <div class="flex items-center justify-between">
      <div class="text-label-lg font-semibold text-muted-foreground">
        Suggested connections
      </div>
      <AppButton variant="subtle" size="sm" label="Dismiss all" @click="emit('dismissAll')" />
    </div>
    <p class="text-caption text-muted-foreground">
      Nothing is saved until you accept a suggestion.
    </p>
    <div
      v-for="s in suggestions"
      :key="`${s.kind}:${s.target_id}`"
      class="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card"
    >
      <span
        class="shrink-0 mt-0.5 px-2 py-0.5 rounded text-label font-bold"
        :style="{
          backgroundColor: `color-mix(in oklab, ${badge(s).color} 13%, transparent)`,
          color: badge(s).color,
        }"
      >
        {{ badge(s).label }}
      </span>
      <div class="flex-1 min-w-0">
        <div class="font-cinzel text-sm font-semibold text-foreground">
          {{ s.target_name }}
          <span v-if="s.kind === 'faction'" class="font-fell font-normal text-muted-foreground">
            (faction)
          </span>
        </div>
        <p
          v-if="s.notes"
          class="text-caption text-muted-foreground mt-0.5 wrap-break-word whitespace-normal"
        >
          {{ s.notes }}
        </p>
      </div>
      <div class="shrink-0 flex gap-1">
        <AppButton
          variant="primary"
          size="sm"
          :icon="IconCheck"
          icon-size="xs"
          label="Accept"
          :disabled="pending"
          @click="emit('accept', s)"
        />
        <AppButton
          variant="subtle"
          size="sm"
          label="Dismiss"
          :disabled="pending"
          @click="emit('dismiss', s)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconCheck } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { NPC_RELATIONSHIP_TYPE_LABELS, NPC_RELATIONSHIP_TYPE_VAR } from "@/types/npc.types";
import type { ResolvedSuggestion } from "@/ai/useNpcRelationshipSuggestions";

defineProps<{ suggestions: ResolvedSuggestion[]; pending: boolean }>();
const emit = defineEmits<{
  accept: [suggestion: ResolvedSuggestion];
  dismiss: [suggestion: ResolvedSuggestion];
  dismissAll: [];
}>();

function badge(s: ResolvedSuggestion): { label: string; color: string } {
  if (s.kind === "npc") {
    return {
      label: NPC_RELATIONSHIP_TYPE_LABELS[s.relationship_type],
      color: NPC_RELATIONSHIP_TYPE_VAR[s.relationship_type],
    };
  }
  return { label: s.role || "Member", color: "var(--muted-foreground)" };
}
</script>
