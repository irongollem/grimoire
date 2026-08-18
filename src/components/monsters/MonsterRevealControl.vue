<template>
  <!--
    A monster's reveal, in the app's one reveal control.

    Monsters are the second storage model: there is no `player_visible_to`
    column, but a discovery row whose absence means "not discovered" and whose
    `visible_to === null` means "everyone". `useMonsterVisibility` already
    exposes exactly the four `RevealAdapter` operations, so the control never
    learns which model it is talking to.

    The "what" is a single gate — whether players get the full stat block or
    just name, art and CR. Revealing the numbers is a real decision at the
    table, and it was previously reachable only from a phone.
  -->
  <RevealControl :adapter="adapter" :entity-name="monster.name" :form="form">
    <template #what>
      <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
        THEY ALSO SEE
      </p>
      <RevealOption
        label="Full stat block"
        :checked="!!currentDiscovery?.reveal_stats"
        @toggle="toggleStats"
      />
    </template>
  </RevealControl>
</template>

<script setup lang="ts">
import { toRef } from "vue";
import RevealControl from "@/components/common/RevealControl.vue";
import RevealOption from "@/components/common/RevealOption.vue";
import { useMonsterVisibility } from "@/composables/useMonsterVisibility";
import type { RevealAdapter } from "@/lib/reveal";
import type { Monster } from "@/types/monster.types";

const { monster, form = "button" } = defineProps<{
  monster: Monster;
  form?: "button" | "overlay";
}>();

const { currentDiscovery, isMemberVisible, setWholeParty, toggleMember, unshare, updateStats } =
  useMonsterVisibility(toRef(() => monster));

// Named explicitly rather than spread, so that the composable growing a method
// cannot silently change what the control is handed.
const adapter: RevealAdapter = { isMemberVisible, toggleMember, setWholeParty, unshare };

function toggleStats() {
  const discovery = currentDiscovery.value;
  // No discovery row means nobody can see this monster at all, so there is
  // nothing to gate. RevealBody already dims "what" in that state.
  if (!discovery) return;
  updateStats({ id: discovery.id, revealStats: !discovery.reveal_stats });
}
</script>
