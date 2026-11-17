<template>
  <!-- The fight at the table (Solo Table canvas, frames 12 to 16). It has no place of its own on the page: its three
       parts go where the table screen keeps room for them. The map sits above the story, the turn's controls take
       the top of the sheet column, and the scene column becomes the fight's own. Nothing here is the Dungeon
       Master's: no fog brush, no stat blocks, no "End fight". -->
  <Teleport defer :to="`#${slots.map}`">
    <div class="relative size-full">
      <div v-if="!host.opened.value || !played" class="flex size-full items-center justify-center" role="status">
        <BannerLoader class="h-8" />
      </div>
      <template v-else>
        <SoloFightMap
          :encounter-id="encounterId"
          :played-instance-id="played.instance_id"
          :can-move="host.yourTurn.value && !busy"
          :speed-feet="speedFeet"
          :moved-feet="movedFeet"
          :dash-feet="dashFeet"
          :arming="attack.state.value.step === 'aiming'"
          @moved="onMoved"
          @target="onTarget"
        />
        <!-- "The initiative card lies over the map so it cannot be missed, and it is the same card as any other roll
             of yours." (frame 12) -->
        <div v-if="host.asksInitiative.value && host.initiative.value" class="absolute inset-0 flex items-center justify-center bg-background/40 p-4">
          <SoloRollAsk
            class="w-full max-w-md shadow-lg"
            :ask="{ label: 'Roll for initiative', kind: 'check', ability: 'dex', skill: null }"
            :bonus="host.initiative.value.modifier"
            :forced-disadvantage="host.initiative.value.disadvantage"
            :busy="host.rollingInitiative.value"
            @roll="onInitiative"
          />
        </div>
      </template>
    </div>
  </Teleport>

  <Teleport defer :to="`#${slots.turn}`">
    <SoloDeathSave
      v-if="host.yourTurn.value && played && played.hp <= 0"
      :round="host.round.value"
      :successes="member.death_save_successes"
      :failures="member.death_save_failures"
      :busy="resolving"
      @rolled="onDeathSave"
    />
    <SoloTurn
      v-else-if="host.yourTurn.value && played && host.budget.value"
      :member="member"
      :round="host.round.value"
      :hp="{ hp: played.hp, maxHp: played.max_hp }"
      :speed-feet="speedFeet"
      :moved-feet="movedFeet"
      :budget="host.budget.value"
      :armed-key="armedKey"
      :busy="busy"
      @attack="(row) => attack.aim(row)"
      @cancel-attack="attack.cancel()"
      @act="onAct"
      @draw="onDraw"
      @end="host.endTurn()"
    />
  </Teleport>

  <Teleport defer :to="`#${slots.roster}`">
    <SoloFightRoster
      :name="host.encounterName.value"
      :started="host.started.value"
      :round="host.round.value"
      :seen="host.seen.value"
      :active-instance-id="host.activeInstanceId.value"
    />
  </Teleport>

  <!-- Your attack's dice, asked where every roll of yours is asked: above the composer (frame 13). -->
  <Teleport defer :to="`#${slots.roll}`">
    <SoloRollAsk
      v-if="attack.state.value.step === 'to_hit'"
      :ask="{ label: `${attack.state.value.row.name}: to hit`, kind: 'check', ability: 'str', skill: null }"
      :bonus="attack.state.value.row.attackBonus"
      :busy="resolving"
      @roll="onToHit"
    />
    <section v-else-if="attack.state.value.step === 'damage'" class="mx-auto mb-2 flex w-full max-w-176 flex-col gap-2 rounded-md border border-border bg-card px-3.5 py-3" aria-label="Your damage" data-testid="solo-damage-ask">
      <span class="text-eyebrow text-primary">{{ attack.state.value.critical ? "A critical hit: your damage" : "A hit: your damage" }}</span>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AppButton variant="primary" size="md" label="Roll it here" :disabled="resolving" @click="onDamage(null)" />
        <template v-if="damagePlan.length > 0">
          <span class="text-caption text-muted-foreground">or I rolled</span>
          <label v-for="(sides, i) in damagePlan" :key="i" class="flex items-center gap-1 text-caption text-muted-foreground">
            <span>d{{ sides }}</span>
            <AppInput v-model.number="typedDamage[i]" type="number" size="md" class="w-14" :aria-label="`The face of die ${i + 1}, a d${sides}`" :disabled="resolving" />
          </label>
          <AppButton variant="outline" size="md" label="Use my roll" :disabled="resolving || !typedDamageOk" @click="onDamage(typedDamage)" />
        </template>
      </div>
      <p v-if="attackError" class="text-caption text-destructive" role="alert">{{ attackError }}</p>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { useDrawWeapon } from "@/composables/table/useDrawWeapon";
