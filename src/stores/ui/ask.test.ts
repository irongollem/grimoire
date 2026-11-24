import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAskUiStore } from "./ask";

describe("useAskUiStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: opening the panel leaving the "result ready" dot on the button.
  it("clears the unread dot when the panel opens", () => {
    const ask = useAskUiStore();
    ask.markUnread();
    ask.openPanel();
    expect(ask.hasUnread).toBe(false);
  });

  // Bug caught: a search query sent twice (once by the panel's mount, once by its watcher).
  it("hands the waiting query over exactly once", () => {
    const ask = useAskUiStore();
    ask.openPanel("  who is Mara?  ");
    expect(ask.takePendingQuery()).toBe("who is Mara?");
    expect(ask.takePendingQuery()).toBeNull();
  });

  // Bug caught: closing the panel resetting everOpened, which would unmount it and abandon a running turn.
  it("stays mounted-worthy once opened, even when closed", () => {
    const ask = useAskUiStore();
    ask.openPanel();
    ask.closePanel();
    expect(ask.open).toBe(false);
    expect(ask.everOpened).toBe(true);
  });

  // Bug caught: the search row (sends) and Suggest (writes, unsent) sharing one slot, so one of them did the other's job.
  it("sends by default and only writes into the box when asked not to", () => {
    const ask = useAskUiStore();
    ask.openPanel("who is Mara?");
    expect(ask.pendingQuery).toBe("who is Mara?");
    expect(ask.prefill).toBeNull();
    ask.takePendingQuery();
    ask.openPanel("Suggest a truth.", { send: false });
    expect(ask.pendingQuery).toBeNull();
    expect(ask.takePrefill()).toBe("Suggest a truth.");
    expect(ask.takePrefill()).toBeNull();
  });

  // Bug caught: the panel's mount and its watcher both taking the waiting generator, so a button made two cards.
  it("opens the panel on a generator and hands it over exactly once", () => {
    const ask = useAskUiStore();
    ask.openGenerator("npc", { inputs: { relation: "sibling" } });
    expect(ask.open).toBe(true);
    expect(ask.pendingQuery).toBeNull();
    expect(ask.takePendingGenerator()).toEqual({ generatorId: "npc", inputs: { relation: "sibling" } });
    expect(ask.takePendingGenerator()).toBeNull();
  });
});
