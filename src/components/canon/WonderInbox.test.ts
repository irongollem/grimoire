import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({ takeUp: vi.fn(), letBe: vi.fn() }));
const wonders = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonWonders", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonWonders")>()),
  useCampaignWonders: () => ({ data: wonders }),
  useWonderActions: () => ({ takeUp: mocks.takeUp, letBe: mocks.letBe }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "pm1", name: "Mira" }]) }) }));

import WonderInbox from "./WonderInbox.vue";

const wonder = (over: Record<string, unknown>) => ({
  id: "w1", party_member_id: "pm1", body: "Who sank the mill?", adopted_entry_id: null, dismissed_at: null, ...over,
});
const mountIt = () => mount(WonderInbox, { props: { sortOrder: 3 } });

describe("WonderInbox", () => {
  beforeEach(() => {
    mocks.takeUp.mockReset();
    mocks.letBe.mockReset();
    wonders.value = [wonder({})];
  });

  // Bug caught (#1258 item 24): the block was drawn with nothing in it (or listed answered wonders), cluttering the
  // open questions the DM came to read.
  it("is not drawn when no wonder is open, and lists only the open ones", () => {
    wonders.value = [wonder({ id: "a", adopted_entry_id: "q1" }), wonder({ id: "b", dismissed_at: "2026-11-02T00:00:00Z" })];
    expect(mountIt().find("[data-testid=player-wonders]").exists()).toBe(false);
    wonders.value.push(wonder({ id: "c", body: "Where does the river go?" }));
    const w = mountIt();
    expect(w.findAll("[data-testid=wonder-row]")).toHaveLength(1);
    expect(w.text()).toContain("Where does the river go?");
    expect(w.text()).toContain("Mira");
  });

  // Bug caught: Take it up handed the wonder to the wrong row or lost where the question should sit in the list.
  it("takes the wonder up at the end of the list", async () => {
    await mountIt().get("[data-testid=wonder-take-up]").trigger("click");
    expect(mocks.takeUp).toHaveBeenCalledWith(expect.objectContaining({ id: "w1", body: "Who sank the mill?" }), 3);
    expect(mocks.letBe).not.toHaveBeenCalled();
  });

  // Bug caught: Let it be also took the wonder up, so a dismissed wonder became a question.
  it("lets the wonder be without taking it up", async () => {
    await mountIt().get("[data-testid=wonder-let-be]").trigger("click");
    expect(mocks.letBe).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
    expect(mocks.takeUp).not.toHaveBeenCalled();
  });
});
