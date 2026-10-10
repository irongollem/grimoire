<template>
  <section v-if="visible" class="due" aria-label="Condition rolls" data-testid="due-conditions">
    <div
      v-for="item in store.dueConditions"
      :key="`${item.instanceId}:${item.condition.name}:${item.what}`"
      class="due-line"
      :data-testid="`due-${item.what}`"
    >
      <p class="due-text">
        <span class="due-who">{{ item.combatantName }}</span>
        <span class="due-name">{{ item.condition.name }}</span>
        <span class="due-detail">{{ detail(item) }}</span>
      </p>
      <div class="due-actions">
        <template v-if="item.what === 'save'">
          <AppButton
            v-if="canRollSave(item)"
            variant="tinted"
            tone="arcane"
            emphasis="outline"
            size="xs"
            label="Roll"
            :loading="busy === keyOf(item)"
            @click="rollSave(item)"
          />
          <AppButton variant="tinted" tone="success" emphasis="outline" size="xs" label="Passed" @click="settleSave(item, true)" />
          <AppButton variant="tinted" tone="danger" emphasis="outline" size="xs" label="Failed" @click="settleSave(item, false)" />
        </template>
        <template v-else>
          <AppButton
            variant="tinted"
            tone="arcane"
            emphasis="outline"
            size="xs"
            label="Roll"
            :loading="busy === keyOf(item)"
            @click="rollOngoing(item)"
          />
          <AppButton variant="ghost" size="xs" label="Skip" @click="store.settleOngoingDamage(item.instanceId, item.condition.name)" />
        </template>
      </div>
    </div>

    <RunnerAppliedLine
      v-for="r in results"
      :key="r.key"
      :name="r.damage.target.name"
      :damage="r.damage"
      :can-roll-concentration="false"
    />

    <div v-for="check in store.concentrationChecks" :key="check.key" class="due-line" data-testid="due-concentration">
      <p class="due-text">
        <span class="due-who">{{ nameOf(check.instanceId) }}</span>
        <span class="due-name">Concentration</span>
        <span class="due-detail">{{ spellsOf(check.instanceId) }} · DC {{ concentrationDc(check.damage, ruleset) }}</span>
      </p>
      <div class="due-actions">
        <AppButton
          v-if="canRollConcentration(check.instanceId)"
          variant="tinted"
          tone="arcane"
          emphasis="outline"
          size="xs"
          label="Roll"
          :loading="busy === check.key"
          @click="rollConcentration(check)"
        />
        <AppButton variant="tinted" tone="success" emphasis="outline" size="xs" label="Kept" @click="store.resolveConcentrationCheck(check.key, true)" />
        <AppButton variant="tinted" tone="danger" emphasis="outline" size="xs" label="Lost" @click="store.resolveConcentrationCheck(check.key, false)" />
      </div>
    </div>
    <p v-for="n in notes" :key="n.key" class="due-note" data-testid="due-note">{{ n.text }}</p>
    <p v-for="e in store.lastConditionEvents" :key="`${e.instanceId}:${e.name}:${e.reason}`" class="due-note" data-testid="condition-ended">
      {{ endedText(e) }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import RunnerAppliedLine from "@/components/encounters/RunnerAppliedLine.vue";
import { useActionResolution, type DamageApplied } from "@/composables/encounters/useActionResolution";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useParty } from "@/composables/party/useParty";
import { useConcentration } from "@/composables/party/useConcentration";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { heldConcentrationSpells } from "@/lib/encounters/conditionSources";
import { concentrationDc } from "@/rules/combat/concentration";
import type { ConditionEndReason } from "@/rules/conditionDurations";
import { describeOngoing } from "@/rules/conditionLabels";
import { applyDamage as applyToPools, formHpPools } from "@/rules/hitPoints";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { AppliedCondition } from "@/types/condition.types";

/**
 * The rolls the turn hooks left to the DM (#1018): a repeat save owed by a
 * "save ends" condition, ongoing damage owed at a turn edge, and a quiet line
 * for each condition that ended on its own. It mounts under the runner's top
 * bar and shows nothing while nothing is owed or ended.
 */
type DueItem = {
  instanceId: string;
  combatantName: string;
  condition: AppliedCondition;
  what: "save" | "damage";
};
type Ended = { instanceId: string; name: string; reason: ConditionEndReason };

const store = useEncounterRunStore();
const { data: companions } = useCompanions();
const { data: partyList } = useParty();
const { rollConcentrationSave, endConcentration } = useConcentration();
const resolution = useActionResolution({ companions: () => (companions.value ? companions.value : []) });

/** Damage taken from ongoing effects. */
const results = ref<Array<{ key: string; damage: DamageApplied }>>([]);
const { ruleset } = useTableRuleset();
const notes = ref<Array<{ key: string; text: string }>>([]);
const busy = ref<string | null>(null);
let noteSeq = 0;

const visible = computed(
  () =>
    store.dueConditions.length > 0 ||
    store.concentrationChecks.length > 0 ||
    store.lastConditionEvents.length > 0 ||
    results.value.length > 0 ||
    notes.value.length > 0,
);

// What was settled belongs to the turn it was settled in.
watch(
  () => [store.round, store.activeIndex],
  () => {
    results.value = [];
    notes.value = [];
  },
);