import { actOutcome, type ActKind } from "@/lib/table/fight/acts";
import { useSoloAttack } from "@/composables/table/useSoloAttack";
import { useSoloFightHost, type SoloFightEnd } from "@/composables/table/useSoloFightHost";
import { useToast } from "@/composables/useToast";
import type { BoardLine } from "@/lib/table/fight/boardLines";
import type { FightChange, FightTurn } from "@/lib/table/fight/fightChange";
import { attackEntryOf, damageDicePlan } from "@/lib/table/fight/pcAttack";
import type { RollAnswer } from "@/lib/table/soloTypes";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { PartyMember } from "@/types/party.types";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { deathSaveRollOutcome, dyingStatus } from "@/rules/dying";
import SoloDeathSave from "./SoloDeathSave.vue";
import SoloFightMap from "./SoloFightMap.vue";
import SoloFightRoster from "./SoloFightRoster.vue";
import SoloRollAsk from "./SoloRollAsk.vue";
import SoloTurn from "./SoloTurn.vue";

// Mounted by `SoloFightStage` once the fight is open on the server: everything here may send the fight commands.
const { encounterId, member, slots, helperTurn } = defineProps<{
  encounterId: string;
  /** Asks the story for the turn of someone with the party whom the rules cannot play; settles when it has been told. */
  helperTurn: (name: string) => Promise<void>;
  /** The character the player plays. */
  member: PartyMember;
  /** The ids of the four places on the table screen the fight's parts go to. */
  slots: { map: string; turn: string; roster: string; roll: string };
}>();
const emit = defineEmits<{
  /** What happened on the board, for the story. `byServer` is true for what the rules rolled, false for the player's own dice. */
  lines: [lines: BoardLine[], byServer: boolean];
  /** The fight ended by itself. */
  over: [how: SoloFightEnd];
  /** The fight is gone (ended elsewhere, or refused by the server). */
  lost: [];
  /** Whose turn it is and what the player's turn still holds: the composer and the Dungeon Master go by it. */
  turn: [state: FightTurn];
}>();

const store = useEncounterRunStore();
const toast = useToast();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { ruleset } = useTableRuleset();

const host = useSoloFightHost({
  encounterId: computed(() => encounterId),
  memberId: () => member.id,
  onLines: (lines) => emit("lines", lines, true),
  onOver: (how) => emit("over", how),
  onLost: () => emit("lost"),
  onHelperTurn: (name) => helperTurn(name),
});
const played = host.played;

// A Dash doubles what the turn may walk (SRD 5.1 "Dash": extra movement equal to your speed). It lasts the turn.
const dashed = ref(false);
watch(() => `${host.round.value}:${host.activeInstanceId.value}`, () => (dashed.value = false));
const speedFeet = computed(() => member.speed * (dashed.value ? 2 : 1));
// What a Dash would still add: the character's speed, while the Action is unspent and no Dash was taken.
const dashFeet = computed(() => (!dashed.value && played.value && played.value.action_used !== true ? member.speed : 0));
const movedFeet = computed(() => (played.value?.movement_used === undefined ? 0 : played.value.movement_used));

