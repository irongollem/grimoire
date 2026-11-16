// The tools one turn offers the narrator, and the router that runs them (#1205, #1021).
//
// Kept out of `handler.ts` so the handler is about the turn's rules (gates, loop, save, charge) and this file is
// about what the narrator may do inside it: the campaign's own tools, a character speaking, moving the party and
// putting a fact on the record. Everything with I/O comes in through `deps`; nothing here touches a database.

import { GO_TO_TOOL, makeSceneTool } from "../_shared/agent/scene.ts";
import { makeSpeechTools, type Remembered } from "../_shared/agent/speak.ts";
import { SPEECH_TOOL_NAMES } from "../_shared/agent/speakInput.ts";
import { makeRecordTool, RECORD_TOOL_NAME } from "../_shared/agent/record.ts";
import type { StoredTurn } from "../_shared/agent/transcript.ts";
import type { AgentTool, CallModel, CallTool } from "../_shared/agent/types.ts";
import type { AgentTurnDeps, SessionRow } from "./handler.ts";

/** A fact filed during this turn. It is on record already, and is taken off again when the turn is not kept. */
export interface FiledFact {
  id: string;
  body: string;
  hidden: boolean;
}

export interface TurnToolsInput {
  deps: Pick<AgentTurnDeps, "tools" | "callTool" | "loadSpeaker" | "findCharacters" | "setScene" | "fileFact">;
  campaignId: string;
  session: SessionRow;
  stored: StoredTurn[];
  provider: string;
  model: string;
  callModel: CallModel;
  signal?: AbortSignal;
  /** The party arrived somewhere: only the place's id and name, for the browser. */
  onMove(place: { id: string; name: string }): void;
  /** The turn's own list of filed facts, owned by the caller so it can still reach them when the turn throws. */
  filed: FiledFact[];
}

export interface TurnTools {
  tools: AgentTool[];
  callTool: CallTool;
  /** What characters chose to remember this turn; filed only once the turn is saved. */
  remembered: Array<{ characterId: string } & Remembered>;
  /** The recorded characters who spoke or acted this turn: they are where the party is. */
  spoke: Set<string>;
  /** Where the party is now, after any move this turn; null when it has no place. */
  place(): string | null;
}

export function makeTurnTools(input: TurnToolsInput): TurnTools {
  const { deps, campaignId, session } = input;

  let place = session.scene_location_id;
  const go = makeSceneTool({
    campaignId,
    sessionId: session.id,
    setScene: deps.setScene,
    onMove: (moved) => {
      place = moved.id;
      input.onMove(moved);
    },
  });

  // A character speaks through its own model call, built from that character alone (`speak.ts`). The same
  // model for now: a cheaper one for speech needs its own price row first.
  const remembered: TurnTools["remembered"] = [];
  const spoke = new Set<string>();
  const speech = makeSpeechTools({
    stored: input.stored,
    loadSpeaker: (id) => deps.loadSpeaker(campaignId, id),
    callModel: input.callModel,
    signal: input.signal,
    onRemember: (memory) => remembered.push(memory),
    findRecorded: (name) => deps.findCharacters(campaignId, name),
    onSpoke: (id) => spoke.add(id),
  });

  // The campaign and the sittings are the conversation's own; the model only chooses the words and what they are about.
  const record = makeRecordTool({
    fileFact: (fact) =>
      deps.fileFact({
        campaignId,
        campaignSessionId: session.campaign_session_id,
        agentSessionId: session.id,
        provider: input.provider,
        model: input.model,
        ...fact,
      }),
    onFiled: (fact) => input.filed.push(fact),
  });

  return {
    tools: [...deps.tools, ...speech.tools, go.tool, record.tool],
    remembered,
    spoke,
    place: () => place,
    callTool: (name, toolInput) => {
      if (name === GO_TO_TOOL.name) return go.call(toolInput);
      if (name === RECORD_TOOL_NAME) return record.call(toolInput);
      return SPEECH_TOOL_NAMES.has(name) ? speech.call(name, toolInput) : deps.callTool(name, toolInput);
    },
  };
}
