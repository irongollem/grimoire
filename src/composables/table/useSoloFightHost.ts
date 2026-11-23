import type { RunCombatant } from "@/types/encounter.types";
import { afterFoeSpoke, foeMoment, FOE_NEVER_SEEN, NO_FOE_TALK, type FoeMoment, type FoeSeen, type FoeTalk } from "@/lib/table/solo/fight/foeLine";
import { computed, ref, watch, type Ref } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useFightCommands, type TurnRun } from "@/composables/encounters/useFightCommands";
import { useCreatureTurns } from "@/composables/encounters/useCreatureTurns";
import { useToast } from "@/composables/useToast";
import { linesOfAttacks, linesOfCreatureTurn, linesOfReaction, type BoardLine } from "@/lib/table/solo/fight/boardLines";
import { canReact } from "@/lib/table/solo/fight/turnBudget";
import { helperTakesTurn, NEVER_SEEN, type HelperSeen } from "@/lib/table/solo/fight/helperTurn";
import { fightStanding, hasSomeoneToFight, type FightStanding } from "@/lib/table/solo/fight/fightOver";
import { asThePlayerSees } from "@/lib/table/solo/fight/foeView";
import { turnBudgetOf } from "@/lib/table/solo/fight/turnBudget";
import type { FightChange } from "@/lib/table/solo/fight/fightChange";
import type { ReactionAnswer, ReactionOffer } from "@/rules/fight/reactionOffer";
import { initiativeRoll } from "@/rules/initiative";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { isRetryable } from "@/lib/encounters/fightWire";

/** How a fight at the table ended: by itself (nobody left to fight), or by the Dungeon Master's ruling. */
export type SoloFightEnd = "foes_out" | "you_fell" | NonNullable<FightChange["ends"]>;

/**
 * The person's answer to a Reaction did not reach the fight and will not on a retry (the server refused it: the offer was already answered,
 * the fight ended). The server may still hold the reaction, so the creature's turn is NOT finished: the caller must not pass it.
 * Its message is the server's own sentence.
 */
export class ReactionAnswerFailed extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "The answer to your reaction was not accepted.", { cause });
    this.name = "ReactionAnswerFailed";
  }
}

/**
 * Plays a creature's turn to its end while the person answers the Reactions it offers (#1021). A reply that carries an offer
 * is a paused turn: the person is asked, the answer is sent, and what comes back is read the same way (a second chance in
 * the same turn), until a reply has none. Returns that last reply, or null when the offer is for someone the person does not
 * play (the server never sends one; the turn is left as nothing rather than asked of the wrong person).
 * An answer that could not be sent for want of a connection leaves the card up and asks again; one the server refused throws
 * `ReactionAnswerFailed`, and the turn is not finished. A failed `start` throws as it is.
 */
