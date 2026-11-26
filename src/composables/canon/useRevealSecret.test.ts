import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
const party = ref<{ id: string }[] | undefined>([{ id: "pm1" }, { id: "pm2" }]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
const session = ref<{ id: string } | null>({ id: "sess1" });
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));

import { useRevealSecret } from "./useRevealSecret";

describe("useRevealSecret", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    party.value = [{ id: "pm1" }, { id: "pm2" }];
    session.value = { id: "sess1" };
  });

  // Bug caught: the secret was stamped revealed but shared with some or none of the party, so a player never read it.
  it("reveals to every party member and stamps the time", () => {
    expect(useRevealSecret().revealSecret("s1")).toBe(true);
    const call = mocks.update.mock.calls[0]![0] as { id: string; patch: { revealed_at: string; player_visible_to: string[] } };
    expect(call.id).toBe("s1");
    expect(call.patch.player_visible_to).toEqual(["pm1", "pm2"]);
    expect(Number.isNaN(Date.parse(call.patch.revealed_at))).toBe(false);
  });

  // Bug caught: revealing before the party loaded wrote an empty audience, sharing the secret with nobody, silently.
  it("writes nothing while the party has not loaded", () => {
    party.value = undefined;
    const { ready, revealSecret } = useRevealSecret();
    expect(ready.value).toBe(false);
    expect(revealSecret("s1")).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // Bug caught (#1258 item 23): "Reveal to…" shared with the whole party instead of the members chosen.
  it("reveals only to the members chosen, stamping the open session", () => {
    expect(useRevealSecret().revealSecret("s1", ["pm2"])).toBe(true);
    const { patch } = mocks.update.mock.calls[0]![0] as { patch: { player_visible_to: string[]; revealed_session_id: string | null } };
    expect(patch.player_visible_to).toEqual(["pm2"]);
    expect(patch.revealed_session_id).toBe("sess1");
  });

  // Bug caught: no session running wrote a made-up session id (or failed the write) instead of null, as a Found clue does.
  it("stamps no session when none is running", () => {
    session.value = null;
    useRevealSecret().revealSecret("s1");
    expect((mocks.update.mock.calls[0]![0] as { patch: { revealed_session_id: string | null } }).patch.revealed_session_id).toBeNull();
  });

  // Bug caught: an empty choice stamped the secret revealed with an audience of nobody, so the DM saw "revealed" and no player read it.
  it("writes nothing when no one is chosen", () => {
    expect(useRevealSecret().revealSecret("s1", [])).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  // Bug caught (#1279 item 4): widening restamped the time and session, or dropped members who already had it.
  it("widens a reveal by writing only the union of readers", () => {
    expect(useRevealSecret().widenReveal("s1", ["pm1"], ["pm1", "pm2"])).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({ id: "s1", patch: { player_visible_to: ["pm1", "pm2"] } });
  });

  // Bug caught: unticking someone in the widen picker took them off the secret.
  it("never takes a reader off", () => {
    useRevealSecret().widenReveal("s1", ["pm1", "pm2"], ["pm3"]);
    expect((mocks.update.mock.calls[0]![0] as { patch: { player_visible_to: string[] } }).patch.player_visible_to).toEqual(["pm1", "pm2", "pm3"]);
  });

  // Bug caught: a widen that adds no one still wrote.
  it("writes nothing when no one new is added", () => {
    expect(useRevealSecret().widenReveal("s1", ["pm1"], ["pm1"])).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
