<template>
  <!-- Pre-combat: Mark surprised combatants -->
  <div
    v-if="!store.started && hasAnyCombatants"
    class="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 mb-2"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="font-cinzel text-xs font-semibold text-amber-500 tracking-wider">
        SURPRISE — Optional
      </span>
      <button
        type="button"
        class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        @click="showSurprise = !showSurprise"
      >{{ showSurprise ? 'Hide' : 'Mark surprised' }}</button>
    </div>
    <p v-if="!showSurprise && surprisedCount === 0" class="font-fell text-[11px] text-muted-foreground italic mt-0.5">
      Mark creatures that are surprised — they'll skip their first turn.
    </p>
    <div v-else-if="showSurprise" class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="c in store.combatants"
        :key="c.instance_id"
        type="button"
        class="px-2 py-0.5 rounded font-cinzel text-[10px] tracking-wider border transition-colors"
        :class="c.surprised
          ? 'bg-amber-500/20 border-amber-500/60 text-amber-400'
          : 'bg-card border-border text-muted-foreground hover:border-amber-500/40'"
        @click="store.toggleSurprised(c.instance_id)"
      >{{ c.name }}{{ c.surprised ? ' ✦' : '' }}</button>
    </div>
    <p v-if="!showSurprise && surprisedCount > 0" class="font-fell text-[11px] text-amber-400 mt-0.5">
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
      <span class="font-cinzel text-xs font-semibold tracking-wider"
        :class="store.lairCanFireThisRound ? 'text-violet-400' : 'text-muted-foreground'"
      >✦ INIT 20 — LAIR ACTION</span>
      <span class="font-fell text-[11px] text-muted-foreground flex-1">
        <template v-if="!store.lairCanFireThisRound">Fired this round. Resets on round rollover.</template>
        <template v-else-if="lairActions.length === 0">Owner's stat block has no Lair Actions — check the monster entry.</template>
        <template v-else>Click an action to fire it for this round.</template>
      </span>
    </div>
    <div v-if="store.lairCanFireThisRound && lairActions.length > 0" class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="(action, idx) in lairActions"
        :key="idx"
        type="button"
        class="px-2 py-1 rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300 font-cinzel text-[10px] tracking-wider hover:bg-violet-500/20 hover:border-violet-500/60 transition-colors"
        :title="action.description"
        @click="fireLairAction(action)"
      >{{ action.name }}</button>
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
      <span class="font-cinzel text-xs font-semibold text-rose-400 tracking-wider">
        ⚔ {{ legendary.name.toUpperCase() }} — LEGENDARY ACTIONS
      </span>
      <span class="font-cinzel text-[10px] text-muted-foreground">
        {{ legendary.legendary_actions_remaining }} / {{ legendary.legendary_action_cap }} remaining
      </span>
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="(action, idx) in getLegendaryActions(legendary.monster_id)"
        :key="idx"
        type="button"
        class="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-300 font-cinzel text-[10px] tracking-wider hover:bg-rose-500/20 hover:border-rose-500/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        :title="action.description"
        :disabled="actionCost(action.name) > (legendary.legendary_actions_remaining ?? 0)"
        @click="fireLegendaryAction(legendary.instance_id, legendary.name, action)"
      >{{ action.name }}<span v-if="actionCost(action.name) > 1" class="ml-1 text-muted-foreground">(×{{ actionCost(action.name) }})</span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";

const store = useEncounterRunStore();
const campaign = useCampaignStore();
const auth = useAuthStore();

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

async function postToChat(message: string, senderName: string) {
  if (!campaign.activeCampaignId || !auth.user?.id) return;
  try {
    await supabase.from("campaign_messages").insert({
      campaign_id: campaign.activeCampaignId,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName,
      message,
      type: "system",
      metadata: null,
    });
  } catch {
    // Chat posting is best-effort from the runner.
  }
}

async function fireLairAction(action: { name: string; description: string }) {
  const owner = store.combatants.find((c) => c.instance_id === store.lairOwnerInstanceId);
  if (!owner) return;
  store.markLairFired();
  await postToChat(`uses Lair Action: ${action.name}`, `⚔ ${owner.name} (lair)`);
}

async function fireLegendaryAction(instanceId: string, name: string, action: { name: string; description: string }) {
  const cost = actionCost(action.name);
  const spent = store.spendLegendaryActions(instanceId, cost);
  if (spent === 0) return;
  await postToChat(`uses legendary action: ${action.name}`, `⚔ ${name}`);
}
</script>
