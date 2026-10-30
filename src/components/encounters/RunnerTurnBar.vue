<template>
  <div
    class="flex shrink-0 items-center gap-2 border-t border-border bg-card px-2 py-2"
    data-testid="turn-bar"
  >
    <template v-if="store.round === 0">
      <AppButton
        v-if="someoneUnrolled"
        variant="subtle"
        size="lg"
        :icon="IconDiceRoll"
        label="Roll initiative"
        :disabled="store.rollingInitiative"
        @click="emit('roll-initiative')"
      />
      <AppButton
        variant="live"
        size="lg"
        block
        class="flex-1"
        :icon="IconEncounter"
        label="Start combat"
        :disabled="store.rollingInitiative"
        @click="emit('start-combat')"
      />
    </template>

    <template v-else>
      <AppButton
        variant="outline"
        size="icon-sm"
        :class="ICON_TOUCH_TARGET"
        :icon="IconChevronLeft"
        aria-label="Previous turn"
        @click="emit('prev')"
      />
      <AppButton
        variant="menu"
        size="well"
        class="min-w-0 flex-1"
        aria-label="Open the active combatant"
        @click="emit('open-active')"
      >
        <span v-if="portrait" class="h-10 w-10 shrink-0 overflow-hidden rounded-md">
          <FocalImage
            :src="portrait.src"
            :placeholder="placeholder"
            :alt="portrait.alt"
            :focal-point="portrait.focalPoint"
            format="square"
          />
        </span>
        <span class="min-w-0 leading-tight">
          <span class="block truncate text-label-lg font-bold text-foreground">{{ active?.name }}</span>
          <span class="block text-caption font-normal text-muted-foreground">
            Round {{ store.round }} · {{ store.activeIndex + 1 }} of {{ store.sortedCombatants.length }}
          </span>
        </span>
      </AppButton>
      <AppButton
        variant="primary"
        size="lg"
        :icon-right="IconChevronRight"
        label="Next"
        @click="emit('next')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The phone's turn bar, pinned above the bottom nav. Pre-combat it is the way
 * in (roll, then start); in combat it is Previous / the active combatant /
 * Next, all at thumb size. The centre opens the active combatant's stat block.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/controls/appButtonVariants";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { IconChevronLeft, IconChevronRight, IconDiceRoll, IconEncounter } from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { useFormPortraits } from "@/composables/party/useFormPortraits";
import { placeholderKind } from "@/lib/wildshapePortrait";
import { useEncounterRunStore } from "@/stores/encounterRun";

const emit = defineEmits<{
  "roll-initiative": [];
  "start-combat": [];
  prev: [];
  next: [];
  "open-active": [];
}>();

const store = useEncounterRunStore();

const active = computed(() => store.activeCombatant);
const someoneUnrolled = computed(() => store.combatants.some((c) => c.initiative === null));
const portraitOf = useFormPortraits(() => [active.value?.wildshape]);
const portrait = computed(() => (active.value ? portraitOf(active.value, active.value.wildshape) : null));
const placeholder = computed(() =>
  placeholderUrl(active.value && portrait.value ? placeholderKind(active.value, portrait.value) : "monster"),
);
</script>
