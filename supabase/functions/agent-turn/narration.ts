// Holding back narration that only repeats the characters (#1021). `handler.ts` hands every loop event to the gate.
//
// Before any line has been shown this turn the narrator's text streams as it always did. From the first shown line on,
// each model step's text is held, and when the step ends it is judged against the lines shown so far and shown whole
// only when it adds something. Everything the browser hears from then on goes through one queue, so a step's text is
// settled before any line or tool event a later step produces: the page keeps the order the story happened in.
//
// Judging fails open. No judge, a judge that throws, an answer that is missing or one slower than the limit all show
// the text: a narrator the player cannot read is worse than one that sometimes repeats.

import { narrationAdds } from "../_shared/agent/narrationCheck.ts";
import type { AgentLine, AgentMessage } from "../_shared/agent/types.ts";
import type { TurnEvent } from "../_shared/agent/turn.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import type { AgentEvent } from "./handler.ts";

/** How long the player may wait on the judgment; the held text is shown when it is slower. */
export const NARRATION_JUDGE_LIMIT_MS = 1_500;

export type NarrationJudge = (request: JudgeRequest) => Promise<JudgeResult>;

export interface NarrationGate {
  /** Every loop event, in the order the loop made them. */
  onEvent(event: TurnEvent): void;
  /** Judges what is still held and waits until everything queued has reached the browser. Call before `done`. */
  finish(): Promise<void>;
  /** Marks the stored narrator text the player was not shown, so a page replaying the turn does not draw it. */
  markUnshown(added: AgentMessage[]): void;
}

export function narrationGate(input: { judge: NarrationJudge | null; emit: (event: AgentEvent) => void }): NarrationGate {
  const { judge, emit } = input;

  /** Every narrator step that wrote visible text, in order, and whether the player saw it. */
  const written: Array<{ text: string; shown: boolean }> = [];
  const lines: AgentLine[] = [];
  let tail: Promise<void> = Promise.resolve();
  let stepText = "";
  let stepHeld = false;

  // Every task that touches the browser or the judge goes on the same chain, and none of them may reject it.
  const enqueue = (task: () => void | Promise<void>): void => {
    tail = tail.then(task).catch((error) => console.error("agent-turn: the narration queue failed:", error));
  };

  const withinLimit = async (work: Promise<boolean>): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), NARRATION_JUDGE_LIMIT_MS);
    });
    try {
      return await Promise.race([work.catch(() => true), slow]);
    } finally {
      clearTimeout(timer);
    }
  };

  const endStep = (): void => {
    const text = stepText;
    const held = stepHeld;
    stepText = "";
    stepHeld = false;
    if (text.trim() === "") return;
    const record = { text, shown: true };
    written.push(record);
    if (!held || judge === null) return;
    // The lines as they stand now: later steps add to the array while this judgment is waiting its turn.
    const seen = [...lines];
    enqueue(async () => {
      record.shown = await withinLimit(narrationAdds({ lines: seen, narration: text, judge }));
      if (record.shown) emit({ type: "text", delta: text });
    });
  };

  const onEvent = (event: TurnEvent): void => {
    if (judge === null) {
      // No judging key: everything is shown as it arrives, exactly as before the check existed.
      if (event.type === "text") emit({ type: "text", delta: event.delta });
      else if (event.type === "tool_start") emit({ type: "tool_start", name: event.name });
      else if (event.type === "tool_end") {
        emit({ type: "tool_end", name: event.name, isError: event.isError });
        for (const line of event.lines ?? []) emit({ type: "line", line });
      }
      return;
    }
    switch (event.type) {
      case "text":
        stepText += event.delta;
        if (lines.length > 0) stepHeld = true;
        else enqueue(() => emit({ type: "text", delta: event.delta }));
        break;
      case "step":
        endStep();
        break;
      case "tool_start":
        // Names and outcomes only: a tool's input and result can hold DM-only notes the model looked up.
        enqueue(() => emit({ type: "tool_start", name: event.name }));
        break;
      case "tool_end": {
        const shown = event.lines ?? [];
        lines.push(...shown);
        enqueue(() => {
          emit({ type: "tool_end", name: event.name, isError: event.isError });
          // A character's deed comes before its words, as the page reads them.
          for (const line of shown) emit({ type: "line", line });
        });
        break;
      }
    }
  };

  return {
    onEvent,
    async finish() {
      // A turn that stopped mid-step (an abort) leaves text no `step` event closed.
      endStep();
      await tail;
    },
    markUnshown(added) {
      const dropped = written.filter((w) => !w.shown);
      if (dropped.length === 0) return;
      // The k-th assistant message with text is the k-th step that wrote text. The text is compared as well, so a
      // message the two disagree about is left alone rather than hidden by mistake.
      let k = 0;
      for (const message of added) {
        if (message.role !== "assistant") continue;
        const joined = message.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
        if (joined.trim() === "") continue;
        const step = written[k++];
        if (step === undefined || step.shown || step.text !== joined) continue;
        for (const block of message.blocks) if (block.type === "text") block.unshown = true;
      }
    },
  };
}