export async function playTurnAnswering(input: {
  start: () => Promise<TurnRun>;
  answer: (answer: ReactionAnswer, offerId: string) => Promise<TurnRun>;
  /** The played character's instance id, or null when there is none. */
  playedInstanceId: string | null;
  ask: (offer: ReactionOffer) => Promise<ReactionAnswer>;
  /** The answer has been sent and has come back (or was refused): the card that asked can go. */
  answered: () => void;
  onLines: (lines: BoardLine[]) => void;
  nameOf: (instanceId: string) => string;
}): Promise<TurnRun | null> {
  let run = await input.start();
  while (run.reactionOffered !== null) {
    const offer = run.reactionOffered;
    const offerId = run.reactionOfferId;
    if (offer.reactorId !== input.playedInstanceId) return null;
    if (offerId === null) throw new ReactionAnswerFailed(new Error("The table offered a reaction without saying which one."));
    for (;;) {
      const answer = await input.ask(offer);
      try {
        run = await input.answer(answer, offerId);
      } catch (error) {
        // No connection (or the server failed): the offer is still waiting there, so the same card comes back and the person answers again.
        if (isRetryable(error)) {
          input.onLines([{ kind: "margin", text: "Your answer did not get through. Try again." }]);
          continue;
        }
        input.answered();
        throw new ReactionAnswerFailed(error);
      }
      input.answered();
      input.onLines(linesOfReaction(offer, answer, input.nameOf));
      break;
    }
  }
  return run;
}

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
  /** Whether a helper acts only when something changed for them (`helperActs`); otherwise every round. */
  helpersQuiet?: () => boolean;
  /**
   * A foe that can speak has just had a turn that earns a line (`foeMoment`): the story lets it say one. Settles
   * when it has been said, or at once when it cannot be asked now.
   */
  onFoeLine?: (name: string, moment: FoeMoment) => Promise<void>;
  /** Whether foes speak at all (`useTableFoes`). */
  foesTalk?: () => boolean;
  /**
   * A creature walked out of the played character's reach on its turn: they may strike it with their Reaction.
   * Settles when the player has struck or let it go.
   */
  onProvoked: (moverId: string) => Promise<void>;
  /**
   * A creature's turn is paused at a moment the played character may answer (Shield against a hit, Counterspell against a
   * spell). Settles with the person's choice; the fight waits.
   */
  onReaction: (offer: ReactionOffer) => Promise<ReactionAnswer>;
  /** The server has replied to that answer (or refused it): the card can go. */
  onReactionAnswered: () => void;
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

  // What each foe last saw of the fight, and who has spoken when: a foe's line is a turn of the story, so it is
  // kept to the moments that earn one (`foeLine.ts`).
  const foesSeen = new Map<string, FoeSeen>();
  let foeTalk: FoeTalk = NO_FOE_TALK;
  const standingWith = (c: RunCombatant): number => store.combatants.filter((o) => o.faction_id === c.faction_id && o.instance_id !== c.instance_id && o.hp > 0).length;
  // Every defence anyone in the fight has shown so far: one more after a foe's turn is a lesson it just learned.
  const defencesShown = (): number => store.combatants.reduce((n, c) => n + Object.keys(c.shown_defenses ?? {}).length, 0);

  // What each helper last saw of the fight, and how many lines the player has said aloud in it.
  const helpersSeen = new Map<string, HelperSeen>();
  const said = ref(0);

  // ── The creatures' turns, written into the story ───────────────────────────────────────────────────────────────
  useCreatureTurns({
    memberId: () => (mine.value ? options.memberId() : null),
    // An ally who is down still has a turn: the server rolls their death save through the same takeTurn.
    downTakesTurn: (now) => now.type === "player" && now.party_member_id !== undefined && now.party_member_id !== null && now.party_member_id !== options.memberId(),
    started: () => store.started,
    active: () => store.activeCombatant,
    turnKey: () => `${store.round}:${store.activeCombatant?.instance_id}`,
    run: async (instanceId) => {
      const helper = store.combatants.find((c) => c.instance_id === instanceId && c.bystander === true);
      if (helper) {
        // Their turn is their own: nothing is sent to the rules, and the story tells the one thing they do. Every
        // round, unless the player chose the quiet way: then only when there is something new for them to act on
        // (`helperActs`), and otherwise the moment passes in silence.
        const me = played.value;
        const now = { hp: helper.hp, playedDown: me !== null && me.hp <= 0, said: said.value };
        const last = helpersSeen.get(instanceId);
        helpersSeen.set(instanceId, now);
        const quiet = options.helpersQuiet !== undefined && options.helpersQuiet();
        if (helperTakesTurn(quiet, now, last === undefined ? NEVER_SEEN : last)) await options.onHelperTurn(helper.name);
        return true;
      }
      // A creature with nobody left standing to fight has nothing to do: its turn passes without a word. Seen in
      // play: with the played character down, every round wrote "has no turn to take" once per creature.
      const mover = store.combatants.find((c) => c.instance_id === instanceId);
      if (mover && mover.hp > 0 && !hasSomeoneToFight(mover, store.combatants, store.factions)) return true;
      try {
        const before = { playedHp: played.value === null ? null : played.value.hp, defences: defencesShown() };
        const memberId = mine.value ? options.memberId() : undefined;
        const result = await playTurnAnswering({
          start: () => fight.takeTurn(instanceId, memberId),
          answer: (a, offerId) => fight.answerReaction(a, offerId),
          playedInstanceId: played.value === null ? null : played.value.instance_id,
          ask: options.onReaction,
          answered: options.onReactionAnswered,
          onLines: options.onLines,
          nameOf,
        });
        if (result === null) return true;
        const { turn, outcomes, provokedPlayer } = result;
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
        // It walked out of the played character's reach: the fight waits while they strike or let it go. Only
        // while they can: a Reaction already used, or a character who is down or cannot act, has no strike to offer.
        const me2 = played.value;
        if (me2 && provokedPlayer.some((p) => p.playerId === me2.instance_id && p.moverId === instanceId) && canReact(me2)) {
          await options.onProvoked(instanceId);
        }
        // A foe with a mind and a tongue says a line when its turn earned one. What it saw is noted every turn,
        // spoken or not, so "since its last turn" means that.
        const after = store.combatants.find((c) => c.instance_id === instanceId);
        // Foes only: an ally the server plays never gets a foe line.
        if (after !== undefined && after.type !== "player" && after.hp > 0 && turn.leftTheMap !== true) {
          const last = foesSeen.get(instanceId);
          const allies = standingWith(after);
          foesSeen.set(instanceId, { hp: after.hp, alliesStanding: allies });
          const me3 = played.value;
          const moment =
            options.onFoeLine === undefined
              ? null
              : foeMoment(
                  {
                    instanceId,
                    speaks: turn.speaks === true,
                    round: store.round,
                    hp: after.hp,
                    maxHp: after.max_hp,
                    alliesStanding: allies,
                    played: me3 === null || before.playedHp === null ? null : { hpBefore: before.playedHp, hpAfter: me3.hp, maxHp: me3.max_hp },
                    defencesShown: { before: before.defences, after: defencesShown() },
                  },
                  last === undefined ? FOE_NEVER_SEEN : last,
                  foeTalk,
                  options.foesTalk === undefined || options.foesTalk(),
                );
          if (moment !== null) {
            foeTalk = afterFoeSpoke(foeTalk, instanceId, store.round);
            await options.onFoeLine?.(after.name, moment);
          }
        }
        return true;
      } catch (error) {
        if (error instanceof ReactionAnswerFailed) {
          // The server may still hold the reaction: the creature's turn is not finished, so it is not passed (a reload offers the waiting reaction again).
          options.onLines([{ kind: "margin", text: toast.fromError(error, "Your answer to the reaction was not accepted.") }]);
          return false;
        }
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
      fight.releaseFight();
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

  /**
   * The played character is about to walk `path` (the squares from where they stand to where they are going): the
   * creatures whose reach they leave strike first, on the server. Answers whether they are still on their feet to
   * make the walk. Before the first round nothing strikes.
   */
  async function leaveReach(path: ReadonlyArray<{ x: number; y: number }>): Promise<boolean> {
    const me = played.value;
    if (!me || !store.started || path.length < 2) return true;
    const { outcomes } = await fight.provoke(me.instance_id, [...path]);
    const now = played.value;
    if (outcomes.length > 0) {
      options.onLines(linesOfAttacks(outcomes, { nameOf, playedInstanceId: me.instance_id, playedHp: now ? { hp: now.hp, maxHp: now.max_hp } : null, turnOf: null }));
    }
    return now !== null && now.hp > 0;
  }

  /** The turn's one short line aloud has been said. */
  function spendWords(): void {
    said.value += 1;
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
    leaveReach,
    spendSmallThing,
    finish,
    standing,
  };
}
