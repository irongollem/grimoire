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
