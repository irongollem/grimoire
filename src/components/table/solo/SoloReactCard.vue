<template>
  <!-- Your Reaction (the maintainer, 21 Nov 2026: "Ask with a React card"): the fight is paused while you choose. Space casts, Escape lets it go. -->
  <section class="mx-auto mb-2 flex w-full max-w-176 flex-col gap-2 rounded-md border border-primary bg-card px-3.5 py-3" aria-label="Your reaction" data-testid="solo-react-offer">
    <span class="text-eyebrow text-primary">Your reaction</span>
    <p class="text-body text-foreground">{{ question }}</p>
    <p v-for="line in notes" :key="line" class="text-caption text-muted-foreground">{{ line }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="primary" size="md" :aria-label="`Cast ${castName}`" :disabled="sending" @click="answer('cast')">
        <span>Cast {{ castName }}</span><span class="ml-1.5 hidden sm:inline-flex"><KeyCap>Space</KeyCap></span>
      </AppButton>
      <AppButton variant="outline" size="md" :label="offer.kind === 'shield' ? 'Take the hit' : 'Let it be cast'" :disabled="sending" @click="answer('pass')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import type { ReactionAnswer, ReactionOffer } from "@/rules/fight/reactionOffer";

const { offer, nameOf } = defineProps<{ offer: ReactionOffer; nameOf: (instanceId: string) => string }>();
const emit = defineEmits<{ answer: [answer: ReactionAnswer] }>();

// One answer only: the card stays up, disabled, until the board takes it away once the server has replied.
const sending = ref(false);
function answer(choice: ReactionAnswer): void {
  if (sending.value) return;
  sending.value = true;
  emit("answer", choice);
}
useHotkeys(() => [
  { combo: "space", description: "Cast the reaction spell", handler: () => answer("cast") },
  { combo: "escape", description: "Let the reaction go", hidden: true, handler: () => answer("pass") },
]);

const castName = computed(() => (offer.kind === "shield" ? offer.spell : offer.counterSpell));
const question = computed(() => {
  if (offer.kind === "shield") {
    return `${nameOf(offer.attackerId)}'s ${offer.attack} hits you: ${offer.roll.total} against your armour class ${offer.armorClass}. Cast ${offer.spell} to make it miss?`;
  }
  return `${nameOf(offer.casterId)} is casting ${offer.spell} (level ${offer.spellLevel}). Cast ${offer.counterSpell} to stop it?`;
});
const notes = computed(() => {
  // What the cast costs, as the sheet lists the spell: a slot of a level, one of its daily uses, or nothing at will.
  const slot = offer.spends === "slot" ? [`Spends a level ${offer.castLevel} slot.`] : offer.spends === "use" ? ["Spends one of its uses for the day."] : [];
  if (offer.kind === "shield") return [[`Armour class ${offer.shieldedArmorClass} until your next turn.`, ...slot].join(" ")];
  const how = offer.check !== undefined ? `You make a spellcasting check against DC ${offer.check.dc}.` : offer.save !== undefined ? `${nameOf(offer.casterId)} makes a Constitution save against DC ${offer.save.dc}.` : null;
  return [...slot, ...(how === null ? [] : [how])];
});
</script>
