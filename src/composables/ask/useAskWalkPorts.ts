import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useAskGate } from "@/ai/ask/useAskGate";
import { loreTitleFrom } from "@/ai/ask/adapters/canonSuggestionsAskAdapter";
import { useCanonSuggestions } from "@/ai/useCanonSuggestions";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";
import { useCanonWalkSkipActions } from "@/composables/canon/useCanonWalkSkips";
import { useCanonWalkSteps } from "@/composables/canon/useCanonWalkSteps";
import { useWalkWrites } from "@/composables/canon/useWalkWrites";
import type { AskWalkPorts } from "./useAskWalk";

/**
 * The real canon behind the walk's engine (#1282): its steps and writes, the skip, the helper's price and gate, and the
 * one helper call. Made in the conversation's scope, so the canon queries are the panel's own.
 */
export function useAskWalkPorts(): AskWalkPorts {
  const { stops, steps, loaded } = useCanonWalkSteps();
  const { write } = useWalkWrites();
  const { skip } = useCanonWalkSkipActions();
  const quoteFor = useCanonSuggestionsQuote();
  const { blockFor } = useAskGate(null, "canon suggestion");

  const done = (ok: boolean, error: string | null) => (ok ? ({ ok: true } as const) : ({ ok: false, error: error ?? "The draft could not be written. Try again." } as const));

  return {
    stops: () => stops.value,
    loaded: () => loaded.value,
    pitchWritten: () => steps.value.find((s) => s.id === "pitch")?.state === "filled",
    speciesKept: () => steps.value.find((s) => s.id === "species")?.state === "filled",
    skip: async (step) => {
      await skip.mutateAsync(step);
    },
    write: (stop, text, options) => write(stop, text, options),
    price: (draft) => quoteFor(draft.mode).total,
    blockedBy: (total) => blockFor({ total })?.message ?? null,
    busy: () => isAnyAiGenerating.value,
    draft: async ({ draft, scope, steer, answer, stop }) => {
      switch (draft.mode) {
        case "premise": {
          const helper = useCanonSuggestions("premise", scope);
          return done(await helper.suggest(steer, { kinds: draft.kinds }), helper.error.value);
        }
        case "backstory": {
          if (stop.memberId === null) return { ok: false, error: "A backstory is drafted for one character." };
          const helper = useCanonSuggestions("backstory", scope);
          return done(await helper.suggest(steer, { party_member_id: stop.memberId }), helper.error.value);
        }
        case "lore": {
          // A lore draft is made about something: the first line of what the DM said is its title.
          const title = loreTitleFrom(answer);
          if (title === "") return { ok: false, error: "Say what the lore is about first: a title and a line." };
          const helper = useCanonSuggestions("lore", scope);
          return done(await helper.suggest(steer, { title }), helper.error.value);
        }
        case "truths":
        case "forces":
        case "secrets":
        case "questions":
        case "arcs":
        case "peoples":
        case "species":
        case "habitats": {
          const helper = useCanonSuggestions(draft.mode, scope);
          return done(await helper.suggest(steer), helper.error.value);
        }
      }
    },
  };
}
