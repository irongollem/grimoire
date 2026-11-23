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
});
