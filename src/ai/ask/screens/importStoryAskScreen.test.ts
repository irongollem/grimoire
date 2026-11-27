import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AskProposal } from "@edge-shared/agent/askContract";
import { offerToldStory } from "@/composables/ask/useAskInterview";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import { useAskUiStore } from "@/stores/ui/ask";
import { useImportStoryAskScreen } from "./importStoryAskScreen";

const proposal: AskProposal = { proposalId: "p", generator: "import_story", concept: "A summary the model wrote", inputs: {} };

describe("the import_story screen", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the proposal path offering the model's summary while the button offers the DM's words, so the two
  // ways of turning a story into canon import different text.
  it("offers the interview's own transcript, exactly as the button does", () => {
    useAskUiStore().interviewStory = "The Familiar asked: Q\n\nI said: A";
    const to = useImportStoryAskScreen().route(proposal);
    const viaScreen = useAskPrefillStore().takeOffer("document_import");
    expect(offerToldStory("The Familiar asked: Q\n\nI said: A")).toBe(to);
    expect(useAskPrefillStore().takeOffer("document_import")).toEqual(viaScreen);
    expect(to).toBe("/canon/import");
    expect(viaScreen?.text).toBe("The Familiar asked: Q\n\nI said: A");
  });

  // Bug caught: a proposal made after the interview ended offering nothing (a blank paste), instead of what it carries.
  it("falls back to the proposal's concept when there is no interview", () => {
    useImportStoryAskScreen().route(proposal);
    expect(useAskPrefillStore().takeOffer("document_import")?.text).toBe("A summary the model wrote");
  });
});
