<template>
  <!-- Pre-combat: Mark surprised combatants -->
  <div
    v-if="!store.started && hasAnyCombatants"
    class="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-2"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-label-lg font-semibold text-amber-500">
        SURPRISE — Optional
      </span>
      <AppButton
        variant="ghost"
        size="inline-xs"
        :label="showSurprise ? 'Hide' : 'Mark surprised'"
        @click="showSurprise = !showSurprise"
      />
    </div>
    <p v-if="!showSurprise && surprisedCount === 0" class="text-caption text-muted-foreground italic mt-0.5">
      Mark creatures that are surprised — they'll skip their first turn.
    </p>
    <div v-else-if="showSurprise" class="mt-2 flex flex-wrap gap-1.5">
      <AppButton
        v-for="c in store.combatants"
        :key="c.instance_id"
        variant="subtle"
        surface="card"
        tone="caution"
        size="xs"
        :active="c.surprised"
        @click="store.toggleSurprised(c.instance_id)"
      >{{ c.name }}{{ c.surprised ? ' ✦' : '' }}</AppButton>
    </div>
    <p v-if="!showSurprise && surprisedCount > 0" class="text-caption text-amber-400 mt-0.5">
      {{ surprisedCount }} surprised creature{{ surprisedCount > 1 ? 's' : '' }}.
    </p>
  </div>

  <!-- Lair Actions — persistent card when round > 0 and enabled -->
  <div
    v-if="store.started && store.lairEnabled && store.lairOwnerInstanceId"
    class="rounded-lg border bg-card px-3 py-2 mb-2"
    :class="store.lairCanFireThisRound ? 'border-violet-500/60 bg-violet-500/5' : 'border-border opacity-70'"
  >
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-label-lg font-semibold"
        :class="store.lairCanFireThisRound ? 'text-violet-400' : 'text-muted-foreground'"
      >✦ INIT 20 — LAIR ACTION</span>
      <span class="text-caption text-muted-foreground flex-1">
        <template v-if="!store.lairCanFireThisRound">Fired this round. Resets on round rollover.</template>
        <template v-else-if="lairActions.length === 0">Owner's stat block has no Lair Actions — check the monster entry.</template>
        <template v-else>Click an action to fire it for this round.</template>
      </span>
    </div>
    <div v-if="store.lairCanFireThisRound && lairActions.length > 0" class="mt-2 flex flex-wrap gap-1.5">
      <AppButton
        v-for="(action, idx) in lairActions"
        :key="idx"
        variant="tinted"
        tone="arcane"
        size="xs"
        class="rounded-md py-1"
        :label="action.name"
        :tooltip="action.description"
        @click="fireLairAction(action)"
      />
    </div>
  </div>

  <!-- Legendary Action menu — shown when active combatant is NOT the
       legendary creature, and the legendary creature still has uses. -->
  <div
    v-for="legendary in activeLegendaryOthers"
    :key="legendary.instance_id"
    class="rounded-lg border border-rose-500/40 bg-rose-500/5 px-3 py-2 mb-2"
  >
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-label-lg font-semibold text-rose-400">
        ⚔ {{ legendary.name.toUpperCase() }} — LEGENDARY ACTIONS
      </span>
      <span class="font-cinzel text-2xs text-muted-foreground">
        {{ legendary.legendary_actions_remaining }} / {{ legendary.legendary_action_cap }} remaining
      </span>
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5">
      <AppButton
        v-for="(action, idx) in getLegendaryActions(legendary.monster_id)"
        :key="idx"
        variant="tinted"
        tone="danger"
        size="xs"
        :tooltip="action.description"
        :disabled="actionCost(action.name) > (legendary.legendary_actions_remaining ?? 0)"
        @click="fireLegendaryAction(legendary.instance_id, legendary.name, action)"
      ><span>{{ action.name }}<span v-if="actionCost(action.name) > 1" class="ml-1 text-muted-foreground">(×{{ actionCost(action.name) }})</span></span></AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import AppButton from "@/components/common/AppButton.vue";

const store = useEncounterRunStore();
// Chat posting is best-effort from the runner — sendSystemMessage no-ops
// without an active campaign and swallows a failed insert.
const { sendSystemMessage } = useCampaignMessages();

const showSurprise = ref(false);
const surprisedCount = computed(() => store.combatants.filter((c) => c.surprised).length);
const hasAnyCombatants = computed(() => store.combatants.length > 0);

/** Lair actions sourced from the owner's monster stat block. */
const lairActions = computed(() => {
  const ownerId = store.lairOwnerInstanceId;
  if (!ownerId) return [];
  const owner = store.combatants.find((c) => c.instance_id === ownerId);
  if (!owner?.monster_id) return [];
  const monster = store.availableMonsters.find((m) => m.id === owner.monster_id);
  return monster?.stat_block?.lair_actions ?? [];
});

/** Legendary creatures in the fight, other than the currently active combatant. */
const activeLegendaryOthers = computed(() => {
  const activeId = store.activeCombatant?.instance_id;
  return store.combatants.filter((c) =>
    c.monster_id
      && typeof c.legendary_actions_remaining === "number"
      && (c.legendary_actions_remaining ?? 0) > 0
      && c.hp > 0
      && c.instance_id !== activeId,
  );
});

function getLegendaryActions(monsterId: string | undefined) {
  if (!monsterId) return [];
  const monster = store.availableMonsters.find((m) => m.id === monsterId);
  return monster?.stat_block?.legendary_actions ?? [];
}

/**
 * Parse "(Costs 2 Actions)" from an action name and return the cost.
 * 5e monster stat blocks encode cost in the action name, per MM.
 */
function actionCost(name: string): number {
  const match = name.match(/costs (\d+) actions?/i);
  return match ? parseInt(match[1], 10) : 1;
}

async function fireLairAction(action: { name: string; description: string }) {
  const owner = store.combatants.find((c) => c.instance_id === store.lairOwnerInstanceId);
  if (!owner) return;
  store.markLairFired();
  await sendSystemMessage(`uses Lair Action: ${action.name}`, `⚔ ${owner.name} (lair)`);
}

async function fireLegendaryAction(instanceId: string, name: string, action: { name: string; description: string }) {
  const cost = actionCost(action.name);
  const spent = store.spendLegendaryActions(instanceId, cost);
  if (spent === 0) return;
  await sendSystemMessage(`uses legendary action: ${action.name}`, `⚔ ${name}`);
}
</script>