const attack = useSoloAttack({ attackerId: () => (played.value ? played.value.instance_id : ""), ruleset: () => ruleset.value });
const resolving = ref(false);
const attackError = ref<string | null>(null);
const busy = computed(() => resolving.value || attack.state.value.step === "to_hit" || attack.state.value.step === "damage");
const armedKey = computed(() => (attack.state.value.step === "aiming" ? attack.state.value.row.key : null));

// The dice the damage asks for, so a player who rolled at the table has one field per die.
const damagePlan = computed(() => {
  const s = attack.state.value;
  if (s.step !== "damage") return [];
  const entry = attackEntryOf(s.row);
  return entry ? damageDicePlan(entry, s.critical) : [];
});
const typedDamage = ref<number[]>([]);
watch(damagePlan, (plan) => (typedDamage.value = plan.map(() => Number.NaN)));
const typedDamageOk = computed(() =>
  damagePlan.value.length > 0 && damagePlan.value.every((sides, i) => Number.isInteger(typedDamage.value[i]) && typedDamage.value[i] >= 1 && typedDamage.value[i] <= sides),
);

function onInitiative(answer: RollAnswer): void {
  // Advantage keeps the higher die and disadvantage the lower (SRD 5.1 "Advantage and Disadvantage").
  const kept = answer.mode === "disadvantage" ? Math.min(...answer.faces) : Math.max(...answer.faces);
  host.rollInitiative(kept + answer.bonus);
}

function onMoved(feet: number): void {
  if (played.value) emit("lines", [{ kind: "margin", text: `${played.value.name} moves ${feet} feet` }], false);
}

function onTarget(instanceId: string): void {
  try {
    attack.pickTarget(instanceId);
  } catch (error) {
    toast.error(toast.fromError(error, "That cannot be attacked."));
  }
}

async function settle(run: () => Promise<BoardLine[]>): Promise<void> {
  resolving.value = true;
  attackError.value = null;
  try {
    const lines = await run();
    if (lines.length > 0) emit("lines", lines, false);
  } catch (error) {
    attackError.value = toast.fromError(error, "That roll could not be used.");
  } finally {
    resolving.value = false;
  }
}

const onToHit = (answer: RollAnswer) => settle(() => attack.rollToHit({ faces: answer.faces, atTable: answer.atTable, mode: answer.mode }));
const onDamage = (faces: number[] | null) => settle(() => attack.rollDamage(faces === null ? { roll: true } : { faces: [...faces], atTable: true }));

// What the turn holds, told to the page whenever it changes: sent to the Dungeon Master with every message, and
// what the composer opens and closes on.
watch(
  () => {
    const b = host.budget.value;
    return { yours: host.yourTurn.value, action: b?.action === true, bonus: b?.bonus === true, reaction: b?.reaction === true, words: b?.words === true };
  },
  (state) => emit("turn", state),
  { immediate: true, deep: true },
);

/**
 * Carries out what the Dungeon Master's ruling does to the fight (frame 15): what it cost the turn, a condition or
 * damage on a creature, the fight's end. The server checked it against the fight; a name the board no longer has
 * (the creature left meanwhile) is passed over.
 */
