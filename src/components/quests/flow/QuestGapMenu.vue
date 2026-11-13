<template>
  <MenuPopover label="Prep gaps" data-testid="quest-gap-menu">
    <template #trigger="{ toggle, open }">
      <AppButton
        variant="tinted"
        tone="caution"
        size="xs"
        :label="`${rows.length} prep gaps`"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      />
    </template>
    <template #default="{ close }">
      <AppButton
        v-for="row in rows"
        :key="row.key"
        variant="menu"
        size="md"
        block
        class="rounded-none"
        :class="row.advisory ? 'text-muted-foreground' : ''"
        role="menuitem"
        :disabled="!row.beatId"
        @click="pick(row, close)"
      >
        <span class="flex min-w-0 flex-col items-start text-left">
          <span v-if="row.beatTitle" class="truncate text-label font-semibold">{{ row.beatTitle }}</span>
          <span class="whitespace-normal text-caption">{{ row.text }}</span>
        </span>
      </AppButton>
    </template>
  </MenuPopover>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";

export interface QuestGapRow {
  key: string;
  /** The beat the row selects; a finding about no single beat has none and cannot be picked. */
  beatId: string | null;
  beatTitle: string | null;
  text: string;
  /** True but not necessarily wrong (a consistency finding marked advisory). */
  advisory?: boolean;
}

defineProps<{ rows: QuestGapRow[] }>();
const emit = defineEmits<{ select: [beatId: string] }>();

function pick(row: QuestGapRow, close: (refocus: boolean) => void) {
  if (!row.beatId) return;
  close(false);
  emit("select", row.beatId);
}
</script>
