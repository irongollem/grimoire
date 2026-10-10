<template>
  <!--
    One spell in the desktop spellbook grid: the bestiary card's shape, with the
    school's colour as the bar and the spell's level as the badge on the art.
    The shell is `EntityGridCard`; this only says what a spell puts in it.
  -->
  <EntityGridCard
    :to="`/spells/${spell.id}`"
    :title="spell.name"
    :image-url="spell.image_url"
    :focal-point="spell.image_focal_point"
    :placeholder="placeholderUrl('spell')"
    :accent-class="SCHOOL_BG[spell.school]"
    :badge-text="spellLevelOrdinal(spell.level)"
    :badge-class="SCHOOL_BG[spell.school]"
    :activates="activates"
    @activate="emit('activate')"
  >
    <template #body>
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">
          {{ spell.name }}
        </h3>
        <span
          v-if="spell.is_shared"
          :title="sourceLabel"
          class="max-w-22 shrink-0 truncate rounded border border-border bg-muted px-1 py-0.5 text-label font-bold text-muted-foreground"
        >
          {{ sourceLabel }}
        </span>
      </div>

      <p class="text-caption text-muted-foreground capitalize italic">
        {{ spellLevelLabel(spell.level) }} {{ spell.school }}<template v-if="spell.ritual"> · Ritual</template>
      </p>

      <div class="flex gap-3 text-label-lg text-muted-foreground">
        <span class="min-w-0 truncate"><span class="font-bold text-foreground">Cast</span> {{ spell.casting_time }}</span>
        <span class="min-w-0 truncate"><span class="font-bold text-foreground">Range</span> {{ spell.range }}</span>
      </div>

      <p class="truncate text-label-lg text-muted-foreground">
        <span class="font-bold text-foreground">Components</span>
        {{ spell.components.join(", ") || "None" }}
        <template v-if="spell.concentration"> · <em class="text-primary">Conc.</em></template>
      </p>

      <div v-if="spell.tags.length" class="mt-auto flex flex-wrap gap-1">
        <span
          v-for="tag in spell.tags.slice(0, 3)"
          :key="tag"
          class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
        >
          {{ tag }}
        </span>
      </div>
    </template>

    <!-- Edit is a custom-spell action and is absent on library rows and in the player portal. -->
    <template v-if="canEdit" #actions-start>
      <AppButton
        variant="ghost"
        size="icon-xs"
        :class="[CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/spells/${spell.id}?edit=true`"
        tooltip="Edit spell"
        aria-label="Edit spell"
      />
    </template>

    <!-- The player portal's Learn / Prepare control, over the art's corner. -->
    <template v-if="$slots.overlay" #image-overlay>
      <slot name="overlay" />
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/appButtonVariants";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import { IconEdit } from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { SCHOOL_BG, spellLevelLabel, spellLevelOrdinal } from "@/types/spell.types";
import type { SpellBrowseRow } from "@/types/spell.types";

const { spell } = defineProps<{
  spell: SpellBrowseRow;
  /** Opens through the parent (`activate`) instead of navigating. */
  activates?: boolean;
  /** Show the Edit chip. */
  canEdit?: boolean;
}>();

const emit = defineEmits<{ activate: [] }>();

const sourceLabel = computed(() => spell.source_title ?? spell.source ?? "Reference");
</script>
