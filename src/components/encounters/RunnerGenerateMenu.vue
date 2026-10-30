<template>
  <MenuPopover label="Add a twist to the fight" data-testid="runner-generate-menu">
    <template #trigger="{ toggle, open }">
      <AppButton
        variant="outline"
        size="sm"
        :icon="IconWand"
        :icon-right="IconChevronDown"
        label="Twist"
        tooltip="Generate a complication or reinforcements for this fight"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      />
    </template>

    <template #default="{ close }">
      <AppButton
        v-for="option in OPTIONS"
        :key="option.mode"
        variant="menu"
        size="md"
        block
        class="rounded-none"
        role="menuitem"
        :icon="option.icon"
        :aria-label="option.label"
        @click="pick(option.mode, close)"
      >
        <span class="flex flex-col items-start text-left">
          <span>{{ option.label }}</span>
          <span class="text-caption font-normal text-muted-foreground">{{ option.hint }}</span>
        </span>
      </AppButton>
    </template>
  </MenuPopover>
</template>

<script setup lang="ts">
/**
 * The runner's AI generators, as one top-bar menu. They used to be two buttons
 * heading an always-on Events column; a fight reaches for them rarely, so they
 * take one button's width instead of a column's. The dialog itself belongs to
 * EncounterRunner, which the phone's overflow menu opens too.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import type { ComplicationMode } from "@/ai/useComplicationGeneration";
import { IconChevronDown, IconMonster, IconWand, IconWarning } from "@/lib/icons";

const emit = defineEmits<{ generate: [mode: ComplicationMode] }>();

const OPTIONS = [
  { mode: "complication", label: "Complication", hint: "A hazard or a turn of events", icon: IconWarning },
  { mode: "reinforcements", label: "Reinforcements", hint: "More creatures join the fight", icon: IconMonster },
] as const satisfies readonly { mode: ComplicationMode; label: string; hint: string; icon: unknown }[];

function pick(mode: ComplicationMode, close: (refocus: boolean) => void) {
  close(false);
  emit("generate", mode);
}
</script>
