<template>
  <!--
    The grid card for a character option (a species, a background): an
    EntityGridCard that can also be picked. The Codex lists these for the DM to
    browse and edit; the player's character-creation pickers list the same
    options and need a card that selects instead of navigating, shows which one
    is chosen, and carries a Select button. That wrapper was written out in both
    SpeciesList and BackgroundList, so it lives here once and each list passes
    only its own body.
  -->
  <EntityGridCard
    :to="to"
    :title="title"
    :image-url="imageUrl"
    :focal-point="focalPoint"
    :placeholder="placeholder"
    :activates="selectMode"
    :class="selected ? 'border-primary! ring-1 ring-primary/20' : ''"
    @activate="emit('select')"
  >
    <template v-if="editTo && !selectMode" #actions-start>
      <AppButton
        variant="ghost"
        size="icon-xs"
        :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="editTo"
        :tooltip="editLabel"
        :aria-label="editLabel"
      />
    </template>

    <template v-if="selected" #actions-end>
      <span class="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <IconCheck class="size-3" />
      </span>
    </template>

    <template #body>
      <slot />
      <AppButton
        v-if="selectMode"
        variant="tinted"
        tone="primary"
        emphasis="soft"
        size="sm"
        block
        class="relative z-10 mt-2"
        label="Select"
        @click.stop="emit('select')"
      />
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import { IconCheck, IconEdit } from "@/lib/icons";

defineProps<{
  to: string;
  title: string;
  placeholder: string;
  imageUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  /** The player picker: the card selects instead of navigating. */
  selectMode?: boolean;
  /** This is the option already chosen in the picker. */
  selected?: boolean;
  /** Where the corner Edit chip goes; absent for a read-only viewer or a shared option. */
  editTo?: string | null;
  editLabel?: string;
}>();

const emit = defineEmits<{ select: [] }>();
</script>
