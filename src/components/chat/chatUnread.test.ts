import { beforeEach, describe, expect, it } from "vitest";
import {
  isDisplayedMessage,
  loadReadMarker,
  newestDisplayed,
  resolveChatUnread,
  saveReadMarker,
} from "./chatUnread";
import type { CampaignMessage } from "@/types/chat.types";

type M = Pick<CampaignMessage, "id" | "created_at" | "user_id" | "type" | "metadata">;
const msg = (id: string, at: string, user = "dm", type: M["type"] = "chat", metadata: M["metadata"] = null): M =>
  ({ id, created_at: at, user_id: user, type, metadata });
const mark = (id: string, at: string) => ({ id, created_at: at });

describe("resolveChatUnread", () => {
  it("lights for a newer message from someone else while the chat is not on screen", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-02")],
      marker: mark("a", "2026-01-01"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(true);
    expect(r.marker).toEqual(mark("a", "2026-01-01"));
  });

  it("treats history as read on a first visit and does not light", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-02")],
      marker: null,
      viewing: false,
      myUserId: "me",
    });
    expect(r).toEqual({ unread: false, marker: mark("b", "2026-01-02") });
  });

  it("moves the marker and clears while the chat is on screen", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-02")],
      marker: mark("a", "2026-01-01"),
      viewing: true,
      myUserId: "me",
    });
    expect(r).toEqual({ unread: false, marker: mark("b", "2026-01-02") });
  });

  it("does not light for my own message", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-02", "me")],
      marker: mark("a", "2026-01-01"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(false);
  });

  it("does not light when a refetch re-delivers messages at or before the marker", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-02")],
      marker: mark("b", "2026-01-02"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(false);
  });

  it("does not light when a delete promotes an older message to newest", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01")],
      marker: mark("b", "2026-01-02"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(false);
  });

  it("breaks a timestamp tie by id, as the message list does", () => {
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), msg("b", "2026-01-01")],
      marker: mark("a", "2026-01-01"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(true);
  });

  it("ignores a skill-check flavour line, which the chat draws inside the roll card", () => {
    const flavor = msg("f", "2026-01-02", "dm", "system", { skill_label: "Stealth" } as M["metadata"]);
    const r = resolveChatUnread({
      messages: [msg("a", "2026-01-01"), flavor],
      marker: mark("a", "2026-01-01"),
      viewing: false,
      myUserId: "me",
    });
    expect(r.unread).toBe(false);
  });

  it("is quiet with no messages", () => {
    expect(resolveChatUnread({ messages: [], marker: null, viewing: false, myUserId: "me" }))
      .toEqual({ unread: false, marker: null });
  });
});

describe("displayed messages", () => {
  it("hides only flavour lines that carry a skill label", () => {
    expect(isDisplayedMessage({ type: "system", metadata: { skill_label: "Stealth" } as M["metadata"] })).toBe(false);
    expect(isDisplayedMessage({ type: "system", metadata: null })).toBe(true);
    expect(isDisplayedMessage({ type: "chat", metadata: null })).toBe(true);
  });
  it("finds the newest displayed message", () => {
    const list = [msg("a", "1"), msg("f", "2", "dm", "system", { skill_label: "x" } as M["metadata"])];
    expect(newestDisplayed(list)?.id).toBe("a");
    expect(newestDisplayed([])).toBeNull();
  });
});

describe("read marker storage", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips per viewer and campaign", () => {
    saveReadMarker("u1", "c1", mark("a", "2026-01-01"));
    expect(loadReadMarker("u1", "c1")).toEqual(mark("a", "2026-01-01"));
    expect(loadReadMarker("u1", "c2")).toBeNull();
    expect(loadReadMarker("u2", "c1")).toBeNull();
  });
  it("treats garbage as no marker", () => {
    localStorage.setItem("grimoire:chat-read:u1:c1", "{nope");
    expect(loadReadMarker("u1", "c1")).toBeNull();
    localStorage.setItem("grimoire:chat-read:u1:c1", JSON.stringify({ id: 1 }));
    expect(loadReadMarker("u1", "c1")).toBeNull();
  });
});
