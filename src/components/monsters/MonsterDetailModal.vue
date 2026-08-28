<template>
  <EntityDetailModal
    :title="displayName"
    :subtitle="subtitle"
    :loading="isLoading"
    height="content"
    :origin-key="`/monsters/${id}`"
    @close="emit('close')"
  >
    <template #actions>
      <MonsterRevealControl v-if="monster" :monster="monster" />
      <AppButton
        variant="subtle"
        size="sm"
        label="Edit"
        :icon="IconEdit"
        :to="`/monsters/${id}?edit=true`"
      />
    </template>

    <MonsterSheet v-if="monster" :monster="monster" />
    <p v-else class="py-16 text-center text-body text-muted-foreground italic">
      This monster could not be found.
    </p>
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * A monster's stat block, over the bestiary.
 *
 * The NPC modal's twin, and deliberately the same shape — everything about
 * being a modal belongs to `EntityDetailModal`. What differs is monster-shaped:
 * the sheet flows rather than managing two independently scrolling columns, so
 * this asks for neither `contained` nor a filled panel height — the body does
 * the scrolling and the panel ends where the stat block does, which matters
 * because a CR 1/4 acolyte is a third the length of a dragon; and the entity
 * may be a shared library row, so the art override has to be folded in — which
 * `useMonsterWithArt` does, for this and for the detail page alike.
 */
import { computed, toRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityDetailModal from "@/components/common/EntityDetailModal.vue";
import MonsterRevealControl from "@/components/monsters/MonsterRevealControl.vue";
import MonsterSheet from "@/components/monsters/MonsterSheet.vue";
import { useMonsterWithArt } from "@/composables/monsters/useMonsters";
import { IconEdit } from "@/lib/icons";
import { monsterIdentityLine } from "@/lib/monsterDisplay";

const { id } = defineProps<{ id: string }>();

const emit = defineEmits<{ close: [] }>();

const { monster, isLoading } = useMonsterWithArt(toRef(() => id));

const displayName = computed(() => monster.value?.name ?? "Monster");

/** What this monster is, in one line — the header's job now the sheet has dropped it. */
const subtitle = computed(() => {
  const m = monster.value;
  if (!m) return undefined;
  const source = m.is_shared ? m.source_title ?? m.source ?? "Reference" : null;
  return [monsterIdentityLine(m), `CR ${m.stat_block.challenge_rating}`, source]
    .filter(Boolean)
    .join(" · ");
});
</script>
