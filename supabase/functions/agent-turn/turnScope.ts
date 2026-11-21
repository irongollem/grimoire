// What every step of a running turn shares (#1205): the admitted request with the wiring to answer it, and the one
// object that collects what the narrator decided during the turn. Nothing in `TurnEffects` is carried out until the
// turn is kept (`keepTurn.ts`); that is the point of collecting it rather than doing it on the spot.

import type { BroughtOut } from "../_shared/agent/canon.ts";
import type { FightChange } from "../_shared/agent/fightChange.ts";
import type { HitPointChange } from "../_shared/agent/hitPoints.ts";
import type { HazardRules } from "../_shared/agent/hazard.ts";
import type { HandoutOffer, PlaceShare } from "../_shared/agent/show.ts";
import type { HandsChange } from "../_shared/agent/hands.ts";
import type { Introduction } from "../_shared/agent/introduce.ts";
import type { FightPlan } from "../_shared/agent/fight.ts";
import type { InventionRuling } from "../_shared/agent/invention.ts";
import type { PendingRoll } from "../_shared/agent/playerRoll.ts";
import type { QuestMove } from "../_shared/agent/quests.ts";
import type { FiledFact } from "./turnTools.ts";
import { safely } from "./turnSupport.ts";
import type { Admitted } from "./admitTurn.ts";
import type { AgentEvent, AgentTurnDeps, TurnLedger } from "./turnTypes.ts";

export interface TurnScope extends Admitted {
  userId: string;
  deps: AgentTurnDeps;
  /** The turn's ledger lines, queued here and written once the hold is released. */
  ledger: TurnLedger;
  /** Never throws: a listener that throws (a closed stream) must not cost the player the turn that is already paid for. */
  emit: (event: AgentEvent) => void;
  signal: AbortSignal | undefined;
}

export interface TurnEffects {
  // Facts are written the moment the narrator files them, before the turn is saved. A turn that is not kept is
  // sent again by the player, and the narrator would file the same facts a second time, so they come off again.
  filed: FiledFact[];
  kept: boolean;
  // Quest moves the narrator made this turn. Objectives and clocks have no undo, so none is written until the turn is kept.
  queued: QuestMove[];
  // The roll the narrator asked the player for this turn; written only once the turn is kept.
  asked: PendingRoll | null;
  /** Handouts handed over in the story this turn; given for real once the turn is kept. */
  handedOut: HandoutOffer[];
  /** Places handed over in the story this turn; shared with the played character once the turn is kept. */
  sharedPlaces: PlaceShare[];
  lastExchange: { ended: "to_player" | "open"; cutShort: boolean } | null;
  narratorKeeps: boolean;
  // What changes hands this turn; moved only once the turn is kept.
  handed: HandsChange[];
  // What the narrator's ruling does to the fight on the board; carried out by the page once the turn is kept.
  fightChange: FightChange | null;
  // What the narrator's roll does to the played character's hit points; written only once the turn is kept.
  hitPointChange: HitPointChange | null;
  // People the narrator gave a record this turn; made only once the turn is kept.
  introduced: Introduction[];
  // Hazards the narrator made this turn; written only once the turn is kept.
  madeHazards: HazardRules[];
  daysPassed: number;
  // The fight the narrator starts this turn; started only once the turn is kept.
  fightPlan: FightPlan | null;
  // Clues found and passages told in play this turn (#1226); marked only once the turn is kept.
  broughtOut: BroughtOut[];
  // Rulings on the played character's inventions this turn (#1103); made only once the turn is kept, because an approval has no undo.
  rulings: InventionRuling[];
}

export function newEffects(): TurnEffects {
  return {
    filed: [],
    kept: false,
    queued: [],
    asked: null,
    handedOut: [],
    sharedPlaces: [],
    lastExchange: null,
    narratorKeeps: false,
    handed: [],
    fightChange: null,
    hitPointChange: null,
    introduced: [],
    madeHazards: [],
    daysPassed: 0,
    fightPlan: null,
    broughtOut: [],
    rulings: [],
  };
}

export async function discardFiled(scope: TurnScope, fx: TurnEffects): Promise<void> {
  if (fx.filed.length === 0) return;
  await safely(() => scope.deps.discardFacts(scope.campaign.id, fx.filed.map((f) => f.id)));
}
