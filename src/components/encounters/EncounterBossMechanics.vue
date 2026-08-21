<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">Boss Mechanics</h2>
        <p class="text-caption text-muted-foreground mt-1">
          Lair actions fire at initiative 20 each round. Legendary actions auto-enable on any combatant whose stat block has them.
        </p>
      </div>
      <AppCheckbox
        :model-value="lairEnabled"
        label="Lair Actions"
        label-role="label-lg"
        label-tone="foreground"
        class="shrink-0"
        @update:model-value="$emit('update:lair-enabled', $event)"
      />
    </div>
    <div v-if="lairEnabled" class="flex flex-col gap-2">
      <label class="text-label font-semibold text-muted-foreground">LAIR OWNER</label>
      <EntityCombobox
        :model-value="lairOwnerDefId ?? ''"
        :options="lairOwnerOptions"
        placeholder="Search combatants…"
        @update:model-value="$emit('update:lair-owner-def-id', $event || null)"
      />
      <p v-if="lairEnabled && !lairOwnerDefId" class="text-caption text-amber-500/80 italic">
        Pick a combatant whose stat block has Lair Actions. Without one, the runner won't show the lair card.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppCheckbox from '@/components/common/AppCheckbox.vue';
import EntityCombobox from '@/components/common/EntityCombobox.vue';

const {
  lairEnabled,
  lairOwnerDefId = null,
  lairOwnerOptions,
} = defineProps<{
  lairEnabled: boolean;
  lairOwnerDefId: string | null;
  lairOwnerOptions: { id: string; name: string }[];
}>();

defineEmits<{
  'update:lair-enabled': [value: boolean];
  'update:lair-owner-def-id': [value: string | null];
}>();
</script>