const keyOf = (item: DueItem) => `${item.instanceId}:${item.condition.name}:${item.what}`;

function combatantOf(instanceId: string): RunCombatant | undefined {
  return store.combatants.find((c) => c.instance_id === instanceId);
}

function detail(item: DueItem): string {
  const { ends, ongoing } = item.condition;
  if (item.what === "save" && ends?.kind === "save") return `${ends.ability.toUpperCase()} ${ends.dc}`;
  if (item.what === "damage" && ongoing) return describeOngoing(ongoing).replace(" of each turn", "");
  return "";
}

function addNote(text: string) {
  noteSeq += 1;
  notes.value = [...notes.value, { key: `note-${noteSeq}`, text }];
}

/** A stat block to roll for; a party member's player rolls at the table. */
function canRollSave(item: DueItem): boolean {
  const { ends } = item.condition;
  const target = combatantOf(item.instanceId);
  return !!target && ends?.kind === "save" && resolution.saveBonusFor(target, ends.ability) !== null;
}

function settleSave(item: DueItem, success: boolean) {
  store.resolveConditionSave(item.instanceId, item.condition.name, success);
}

async function rollSave(item: DueItem) {
  const { ends } = item.condition;
  const target = combatantOf(item.instanceId);
  if (!target || ends?.kind !== "save") return;
  busy.value = keyOf(item);
  try {
    const out = await resolution.rollConditionSave({
      target,
      ability: ends.ability,
      dc: ends.dc,
      label: `${item.condition.name}: ${ends.ability.toUpperCase()} save (DC ${ends.dc})`,
      silent: true,
    });
    if (!out) return;
    addNote(
      out.total === null
        ? `${item.combatantName} automatically fails the ${item.condition.name} save.`
        : `${item.combatantName} rolls ${out.total} against DC ${ends.dc}: ${out.success ? "saved" : "still affected"}.`,
    );
    store.resolveConditionSave(item.instanceId, item.condition.name, out.success);
  } finally {
    busy.value = null;
  }
}

async function rollOngoing(item: DueItem) {
  const { ongoing } = item.condition;
  const target = combatantOf(item.instanceId);
  if (!target || !ongoing) return;
  busy.value = keyOf(item);
  try {
    const parts = await resolution.rollDamage({
      parts: [{ dice: ongoing.dice, type: ongoing.type }],
      critical: false,
      label: `${item.condition.name} on ${item.combatantName}`,
      silent: true,
    });
    if (!parts) return;
    // Read before the damage lands: whether it reaches the character's own HP decides the concentration rule.
    const member = target.party_member_id ? (partyList.value?.find((m) => m.id === target.party_member_id) ?? null) : null;
    const damage = resolution.applyDamage({ target, parts, defenses: resolution.defensesFor(target) });
    store.settleOngoingDamage(item.instanceId, item.condition.name);
    noteSeq += 1;
    results.value = [...results.value, { key: `dmg-${noteSeq}`, damage }];
    if (member?.concentration && damage.total > 0) {
      const realHpAfter = applyToPools(formHpPools(member, member.wildshape_state), damage.total).current_hp;
      if (realHpAfter === 0) await endConcentration(member, { reason: "dropped to 0 HP" });
      else await rollConcentrationSave(member, damage.total);
    }
  } finally {
    busy.value = null;
  }
}

const nameOf = (instanceId: string) => combatantOf(instanceId)?.name ?? "a removed combatant";
const spellsOf = (instanceId: string) => heldConcentrationSpells(store.combatants, instanceId).join(", ");

function canRollConcentration(instanceId: string): boolean {
  const target = combatantOf(instanceId);
  return !!target && resolution.saveBonusFor(target, "con") !== null;
}

async function rollConcentration(check: { key: string; instanceId: string; damage: number }) {
  const target = combatantOf(check.instanceId);
  if (!target) return;
  busy.value = check.key;
  try {
    const out = await resolution.rollConcentration({ target, damage: check.damage, silent: true });
    if (!out) return;
    addNote(`${target.name} rolls ${out.total} against DC ${out.dc}: concentration ${out.maintained ? "kept" : "lost"}.`);
    store.resolveConcentrationCheck(check.key, out.maintained);
  } finally {
    busy.value = null;
  }
}

const END_REASONS: Record<Ended["reason"], string> = {
  expired: "ran out",
  saved: "saved",
  concentration: "concentration ended",
  source_down: "its source went down",
  source_removed: "its source left the fight",
};

function endedText(e: Ended): string {
  const who = combatantOf(e.instanceId)?.name ?? "a removed combatant";
  return `${e.name} ended on ${who} (${END_REASONS[e.reason]}).`;
}
</script>

<style scoped>
@reference "@/assets/main.css";

.due {
  @apply flex flex-col gap-1 border-b border-border bg-tone-caution/5 px-3 py-2;
}

.due-line {
  @apply flex flex-wrap items-center justify-between gap-x-3 gap-y-1;
}

.due-text {
  @apply flex flex-wrap items-baseline gap-x-1.5 text-body text-foreground;
}
.due-who { @apply font-semibold; }
.due-name { @apply text-ink-caution font-semibold; }
.due-detail { @apply text-caption text-muted-foreground; }

.due-actions {
  @apply flex items-center gap-1;
}

.due-note {
  @apply text-caption text-muted-foreground;
}
</style>
