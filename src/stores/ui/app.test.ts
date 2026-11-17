// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { readUserMode, useAppUiStore } from "./app";

describe("readUserMode", () => {
  it("keeps the two modes the app writes", () => {
    expect(readUserMode("dm")).toBe("dm");
    expect(readUserMode("player")).toBe("player");
  });

  // A value the app never writes must not read as a mode, or the lens fence
  // (which acts only on a known mode) stands down while the DM shell renders.
  it("reads anything else as never chosen", () => {
    expect(readUserMode("")).toBe("");
    expect(readUserMode('"dm"')).toBe("");
    expect(readUserMode("DM")).toBe("");
  });
});

describe("the chat panel", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("opening it, however it is opened, clears the unread dot; closing it does not raise one", () => {
    const ui = useAppUiStore();
    ui.chatHasUnread = true;
    ui.toggleChat();
    expect([ui.chatOpen, ui.chatHasUnread]).toEqual([true, false]);

    ui.toggleChat();
    expect([ui.chatOpen, ui.chatHasUnread]).toEqual([false, false]);

    ui.chatHasUnread = true;
    ui.openChat();
    expect(ui.chatHasUnread).toBe(false);
  });

  it("opening at a message asks the panel to focus it, every time, and closing forgets it", async () => {
    const ui = useAppUiStore();
    ui.openChatAt("m1");
    const first = ui.chatFocusRequest;
    ui.openChatAt("m1");
    expect(ui.chatFocusRequest).toBeGreaterThan(first);
    expect([ui.chatOpen, ui.chatFocusMessageId]).toEqual([true, "m1"]);
    await nextTick();

    ui.toggleChat();
    await nextTick();
    expect(ui.chatFocusMessageId).toBeNull();
  });
});

describe("DM preview of the player portal", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("enters as a given character or as nobody, and leaving forgets the character", () => {
    const ui = useAppUiStore();
    ui.enterDmPreview("pm1");
    expect([ui.dmPreviewMode, ui.dmPreviewPartyMemberId]).toEqual([true, "pm1"]);

    ui.enterDmPreview();
    expect([ui.dmPreviewMode, ui.dmPreviewPartyMemberId]).toEqual([true, null]);

    ui.enterDmPreview("pm1");
    ui.exitDmPreview();
    expect([ui.dmPreviewMode, ui.dmPreviewPartyMemberId]).toEqual([false, null]);
  });
});

describe("DM mode", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("is prep until a session is running", () => {
    const ui = useAppUiStore();
    expect(ui.dmMode).toBe("prep");
    ui.sessionRunning = true;
    expect(ui.dmMode).toBe("play");
  });
});

describe("playing at the AI table", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  // Bug caught: a DM sitting down and still reading the campaign with the DM's own eyes.
  it("puts the shell under the played character's lens, and takes it off again on leaving", () => {
    const ui = useAppUiStore();
    ui.enterTablePlay("rosie");
    expect(ui.dmPreviewMode).toBe(true);
    expect(ui.dmPreviewPartyMemberId).toBe("rosie");
    ui.exitTablePlay();
    expect(ui.tablePlay).toBeNull();
    expect(ui.dmPreviewMode).toBe(false);
    expect(ui.dmPreviewPartyMemberId).toBeNull();
  });

  // Bug caught: a reload in the middle of a sitting dropping the lens, so the router turns the DM away from the story.
  it("is still the played character after a reload of the tab", () => {
    const first = useAppUiStore();
    first.enterTablePlay("rosie");
    first.setTablePlaySession("s1");
    setActivePinia(createPinia());
    const reloaded = useAppUiStore();
    expect(reloaded.tablePlay).toEqual({ memberId: "rosie", sessionId: "s1" });
    expect(reloaded.dmPreviewPartyMemberId).toBe("rosie");
  });

  // Bug caught: leaving the table and coming back to a new tab state that still claims to be playing.
  it("is not playing after a reload once the table was left", () => {
    const first = useAppUiStore();
    first.enterTablePlay("rosie");
    first.exitTablePlay();
    setActivePinia(createPinia());
    expect(useAppUiStore().tablePlay).toBeNull();
  });

  // Bug caught: hand-edited or stale storage read as a seat at the table for nobody.
  it("reads stored junk as not playing", () => {
    sessionStorage.setItem("grimoire:table-play", JSON.stringify({ memberId: "" }));
    setActivePinia(createPinia());
    expect(useAppUiStore().tablePlay).toBeNull();
    sessionStorage.setItem("grimoire:table-play", "{not json");
    setActivePinia(createPinia());
    expect(useAppUiStore().tablePlay).toBeNull();
  });

  // Bug caught: leaving the table switching off a preview the DM had started for another reason.
  it("leaves an ordinary preview alone when nobody was playing", () => {
    const ui = useAppUiStore();
    ui.enterDmPreview("fresco");
    ui.exitTablePlay();
    expect(ui.dmPreviewMode).toBe(true);
  });
});
