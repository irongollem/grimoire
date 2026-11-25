import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({ adopt: vi.fn(), letBe: vi.fn() }));
const requests = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonLineRequests", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonLineRequests")>()),
  useCampaignLineRequests: () => ({ data: requests }),
  useLineRequestActions: () => ({ adopt: mocks.adopt, letBe: mocks.letBe }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "pm1", name: "Mira" }]) }) }));

import LineRequestInbox from "./LineRequestInbox.vue";

const request = (over: Record<string, unknown>) => ({ id: "r1", kind: "line", body: "No harm to animals", asked_by: null, adopted_entry_id: null, dismissed_at: null, ...over });
const mountIt = () => mount(LineRequestInbox, { props: { sortOrder: 2 } });

describe("LineRequestInbox", () => {
  beforeEach(() => {
    mocks.adopt.mockReset();
    mocks.letBe.mockReset();
    requests.value = [request({})];
  });

  // Bug caught (#1279 item 29): an answered request listed again, or the block drawn empty.
  it("lists only open requests, with the count, and is not drawn when none are open", () => {
    requests.value = [request({ id: "a", adopted_entry_id: "e" }), request({ id: "b", dismissed_at: "2026-11-02T00:00:00Z" })];
    expect(mountIt().find("[data-testid=line-requests]").exists()).toBe(false);
    requests.value.push(request({ id: "c" }), request({ id: "d", kind: "veil" }));
    const w = mountIt();
    expect(w.findAll("[data-testid=line-request-row]")).toHaveLength(2);
    expect(w.text()).toContain("(2)");
  });

  // Bug caught: an unsigned request showing a character (the anonymity promise), or a signed one showing none.
  it("names the character only when the request was signed", () => {
    expect(mountIt().find("[data-testid=line-request-by]").exists()).toBe(false);
    requests.value = [request({ asked_by: "pm1" })];
    expect(mountIt().get("[data-testid=line-request-by]").text()).toContain("Mira");
  });

  // Bug caught: Add as a veil handing the DM a line, or losing the place in the list.
  it("adds the request as its own kind at the end of the list", async () => {
    requests.value = [request({ kind: "veil" })];
    const w = mountIt();
    expect(w.get("[data-testid=line-request-add]").text()).toContain("Add as a veil");
    await w.get("[data-testid=line-request-add]").trigger("click");
    expect(mocks.adopt).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", kind: "veil" }), 2);
    expect(mocks.letBe).not.toHaveBeenCalled();
  });

  // Bug caught: Let it be also adding the entry.
  it("lets it be without adding", async () => {
    await mountIt().get("[data-testid=line-request-let-be]").trigger("click");
    expect(mocks.letBe).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
    expect(mocks.adopt).not.toHaveBeenCalled();
  });
});
