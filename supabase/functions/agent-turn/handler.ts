// One turn of a conversation with the AI table (#1205): who may run it, what it may cost, the loop, and the save.
//
// No Deno and no Supabase in here. Everything with I/O comes in through `AgentTurnDeps`, so the rules below are
// tested against an in-memory store (`handler.test.ts`) and `index.ts` only wires real dependencies to them.
//
// Two phases, because the HTTP layer must answer a plain JSON status before it opens a stream:
//   `beginTurn`  every gate up to and including moderation and the credit reservation (`admitTurn.ts`). Returns a
//                refusal (a status and a sentence) or a `run` function. Nothing has been streamed yet.
//   `run`        creates the conversation if it is new (`turnSitting.ts`), reads what the turn knows
//                (`turnContext.ts`), runs the loop, saves, charges, and reports on `send` (`keepTurn.ts`).
//                Then, after `done` has gone out, it may fold the older messages into the rolling summary
//                (`_shared/agent/summary.ts`): the player never waits for that, and a failure in it is only logged.
// A caller that gets `run` takes the hold first (`deps.withHold` for `reserve` credits), hands its ids to `run` and `run`
// settles them (`deps.settle`): the hold has to outlast the response, which streams after the request scope has ended.
//
// The shapes, the limits and the fixed sentences live in `turnTypes.ts`; callers import them from there.

import { LISTENING_TEXT } from "../_shared/agent/floor.ts";
import { NARRATOR_SPEAKER } from "../_shared/agent/lineKey.ts";
import { prologueText } from "../_shared/agent/prologue.ts";
import { declinedText, rollText } from "../_shared/agent/playerRoll.ts";
import type { HazardRules } from "../_shared/agent/hazard.ts";
import type { CanonCheckMaterial } from "../_shared/agent/canonCheck.ts";
import { runTurn } from "../_shared/agent/turn.ts";
import { unknownNames, unknownNamesHint } from "../_shared/agent/nameCheck.ts";
import { flaggedForRoll, isJudgedForRoll, lastNarratorText, ROLL_HINT, rollCheckRequest } from "../_shared/agent/rollCheck.ts";
import { makeTurnTools } from "./turnTools.ts";
import { narrationGate, NARRATION_JUDGE_LIMIT_MS, type NarrationGate } from "./narration.ts";
import { AFTERMATH_TEXT, foeLineText, helperTurnText, OPENING_TEXT, playerText } from "./turnBody.ts";
import { safely } from "./turnSupport.ts";
import { AgentProviderError } from "../_shared/agent/types.ts";
import { safeEmit } from "../_shared/agent/conversation/stream.ts";
import { admitTurn } from "./admitTurn.ts";
import { openSitting } from "./turnSitting.ts";
import { readTurnContext } from "./turnContext.ts";
import { keepTurn } from "./keepTurn.ts";
import { discardFiled, newEffects, type TurnScope } from "./turnScope.ts";
import {
  MAX_OUTPUT_TOKENS,
  MAX_STEPS,
  MESSAGES,
  RESERVE_CREDITS,
  TOKEN_BUDGET,
  type AgentEvent,
  type AgentTurnDeps,
  type BegunTurn,
  type Refusal,
} from "./turnTypes.ts";

