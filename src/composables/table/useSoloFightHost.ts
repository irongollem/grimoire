import { computed, ref, watch, type Ref } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useFightCommands } from "@/composables/encounters/useFightCommands";
import { useSoloCreatureTurns } from "@/composables/table/useSoloCreatureTurns";
import { useToast } from "@/composables/useToast";
import { linesOfCreatureTurn, type BoardLine } from "@/lib/table/fight/boardLines";
import { fightStanding, type FightStanding } from "@/lib/table/fight/fightOver";
import { asThePlayerSees } from "@/lib/table/fight/foeView";
import { turnBudgetOf } from "@/lib/table/fight/turnBudget";
import type { FightChange } from "@/lib/table/fight/fightChange";
import { initiativeRoll } from "@/rules/initiative";
import { useTableRuleset } from "@/composables/rules/useRuleset";

/** How a fight at the table ended: by itself (nobody left to fight), or by the Dungeon Master's ruling. */
export type SoloFightEnd = "foes_out" | "you_fell" | NonNullable<FightChange["ends"]>;

/**
 * The fight at the AI table, run from the table screen (#1021, Solo Table canvas, frames 12 to 16).
 *
 * Nobody sits in the Dungeon Master's chair, so this holds everything a Dungeon Master's hands would do, by the
 * game's own rules and nothing else, for a fight that is already open (`SoloFightStage` opens it, with the played
 * character alone, and only then mounts what calls this: the fight's commands must not reach the server before the
 * fight exists there). It asks for the one roll that
 * is the player's (initiative) and starts when it is in, has every creature take its own turn and writes what it
 * did into the story, and ends the fight when nobody is left to fight. What the player may do on their own turn is
 * the page's (the turn controls and the composer); this only says whose turn it is and what the turn still holds.
 *
 * One fight at a time: the fight's state is the app's one run store, the same the Dungeon Master's fight screen
 * reads, so the two are never mounted on different fights at once.
 */
