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
    :eyebrow="spell.school"
    :tab="{ text: spellLevelTab(spell.level), label: 'Spell level', toneClass: SCHOOL_BG[spell.school] }"
    :activates="activates"
    @activate="emit('activate')"
  >
    <template #body="{ artFree }">
      <!-- Art-free: the card draws the name, the school is its eyebrow and the level its tab. -->
      <p v-if="artFree" class="flex gap-3 text-label-lg text-muted-foreground">
        <span class="min-w-0 truncate">{{ spell.casting_time }} · {{ spell.range }}</span>
        <span v-if="spell.concentration" class="font-bold text-primary" title="Concentration">C</span>
        <span v-if="spell.ritual" class="font-bold text-primary" title="Ritual">R</span>
      </p>
      <template v-else>
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-1 flex-1 text-heading-xs leading-tight font-bold text-foreground">
          {{ spell.name }}
        </h3>
        <div class="flex shrink-0 items-center gap-1">
          <SourceBadge :source="spell.source" :title="spell.source_title" class="max-w-22 truncate" />
        </div>
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

      <TagChips :tags="spell.tags" :max="3" class="mt-auto" />
      </template>
    </template>

    <!-- Art-free: tags or the book's name sit in the foot, where the plate's source badge was. -->
    <template #foot>
      <div class="flex flex-wrap items-center gap-1">
        <SourceBadge :source="spell.source" :title="spell.source_title" class="max-w-22 truncate" />
        <TagChips :tags="spell.tags" :max="2" />
      </div>
    </template>

    <!-- Edit is a custom-spell action and is absent on library rows and in the player portal. -->
    <template v-if="canEdit" #actions-start="{ artFree }">
      <AppButton
        variant="ghost"
        size="icon-xs"
        :class="artFree ? undefined : [CARD_OVERLAY_ACTION, 'text-white hover:text-white']"
        :icon="IconEdit"
        :to="`/spells/${spell.id}?edit=true`"
        tooltip="Edit spell"
        aria-label="Edit spell"
      />
    </template>

    <!-- The player portal's Learn / Prepare control, over the art's corner. -->
    <template v-if="$slots.overlay" #image-overlay="{ artFree }">
      <slot name="overlay" :art-free="artFree" />
    </template>
  </EntityGridCard>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import SourceBadge from "@/components/common/entity/SourceBadge.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { CARD_OVERLAY_ACTION } from "@/components/common/controls/appButtonVariants";
import EntityGridCard from "@/components/common/entity/EntityGridCard.vue";
import { IconEdit } from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { SCHOOL_BG, spellLevelLabel, spellLevelOrdinal, spellLevelTab } from "@/types/spell.types";
import type { SpellBrowseRow } from "@/types/spell.types";

const { spell } = defineProps<{
  spell: SpellBrowseRow;
  /** Opens through the parent (`activate`) instead of navigating. */
  activates?: boolean;
  /** Show the Edit chip. */
  canEdit?: boolean;
}>();

const emit = defineEmits<{ activate: [] }>();

defineSlots<{
  /** The player portal's Learn control; `artFree` says it sits in the foot, off the plate. */
  overlay?: (props: { artFree: boolean }) => unknown;
}>();
</script>
