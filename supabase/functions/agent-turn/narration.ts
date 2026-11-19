// Holding back narration that only repeats the characters (#1021). `handler.ts` hands every loop event to the gate.
//
// Before any line has been shown this turn the narrator's text streams as it always did. From the first shown line on,
// each model step's text is held, and when the step ends it is judged sentence by sentence against the lines shown so
// far, and only the sentences that add something are shown. Everything the browser hears from then on goes through one queue, so a step's text is
// settled before any line or tool event a later step produces: the page keeps the order the story happened in.
//
// Judging fails open. No judge, a judge that throws, an answer that is missing or one slower than the limit all show
// the original text whole: a narrator the player cannot read is worse than one that sometimes repeats.

import { narrationKept } from "../_shared/agent/narrationCheck.ts";
import type { AgentLine, AgentMessage } from "../_shared/agent/types.ts";
import type { TurnEvent } from "../_shared/agent/turn.ts";
import type { JudgeRequest, JudgeResult } from "../_shared/typesafe.ts";
import type { AgentEvent } from "./turnTypes.ts";

/** How long the player may wait on the judgment; the held text is shown when it is slower. */
export const NARRATION_JUDGE_LIMIT_MS = 1_500;

export type NarrationJudge = (request: JudgeRequest) => Promise<JudgeResult>;

export interface NarrationGate {
  /** Every loop event, in the order the loop made them. */
  onEvent(event: TurnEvent): void;
  /**
   * Lines a character said or did while its tool is still running (an exchange in progress): shown now, in their
   * place, and not again when the tool ends.
   */
  said(lines: AgentLine[]): void;
  /** Judges what is still held and waits until everything queued has reached the browser. Call before `done`. */
  finish(): Promise<void>;
  /** Makes the stored narrator text what the player was shown: dropped text is marked, part-shown text is cut to it. */
  applyShown(added: AgentMessage[]): void;
}

export function narrationGate(input: {
  judge: NarrationJudge | null;
  emit: (event: AgentEvent) => void;
  /** A step's narration as the player was shown it, once it is whole: in its place among the lines, for a voice. */
  onNarration?: (text: string) => void;
}): NarrationGate {
  const { judge, emit } = input;
  const narrated = (text: string): void => {
    if (text.trim() !== "") input.onNarration?.(text.trim());
  };

  /** Every narrator step that wrote visible text, in order, and the part of it the player saw. */
  const written: Array<{ text: string; shown: string }> = [];
  const lines: AgentLine[] = [];
  // Lines already shown while their tool was still running: the tool's end must not show them twice.
  const early = new WeakSet<AgentLine>();
  let tail: Promise<void> = Promise.resolve();
  let stepText = "";
  let stepHeld = false;

  // Every task that touches the browser or the judge goes on the same chain, and none of them may reject it.
  const enqueue = (task: () => void | Promise<void>): void => {
    tail = tail.then(task).catch((error) => console.error("agent-turn: the narration queue failed:", error));
  };

  // A judge that throws or is slower than the limit shows the original text whole.
  const withinLimit = async (work: Promise<string>, original: string): Promise<string> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve(original), NARRATION_JUDGE_LIMIT_MS);
    });
    try {
      return await Promise.race([work.catch(() => original), slow]);
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
    const record = { text, shown: text };
    written.push(record);
    if (!held || judge === null) {
      // Already on the page as it streamed; said whole now, after everything queued before it.
      enqueue(() => narrated(text));
      return;
    }
    // The lines as they stand now: later steps add to the array while this judgment is waiting its turn.
    const seen = [...lines];
    enqueue(async () => {
      record.shown = await withinLimit(narrationKept({ lines: seen, narration: text, judge }), text);
      if (record.shown !== "") emit({ type: "text", delta: record.shown });
      narrated(record.shown);
    });
  };

  const onEvent = (event: TurnEvent): void => {
    if (judge === null) {
      // No judging key: everything is shown as it arrives, exactly as before the check existed.
      if (event.type === "text") {
        stepText += event.delta;
        emit({ type: "text", delta: event.delta });
      } else if (event.type === "step") endStep();
      else if (event.type === "tool_start") emit({ type: "tool_start", name: event.name });
      else if (event.type === "tool_end") {
        emit({ type: "tool_end", name: event.name, isError: event.isError });
        if (event.dmRoll) emit({ type: "dm_roll", roll: event.dmRoll });
        if (event.shown) emit({ type: "shown", shown: event.shown });
        for (const line of event.lines ?? []) if (!early.has(line)) emit({ type: "line", line });
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
        const shown = (event.lines ?? []).filter((line) => !early.has(line));
        const dmRoll = event.dmRoll;
        const put = event.shown;
        lines.push(...shown);
        enqueue(() => {
          emit({ type: "tool_end", name: event.name, isError: event.isError });
          // The Dungeon Master's open roll, in its place in the story: before whatever comes of it.
          if (dmRoll) emit({ type: "dm_roll", roll: dmRoll });
          // A handout or a picture, in its place in the story.
          if (put) emit({ type: "shown", shown: put });
          // A character's deed comes before its words, as the page reads them.
          for (const line of shown) emit({ type: "line", line });
        });
        break;
      }
    }
  };

  const said = (told: AgentLine[]): void => {
    for (const line of told) early.add(line);
    if (judge === null) {
      for (const line of told) emit({ type: "line", line });
      return;
    }
    // Counted among the lines the narrator's text is judged against, and shown after whatever was queued before.
    lines.push(...told);
    enqueue(() => {
      for (const line of told) emit({ type: "line", line });
    });
  };

  return {
    onEvent,
    said,
    async finish() {
      // A turn that stopped mid-step (an abort) leaves text no `step` event closed.
      endStep();
      await tail;
    },
    applyShown(added) {
      if (written.every((w) => w.shown === w.text)) return;
      // The k-th assistant message with text is the k-th step that wrote text. The text is compared as well, so a
      // message the two disagree about is left alone rather than changed by mistake.
      let k = 0;
      for (const message of added) {
        if (message.role !== "assistant") continue;
        const joined = message.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
        if (joined.trim() === "") continue;
        const step = written[k++];
        if (step === undefined || step.shown === step.text || step.text !== joined) continue;
        if (step.shown === "") {
          for (const block of message.blocks) if (block.type === "text") block.unshown = true;
          continue;
        }
        // Part was shown: the stored text becomes what the player read, so the next turn's history shows the
        // narrator its own narration as it appeared, which is also the example it should follow. The kept text goes
        // in the first text block; later text blocks go, and no empty block is left (a provider rejects one).
        const blocks: AgentMessage["blocks"] = [];
        let placed = false;
        for (const block of message.blocks) {
          if (block.type !== "text") blocks.push(block);
          else if (!placed) {
            placed = true;
            blocks.push({ ...block, text: step.shown });
          }
        }
        message.blocks = blocks;
      }
    },
  };
}