export async function beginTurn(input: {
  userId: string;
  body: unknown;
  deps: AgentTurnDeps;
}): Promise<BegunTurn> {
  const { userId, deps } = input;
  const admission = await admitTurn(input);
  if (admission.kind === "refused") return admission;
  const { admitted } = admission;
  const { body, campaign, provider, callModel, pendingRoll, scored } = admitted;

  const run = async (send: (event: AgentEvent) => void, signal: AbortSignal | undefined, reservationIds: string[]): Promise<void> => {
    // A listener that throws (a closed stream) must not cost the player the turn that is already paid for.
    const emit = safeEmit(send);
    // Settled whatever the outcome (success, failure, conflict, abort): released once, then the ledger lines written.
    await deps.settle(userId, reservationIds, async (ledger) => {
      const scope: TurnScope = { ...admitted, userId, deps, ledger, emit, signal };
      // Everything the narrator decides this turn is collected here and carried out only once the turn is kept.
      const fx = newEffects();

      let gate: NarrationGate | null = null;
      try {
        const { session, prologue } = await openSitting(scope);
        const ctx = await readTurnContext(scope, session);
        const { character, stored, history, questState, fights, pursuitId, peoples, system, fightTurn, hands, handouts, companions, state, canonHere, inventions } = ctx;
        const fightRunning = fights !== null && fights.fight !== null && fights.fight.phase === "running";
        // The canon's material is read once a turn and shared by the invention check and the narration check. A failed
        // read is forgotten so the next asker may try again.
        let materialLoad: Promise<CanonCheckMaterial> | null = null;
        const loadMaterial = (): Promise<CanonCheckMaterial> => {
          if (materialLoad === null) {
            const load = deps.canon.material(campaign.id);
            materialLoad = load;
            load.catch(() => {
              if (materialLoad === load) materialLoad = null;
            });
          }
          return materialLoad;
        };
        const turnTools = makeTurnTools({
          deps,
          campaignId: campaign.id,
          session,
          stored,
          provider: provider.provider,
          model: provider.model,
          callModel,
          signal,
          onMove: (place) => emit({ type: "scene", scene: place }),
          filed: fx.filed,
          quests: questState === null ? null : { state: questState, queued: fx.queued },
          // A held payoff is fired by the story, not in a round of a fight.
          fireHeld: !fightRunning,
          // A ruling is the story's too: offered only with a character whose invention is waiting, and none is read in a fight (`turnContext.ts`).
          rulings: character === null || inventions.length === 0 ? null : { pending: inventions, onRule: (ruling) => { fx.rulings.push(ruling); } },
          playerName: character ? character.name : undefined,
          playedId: character ? character.id : undefined,
          partyIds: companions.map((c) => c.id),
          peoples,
          canon: {
            here: canonHere,
            lookup: (query) => deps.canon.lookup(campaign.id, query),
            material: loadMaterial,
            judge: deps.judgeCanon,
            onBroughtOut: (brought) => { fx.broughtOut.push(brought); },
          },
          onIntroduce: (intro) => { fx.introduced.push(intro); },
          // Not in a fight on the board: that is fought with what is on it.
          ...(fightRunning ? {} : { onHazard: (hazard: HazardRules) => { fx.madeHazards.push(hazard); } }),
          onExchange: (ended, cutShort) => { fx.lastExchange = { ended, cutShort }; },
          onKeepTalking: () => { fx.narratorKeeps = true; },
          // Each line reaches the page as it is said, so the player can cut in between two of them.
          onSaid: (lines) => { gate?.said(lines); },
          // Something to put in front of the player: only someone played has hands to take a handout.
          show: character
            ? { handouts, picture: (what, id) => deps.loadPicture(campaign.id, what, id), place: (id) => deps.loadPlace(campaign.id, id), onPlace: (place) => { fx.sharedPlaces.push(place); }, onHandout: (handout) => { fx.handedOut.push(handout); } }
            : null,
          // Days that pass in the story move the campaign's date, on the server, once the turn is kept. Not in a fight.
          onDaysPassed: fightRunning ? null : (days) => { fx.daysPassed = days; },
          // How far somewhere is, by the campaign's roads. Not in a fight: nobody sets out on a journey mid-round.
          travel: fightRunning ? null : { map: () => deps.loadTravelMap(campaign.id, campaign.game_system), roll: deps.rollDie },
          // Not in a fight: a turn there is six seconds, and what it holds is the board's.
          hands: character && hands !== null && !fightRunning
            ? { memberId: character.id, ...hands, store: deps.hands, onChange: (change) => { fx.handed.push(change); } }
            : null,
          // Outside a fight only: in one the board keeps everyone's hit points.
          hitPoints: character && !fightRunning
            ? { now: character.hitPoints, onChange: (change) => { fx.hitPointChange = change; } }
            : null,
          correcting: body.mode === "correct",
          // Offered only while a fight is being fought on the board.
          fightChange: fightRunning
            ? { fight: fights.fight!, budget: fightTurn, rolled: scored === null ? null : scored.success, onChange: (change) => { fx.fightChange = change; } }
            : null,
          // Only a played character has a sheet to roll from; without one the narrator rolls as before.
          askRoll: character ? (pending) => { fx.asked = pending; } : null,
          // A fight needs someone to fight it: offered only with a played character and readable fights.
          fight: character && fights !== null
            ? {
              view: fights,
              viewAt: (locationId) => deps.loadFights(campaign.id, locationId, session.fight_encounter_id, pursuitId),
              onStart: (plan) => { fx.fightPlan = plan; },
              statless: (plan) => deps.statlessFighters(campaign.id, plan),
            }
            : null,
        });

        const sessionId = session.id;
        // The player's own words, when said aloud, can be heard in their character's voice.
        if (deps.voiceKey !== null && character && body.mode === "say" && body.message.trim() !== "") {
          const text = body.message.trim();
          emit({ type: "voice", role: "player", text, voice: deps.voiceKey(sessionId, { role: "player", speaker: { id: character.id, name: character.name }, text }) });
        }
        // Whether this attempt needs a roll is asked while the secrets load below, and awaited just before the turn:
        // the narrator reads the answer, so it cannot run later, but it need not add its own wait.
        const judgedForRoll = isJudgedForRoll({
          mode: body.mode,
          message: body.message,
          answersRoll: scored !== null || pendingRoll !== null,
          fightRunning,
        });
        const rollNeed: Promise<number | null> = judgedForRoll
          ? flaggedForRoll({
            judge: deps.judgeNarration,
            request: rollCheckRequest({ mode: body.mode, message: body.message, scene: lastNarratorText(history) }),
            limitMs: NARRATION_JUDGE_LIMIT_MS,
          })
          : Promise.resolve(null);
        // A name last turn's narration used that the campaign has no record of (#1021): found while the secrets load, in
        // code and then by the judge, under the same limit, and never in a fight, whose names the fight holds.
        const unknown: Promise<string[]> = fightRunning
          ? Promise.resolve([])
          : unknownNames({
            narration: lastNarratorText(history),
            known: (candidates) => deps.knownNames(campaign.id, candidates),
            judge: deps.judgeNarration,
            limitMs: NARRATION_JUDGE_LIMIT_MS,
          });
        // The narration check needs the secrets before the first word streams; with no judge it asks for none.
        let secrets: readonly string[] = [];
        if (deps.judgeNarration !== null) {
          try {
            secrets = (await loadMaterial()).secrets.map((s) => s.statement);
          } catch (error) {
            console.error("agent-turn: the narration check ran without the campaign's secrets (the canon could not be read).", error);
          }
        }
        const narration = narrationGate({
          judge: deps.judgeNarration,
          secrets,
          onNarration: (text) => {
            if (deps.voiceKey !== null) emit({ type: "voice", role: "narrator", text, voice: deps.voiceKey(sessionId, { role: "narrator", speaker: NARRATOR_SPEAKER, text }) });
          },
          // A line that is being shown gets a key: what a character said in their own voice, what they did in the narrator's.
          emit: (event) =>
            emit(
              event.type !== "line" || deps.voiceKey === null
                ? event
                : event.line.kind === "spoken"
                  ? { ...event, voice: deps.voiceKey(sessionId, event.line) }
                  // What a character does is told, not said: it is the narrator's to read aloud.
                  : { ...event, voice: deps.voiceKey(sessionId, { role: "narrator", speaker: NARRATOR_SPEAKER, text: event.line.text }) },
            ),
        });
        gate = narration;
        const helperAsked = body.helperTurn;
        const helper = helperAsked === undefined || !fightRunning
          ? undefined
          : fights.fight!.fighters.find((f) => f.side === "other" && f.hp > 0 && f.name === helperAsked.name);
        // A foe's line: only for a living enemy the running fight really holds, named as the fight names it.
        const foeAsked = body.foeLine;
        const foe = foeAsked === undefined || !fightRunning
          ? undefined
          : fights.fight!.fighters.find((f) => f.side === "enemy" && f.hp > 0 && f.name === foeAsked.name);
        const rollFlagged = await rollNeed;
        const unnamed = await unknown;
        // A count, never the names: they are the story's own text.
        if (unnamed.length > 0) console.warn(`agent-turn: the narration named ${unnamed.length} character(s) or place(s) the campaign has no record of.`);
        const hints = [rollFlagged === null ? null : ROLL_HINT, unnamed.length === 0 ? null : unknownNamesHint(unnamed)].filter((h): h is string => h !== null);
        const result = await runTurn({
          system,
          // A hint, not a ruling: the narrator may still decide no roll is needed.
          state: hints.length === 0 ? state : `${state}\n\n${hints.join("\n\n")}`,
          history,
          // The roll (or that it was not made) comes first, then the player's own words when there are any.
          user: [
            scored !== null && pendingRoll !== null ? rollText(pendingRoll, scored) : pendingRoll !== null ? declinedText(pendingRoll) : null,
            // The campaign's own opening stands in for the ordinary one; given both, the narrator kept to the ordinary.
            body.opening === true ? (prologueText(prologue) ?? OPENING_TEXT) : null,
            body.aftermath === true ? AFTERMATH_TEXT : null,
            body.listening === true ? LISTENING_TEXT : null,
            // The name is the page's: it is used only when the fight on the board really holds such a helper, as
            // the fight names them, so nothing but a fighter's own name reaches the narrator's instructions.
            body.helperTurn === undefined ? null : helper !== undefined ? helperTurnText(helper.name) : "A turn in the fight passes with nothing to tell. Write nothing.",
            body.foeLine === undefined ? null : foe !== undefined ? foeLineText(foe.name, body.foeLine.moment) : "A turn in the fight passes with nothing to tell. Write nothing.",
            body.message === "" ? null : playerText(body.mode, body.message),
          ].filter((part): part is string => part !== null).join("\n\n"),
          ...(body.message === "" ? {} : { player: { kind: body.mode, text: body.message } }),
          ...(scored === null ? {} : { roll: scored.rolled }),
          tools: turnTools.tools,
          callModel,
          callTool: turnTools.callTool,
          limits: { maxSteps: MAX_STEPS, maxOutputTokens: MAX_OUTPUT_TOKENS, tokenBudget: TOKEN_BUDGET },
          signal,
          onEvent: narration.onEvent,
        });
        // Held narration is judged and everything queued reaches the browser before anything after it is sent.
        await narration.finish();
        narration.applyShown(result.added);

        // Narration has already streamed, so a flagged attempt that went untold-by-roll is logged, not re-run. No
        // player text: only that it happened and how sure the judge was.
        if (rollFlagged !== null && fx.asked === null && fx.fightPlan === null) {
          console.warn(`agent-turn: an uncertain action was settled without a roll (judged ${rollFlagged.toFixed(2)} likely to need one).`);
        }
        await keepTurn(scope, fx, session, ctx, { result, turnTools });
        return;
      } catch (error) {
        // Nothing is saved and nothing charged. The provider's own message can name the model, the key's
        // organisation or the quota, so the browser gets a sentence of ours; the real one goes to the log.
        console.error("agent-turn: the turn failed:", error);
        // Whatever was already queued for the browser goes out before the error, never after it.
        await safely(async () => void (await gate?.finish()));
        if (!fx.kept) await discardFiled(scope, fx);
        emit({
          type: "error",
          message: error instanceof AgentProviderError && error.retryable ? MESSAGES.providerBusy : MESSAGES.failed,
        });
        return;
      }
    });
  };

  return { kind: "ready", reserve: provider.isByok ? 0 : RESERVE_CREDITS, run };
}

/** The whole turn in one call, for a caller that does not need to answer a status before streaming (the tests). */
export async function handleAgentTurn(input: {
  userId: string;
  body: unknown;
  deps: AgentTurnDeps;
  send: (event: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<Refusal | null> {
  const begun = await beginTurn({ userId: input.userId, body: input.body, deps: input.deps });
  if (begun.kind === "refused") return begun.refusal;
  let ran = false;
  const answer = await input.deps.withHold(input.userId, begun.reserve, async (hold) => {
    ran = true;
    await begun.run(input.send, input.signal, hold.handOff());
    return new Response(null, { status: 204 });
  });
  if (ran) return null;
  // The hold was refused and answered for: its status and code are the refusal.
  const detail: unknown = await answer.json().catch(() => null);
  const code = typeof detail === "object" && detail !== null && "error" in detail && typeof detail.error === "string" ? detail.error : "refused";
  return { status: answer.status, error: code };
}
