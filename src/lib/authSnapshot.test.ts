import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthSnapshot,
  readAuthSnapshot,
  writeAuthSnapshot,
  type AuthSnapshot,
} from "./authSnapshot";
import type { CampaignMember } from "@/types/campaign.types";

const member = (campaignId: string) =>
  ({ id: "m1", user_id: "u1", campaign_id: campaignId, role: "dm" }) as unknown as CampaignMember;

const snap = (membership: CampaignMember | null): AuthSnapshot => ({
  v: 1,
  userId: "u1",
  membership,
  username: "hero",
  childLink: null,
  childLinkLoaded: true,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("authSnapshot", () => {
  it("round-trips for the same user and campaign", () => {
    writeAuthSnapshot(snap(member("c1")));
    expect(readAuthSnapshot("u1", "c1")).toEqual(snap(member("c1")));
  });

  it("misses for another user", () => {
    writeAuthSnapshot(snap(member("c1")));
    expect(readAuthSnapshot("u2", "c1")).toBeNull();
  });

  it("misses when the membership is for another campaign or null", () => {
    writeAuthSnapshot(snap(member("c1")));
    expect(readAuthSnapshot("u1", "c2")).toBeNull();
    writeAuthSnapshot(snap(null));
    expect(readAuthSnapshot("u1", "c1")).toBeNull();
  });

  it("hits without a campaign id, with or without a membership", () => {
    writeAuthSnapshot(snap(member("c1")));
    expect(readAuthSnapshot("u1", undefined)).not.toBeNull();
    writeAuthSnapshot(snap(null));
    expect(readAuthSnapshot("u1", undefined)).not.toBeNull();
  });

  it("misses on corrupt JSON and on a wrong version", () => {
    localStorage.setItem("grimoire:auth-snapshot", "{nope");
    expect(readAuthSnapshot("u1", undefined)).toBeNull();
    localStorage.setItem("grimoire:auth-snapshot", JSON.stringify({ ...snap(null), v: 2 }));
    expect(readAuthSnapshot("u1", undefined)).toBeNull();
  });

  it("clears", () => {
    writeAuthSnapshot(snap(null));
    clearAuthSnapshot();
    expect(readAuthSnapshot("u1", undefined)).toBeNull();
  });

  it("never throws when storage does", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    expect(readAuthSnapshot("u1", undefined)).toBeNull();
    expect(() => writeAuthSnapshot(snap(null))).not.toThrow();
    expect(() => clearAuthSnapshot()).not.toThrow();
  });
});
