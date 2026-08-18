<template>
  <EntityDetailModal
    :title="entity?.name ?? 'Loading…'"
    :subtitle="subtitle"
    :loading="!entity"
    size="xl"
    height="content"
    @close="emit('close')"
  >
    <MonsterSheet v-if="monster" :monster="monster" />
    <SpellSheet v-else-if="spell" :spell="spell" />
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * What an admin is about to publish art onto, in the shared detail-modal shell.
 *
 * Used to hand-roll its own overlay — the fifth copy of that recipe (#746) —
 * and the copy had drifted in the ways those copies do: `@keydown.esc` sat on a
 * non-focusable `<div>`, so Escape only worked if focus happened to be inside;
 * nothing trapped Tab; and the panel was `max-w-2xl`. That last one was the
 * visible symptom. `MonsterSheet` splits into columns at Tailwind's `lg:`,
 * which is a *viewport* breakpoint rather than a container one, so on a wide
 * screen it laid out two columns and a three-column ability table inside 42rem
 * and crushed them. Sharing the shell fixes the width by giving it the same
 * `xl` every other entity sheet gets, and the rest by not being a copy.
 *
 * `height="content"`: an admin flicks through many of these, and most are short.
 */
import { computed } from "vue";
import EntityDetailModal from "@/components/common/EntityDetailModal.vue";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import { monsterIdentityLine } from "@/lib/monsterDisplay";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";

const { monster = null, spell = null } = defineProps<{
  monster?: Monster | null;
  spell?: Spell | null;
}>();

const emit = defineEmits<{ close: [] }>();

const entity = computed(() => monster ?? spell);

// Only monsters have an identity line to state; a spell's own sheet leads with
// its level and school, so repeating anything here would be the duplication
// this line exists to remove.
const subtitle = computed(() => (monster ? monsterIdentityLine(monster) : undefined));
</script>
