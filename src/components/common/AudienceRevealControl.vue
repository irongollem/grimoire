<template>
  <!--
    The reveal control for entities whose only reveal decision is the audience.

    Notes, factions, deities, pantheons, quests and recipes all store exactly one
    thing — a `player_visible_to[]` column — and each of them had grown its own
    popover, badge or toggle for it. Six near-identical wrappers would have been
    six things to keep in step, so the entity-specific half (which column, which
    mutation) is a prop and an event instead.

    Entities with a real "what" — an NPC's fields, a monster's stat block, a
    location's four switches — get their own wrapper, because there the extra
    half is genuine per-entity behaviour rather than a different mutation name.

    Whether a change persists is decided by the call site, and visibly:

      read surfaces  @change="(next) => updateNote({ id, update: { player_visible_to: next } })"
      editors        @change="(next) => (form.player_visible_to = next)"

    An editor owns its own Save, so writing through on every checkbox would
    commit changes the DM has not agreed to yet — and would fight the form's
    dirty tracking.
  -->
  <RevealControl :adapter="adapter" :entity-name="name" :form="form">
    <template v-if="$slots.what" #what>
      <slot name="what" />
    </template>
  </RevealControl>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import RevealControl from "@/components/common/RevealControl.vue";
import { useParty } from "@/composables/useParty";
import { arrayRevealAdapter } from "@/lib/reveal";

const { visibleTo, form = "button" } = defineProps<{
  /** Party member ids currently revealed to. */
  visibleTo: string[];
  /** Names the entity in the control's title and the sheet's heading. */
  name?: string;
  form?: "button" | "overlay";
}>();

const emit = defineEmits<{ change: [string[]] }>();

const { data: partyData } = useParty();

/**
 * Local optimistic state, so a toggle lands instantly rather than waiting for a
 * refetch — and so a draft-bound call site can re-render from its own form
 * without this control desyncing. Same pattern as ItemDetailPanel.
 */
const draft = ref<string[]>([...visibleTo]);
watch(
  () => visibleTo,
  (next) => {
    draft.value = [...next];
  },
);

// `onChange` rather than a watcher on `draft`: a watcher that saves re-fires
// when the save's refetch pushes a fresh array back in, because the identity
// changed even though the contents did not. See lib/reveal.
const adapter = arrayRevealAdapter(
  draft,
  () => (partyData.value ?? []).map((m) => m.id),
  (next) => emit("change", next),
);
</script>