export function useSoloFightHost(options: {
  encounterId: Ref<string>;
  /** The party member the player plays. */
  memberId: () => string;
  /** What happened on the board, as story lines, the moment it happened. */
  onLines: (lines: BoardLine[]) => void;
  /** The fight ended by itself and has been closed; the story takes over. */
  onOver: (how: SoloFightEnd) => void;
  /**
   * It is the turn of someone with the party whom the rules cannot play (no stat block): the story decides the one
   * thing they do. Settles when that has been told, or at once when it cannot be asked now.
   */
  onHelperTurn: (name: string) => Promise<void>;
  /** The fight could not go on (it was ended elsewhere, or the server refused): the page lets go of it. */
  onLost: () => void;
}) {
  const store = useEncounterRunStore();
  const toast = useToast();
  const { ruleset } = useTableRuleset();
  watch(ruleset, (r) => store.setRuleset(r), { immediate: true });

  const fight = useFightCommands(options.encounterId, { onLost: options.onLost });

  // Only this fight: the store holds one fight at a time, and it must be the one this page is on.
  const mine = computed(() => store.encounterId === options.encounterId.value);
  const played = computed(() => (mine.value ? (store.combatants.find((c) => c.party_member_id === options.memberId()) ?? null) : null));
  const nameOf = (instanceId: string): string => store.combatants.find((c) => c.instance_id === instanceId)?.name ?? "Someone";

  // A creature stays hidden on a Dungeon Master's screen until they reveal it. Here nobody will: what the played
  // character can see is decided by their sight on the map, so everyone in the fight is revealed as it opens (and
  // whoever joins later), and the map still shows only the tokens in view.
  watch(
    () => (mine.value ? store.combatants.filter((c) => c.type !== "player" && c.reveal_state !== undefined && c.reveal_state !== "revealed").map((c) => c.instance_id) : []),
    (unrevealed) => {
      for (const id of unrevealed) store.setRevealState(id, "revealed");
    },
    { immediate: true },
  );

  // ── Initiative: the player's roll, then everyone else's, then the fight ───────────────────────────────────────
  const initiative = computed(() => (played.value ? initiativeRoll(played.value, ruleset.value) : null));
  const asksInitiative = computed(() => mine.value && !store.started && played.value !== null && played.value.initiative === null);

  function rollInitiative(total: number): void {
    const me = played.value;
    if (!me || store.started) return;
    store.setInitiative(me.instance_id, total);
  }

  watch(
    () => mine.value && !store.started && played.value !== null && played.value.initiative !== null,
    (ready) => {
      // No prompting roller is set here, so everyone still unrolled gets the server-side kind of roll: a plain d20.
      if (ready && !store.rollingInitiative) void store.startCombat();
    },
    { immediate: true },
  );

  // ── The creatures' turns, written into the story ───────────────────────────────────────────────────────────────
  useSoloCreatureTurns({
    memberId: () => (mine.value ? options.memberId() : null),
    started: () => store.started,
    active: () => store.activeCombatant,
    turnKey: () => `${store.round}:${store.activeCombatant?.instance_id}`,
    run: async (instanceId) => {
      const helper = store.combatants.find((c) => c.instance_id === instanceId && c.bystander === true);
      if (helper) {
        // Their turn is their own: nothing is sent to the rules, and the turn passes when the story has told it.
        await options.onHelperTurn(helper.name);
        return true;
      }
      try {
        const { turn, outcomes } = await fight.takeTurn(instanceId);
        if (turn === null) return true;
        const mover = store.combatants.find((c) => c.instance_id === instanceId);
        const me = played.value;
        options.onLines(
          linesOfCreatureTurn({
            turn,
            outcomes,
            nameOf,
            // The fight has no field for the distance; what the creature has moved this turn is on its row once
            // the answer is in. A creature that left the map is gone from the roster, and its line says so instead.
            feetMoved: mover?.movement_used === undefined ? 0 : mover.movement_used,
            playedInstanceId: me ? me.instance_id : "",
            playedHp: me ? { hp: me.hp, maxHp: me.max_hp } : null,
          }),
        );
        return true;
      } catch (error) {
        // The server's own sentence says why (nothing it can do: its only foe is down; no stat block). The creature
        // passes its turn. Seen live: with the played character at 0 hit points a hound had nobody to attack, its
        // turn was left standing, and the fight never reached the player's death save. Nobody sits in the Dungeon
        // Master's chair to move a stalled turn on, so a turn that cannot be run is a turn passed.
        options.onLines([{ kind: "margin", text: toast.fromError(error, `${nameOf(instanceId)} could not take its turn.`) }]);
        return true;
      }
    },
    next: () => store.nextTurn(),
  });

  // ── Your turn ──────────────────────────────────────────────────────────────────────────────────────────────────
  const yourTurn = computed(() => store.started && played.value !== null && store.activeCombatant?.instance_id === played.value.instance_id);
  // "A few words" and "one small thing" are the turn's own and nobody else keeps them: they start again each turn.
  const spent = ref({ words: false, smallThing: false });
  watch(
    () => `${store.round}:${store.activeCombatant?.instance_id}`,
    () => {
      spent.value = { words: false, smallThing: false };
      if (yourTurn.value) options.onLines([{ kind: "margin", text: `Round ${store.round} · your turn` }]);
    },
  );
  const budget = computed(() => (played.value ? turnBudgetOf(played.value, spent.value) : null));

  function endTurn(): void {
    if (!yourTurn.value) return;
    // A character who is down has nothing to end: their death save was the turn.
    if (played.value && played.value.hp > 0) options.onLines([{ kind: "margin", text: `${played.value.name} ends their turn` }]);
    store.nextTurn();
  }

  // ── What the player sees, and the end ──────────────────────────────────────────────────────────────────────────
  const seen = computed(() => (played.value ? asThePlayerSees(store.sortedCombatants, played.value.instance_id, store.factions) : []));
  const standing = computed<FightStanding>(() =>
    played.value && store.started ? fightStanding(store.combatants, store.factions, played.value.instance_id) : "ongoing",
  );
  const ending = ref(false);

  /** Closes the fight on the server and lets go of it here. */
  async function finish(how: SoloFightEnd): Promise<void> {
    if (ending.value) return;
    ending.value = true;
    try {
      await fight.lifecycle({ type: "end_combat" });
      store.reset();
      options.onOver(how);
    } catch (error) {
      toast.error(toast.fromError(error, "Couldn't end the fight."));
    } finally {
      ending.value = false;
    }
  }

  watch(standing, (now) => {
    // Going down is not the end: death saves are the player's turn (frame 16), so only an empty field closes it here.
    if (now === "foes_out") void finish("foes_out");
  });

  /** The turn's one short line aloud has been said. */
  function spendWords(): void {
    spent.value = { ...spent.value, words: true };
  }

  /** The turn's one free interaction with an object (drawing a weapon) has been used. */
  function spendSmallThing(): void {
    spent.value = { ...spent.value, smallThing: true };
  }

  return {
    /** The store holds this fight. */
    opened: mine,
    encounterName: computed(() => store.encounterName),
    round: computed(() => store.round),
    started: computed(() => store.started),
    played,
    seen,
    activeInstanceId: computed(() => store.activeCombatant?.instance_id ?? null),
    asksInitiative,
    initiative,
    rollInitiative,
    rollingInitiative: computed(() => store.rollingInitiative),
    yourTurn,
    budget,
    spent,
    endTurn,
    spendWords,
    spendSmallThing,
    finish,
    standing,
  };
}
