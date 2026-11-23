/**
 * Ask Grimoire (#1253): the Puzzle Generator, as a quote and a run.
 *
 * The price is `usePuzzleQuote`'s (the one `PuzzleGeneratorPanel` shows), the gates are the page's (AI off, the puzzles quota, the balance) and the run
 * is `useGeneratePuzzle`, the generate-and-save step the page calls. The kind and the difficulty are kept only when they are ones the page's pickers offer.
 *
 * A failed picture never costs the puzzle: the row is saved first and the picture is its own part. There is no
 * one-picture retry for a puzzle yet (`useMissingPortrait` has no kind for it), so a failed picture says to add one
 * from the puzzle's own page.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { usePuzzleQuote } from "@/composables/ai/quotes/puzzleQuote";
import { useGeneratePuzzle } from "@/composables/dungeon-features/useGeneratePuzzle";
import { isQuotaExceeded } from "@/lib/quotaError";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";

/** The page's picker offers a fixed list: a value is kept only when it is on it, spelled the way the page spells it. */
function knownPuzzleType(said: string | null): string | null {
  if (said === null) return null;
  const found = PUZZLE_TYPES.find((t) => t.toLowerCase() === said.toLowerCase());
  return found === undefined ? null : found;
}

/** The page's picker offers a fixed list: a value is kept only when it is on it, spelled the way the page spells it. */
function knownPuzzleDifficulty(said: string | null): string | null {
  if (said === null) return null;
  const found = PUZZLE_DIFFICULTIES.find((t) => t.toLowerCase() === said.toLowerCase());
  return found === undefined ? null : found;
}

export function usePuzzleAskAdapter(): AskAdapter {
  const quotePuzzle = usePuzzleQuote();
  const { blockFor } = useAskGate("puzzle_rooms", "puzzle");
  const { generateAndCreatePuzzle } = useGeneratePuzzle();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("puzzle", proposal.inputs);
    const type = knownPuzzleType(askString(inputs, "puzzle_type"));
    const difficulty = knownPuzzleDifficulty(askString(inputs, "difficulty"));
    return {
      puzzleType: type,
      difficulty,
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quotePuzzle({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.puzzleType) lines.push({ label: "Kind", value: read.puzzleType, credits: null });
    if (read.difficulty) lines.push({ label: "Difficulty", value: read.difficulty, credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(read.concept, "puzzle");
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Puzzle text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreatePuzzle(read.concept, {
        puzzle_type: read.puzzleType ?? undefined,
        difficulty: read.difficulty ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of puzzles on this plan."
        : e instanceof Error ? e.message : "The puzzle could not be saved.";
      return failedRun("Puzzle text", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Puzzle text", outcome.error ?? "Puzzle generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Puzzle text", ok: true, credits: spent(current.lines.find((l) => l.label === "Puzzle text")) },
    ];
    if (read.image) {
      const credits = spent(current.lines.find((l) => l.label === "Picture"));
      parts.push(picturePart({ saved: outcome.picture === "saved", credits, noun: "puzzle" }));
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/puzzles/${outcome.id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "puzzle", quote, run };
}

export default usePuzzleAskAdapter;