function apply(change: FightChange): void {
  const me = played.value;
  if (!me) return;
  const named = (name: string) => store.combatants.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const lines: BoardLine[] = [];
  if (change.costs === "action") store.setActionUsed(me.instance_id, true);
  if (change.costs === "bonus") store.setBonusUsed(me.instance_id, true);
  if (change.costs === "reaction" && me.reactionUsed !== true) store.toggleReaction(me.instance_id);
  if (change.costs !== "nothing") lines.push({ kind: "margin", text: `Your ${{ action: "Action", bonus: "Bonus Action", reaction: "Reaction" }[change.costs]} is spent` });
  if (change.condition) {
    const target = named(change.condition.target);
    if (target) {
      store.applyCondition(target.instance_id, { name: change.condition.name, ends: { kind: "rounds", remaining: change.condition.rounds } });
      lines.push({ kind: "margin", text: `${target.name} is ${change.condition.name} for ${change.condition.rounds === 1 ? "a round" : `${change.condition.rounds} rounds`}` });
    }
  }
  if (change.damage) {
    const target = named(change.damage.target);
    if (target) {
      store.adjustHp(target.instance_id, -change.damage.amount);
      // Drawn as a roll, like every other number that changes the fight: a quiet line was easy to miss, and the
      // narration alone ("it staggers but remains upright") did not say the creature was hurt.
      lines.push({
        kind: "roll",
        die: change.damage.amount,
        label: `${target.name} takes ${change.damage.amount}${change.damage.type ? ` ${change.damage.type}` : ""} damage`,
        detail: "The Dungeon Master's ruling",
        critical: false,
      });
    }
  }
  if (lines.length > 0) emit("lines", lines, true);
  if (change.ends) void host.finish(change.ends);
}

defineExpose({ apply, spendWords: () => host.spendWords() });

/**
 * The death save (SRD 5.1 "Death Saving Throws", through `deathSaveRollOutcome`). The pips are the character's own
 * and live on their sheet, as at any table: the sheet is written and the fight takes it from there. Then the turn
 * is over, unless the die put them back on their feet; three failures or three successes end the fight for them.
 */
async function onDeathSave(face: number, atTable: boolean): Promise<void> {
  const me = played.value;
  if (!me || resolving.value) return;
  resolving.value = true;
  try {
    const out = deathSaveRollOutcome({ successes: member.death_save_successes, failures: member.death_save_failures }, member.conditions, face);
    await updateMember({
      id: member.id,
      update: {
        death_save_successes: out.saves.successes,
        death_save_failures: out.saves.failures,
        conditions: out.conditions,
        ...(out.current_hp === null ? {} : { current_hp: out.current_hp }),
      },
    });
    emit("lines", [{ kind: "roll", die: face, label: `${me.name}'s death save: ${out.label}`, detail: `d20 (${face})${atTable ? " · rolled at the table" : ""}`, critical: face === 20 }], false);
    const status = dyingStatus(out.current_hp === null ? 0 : out.current_hp, out.saves);
    if (status === "dead" || status === "stable") {
      emit("lines", [{ kind: "margin", text: status === "dead" ? `${me.name} dies` : `${me.name} is stable, and out of the fight`, tone: "end" }], false);
      void host.finish("you_fell");
    } else if (status === "dying") host.endTurn();
    // Back up at 1 hit point: the turn goes on, and the controls return once the fight has read the sheet.
  } catch (error) {
    toast.error(toast.fromError(error, "The death save could not be kept. Roll it again."));
  } finally {
    resolving.value = false;
  }
}

const { draw: drawWeapon } = useDrawWeapon(() => member);

/** Drawing a carried weapon spends the turn's one small thing, and only once the inventory has really changed. */
async function onDraw(rowId: string): Promise<void> {
  if (resolving.value || host.budget.value?.smallThing !== true) return;
  resolving.value = true;
  try {
    const line = await drawWeapon(rowId);
    host.spendSmallThing();
    emit("lines", [{ kind: "margin", text: line }], false);
  } catch (error) {
    toast.error(toast.fromError(error, "That weapon could not be drawn."));
  } finally {
    resolving.value = false;
  }
}

/** The four actions the rules name. They spend the Action; what each does besides is `actOutcome`'s. */
function onAct(kind: ActKind): void {
  const me = played.value;
  if (!me || me.action_used === true) return;
  store.setActionUsed(me.instance_id, true);
  const outcome = actOutcome(kind, me.name);
  if (outcome.dashes) dashed.value = true;
  // Dodge and Disengage are conditions the shared rules read: the creatures' attacks and their opportunity attacks.
  if (outcome.stance !== null) store.applyCondition(me.instance_id, outcome.stance);
  emit("lines", [{ kind: "margin", text: outcome.line }], false);
}
</script>
