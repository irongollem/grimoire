import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import CampaignPrepDialog, { type PrepProposal, type PrepTransport } from "./CampaignPrepDialog.vue";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const QUICKSAND: PrepProposal = { kind: "hazard", name: "Quicksand", why: "The marsh crossing.", description: "A sucking bog.", save: "STR", dc: 12 };
const KEY: PrepProposal = { kind: "item", name: "Brass Winding Key", why: "The Locked Workshop turns on it.", description: "A heavy key.", item_type: "gear", rarity: "mundane" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mountPrep(transport: PrepTransport) {
  return mount(CampaignPrepDialog, {
    props: { open: true, campaignId: "c1", transport },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]], stubs: { teleport: true } },
    attachTo: document.body,
  });
}
const find = (testid: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

// Each test mounts onto the page itself: the last one's dialog must not answer the next one's lookups.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("CampaignPrepDialog", () => {
  // The maintainer's rule for anything made in bulk: the whole list is shown first. Bug caught: reading the
  // campaign already making the records; or the list made whole although something was unticked.
  it("shows the whole list first and makes only what stays ticked", async () => {
    const transport = vi.fn<PrepTransport>(async (body) => (body.action === "propose" ? json(200, { proposals: [QUICKSAND, KEY], credits: 1 }) : json(200, { made: ["Brass Winding Key"], skipped: [] })));
    mountPrep(transport);
    find("prep-read")!.click();
    await flushPromises();
    expect(transport.mock.calls.map((c) => c[0].action)).toEqual(["propose"]);
    expect(find("prep-proposal-0")!.textContent).toContain("Quicksand");
    expect(find("prep-proposal-0")!.textContent).toContain("STR saving throw, DC 12");
    find("prep-proposal-0")!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flushPromises();
    expect(find("prep-make")!.textContent).toContain("Make 1 of 2");
    find("prep-make")!.click();
    await flushPromises();
    expect(transport.mock.calls[1][0]).toEqual({ action: "create", campaignId: "c1", proposals: [KEY] });
    expect(find("prep-made")!.textContent).toContain("Brass Winding Key");
  });

  // Bug caught: an empty list shown as an empty box with a "Make all 0" button, or a refusal swallowed.
  it("says so when nothing is missing, and says why when the campaign could not be read", async () => {
    mountPrep(vi.fn<PrepTransport>(async () => json(200, { proposals: [], credits: 1 })));
    find("prep-read")!.click();
    await flushPromises();
    expect(find("prep-none")).not.toBeNull();
    expect(find("prep-make")).toBeNull();
    document.body.innerHTML = "";
    mountPrep(vi.fn<PrepTransport>(async () => json(402, { error: "insufficient_credits" })));
    find("prep-read")!.click();
    await flushPromises();
    expect(find("prep-problem")!.textContent).toContain("out of credits");
  });

  // Bug caught: what could not be made (a plan's limit) dropped without a word, so the DM believes it exists.
  it("names what was not made and why", async () => {
    const transport = vi.fn<PrepTransport>(async (body) => (body.action === "propose" ? json(200, { proposals: [QUICKSAND], credits: 1 }) : json(200, { made: [], skipped: [{ name: "Quicksand", reason: "Your plan's limit is reached." }] })));
    mountPrep(transport);
    find("prep-read")!.click();
    await flushPromises();
    find("prep-make")!.click();
    await flushPromises();
    expect(find("prep-skipped")!.textContent).toContain("Your plan's limit is reached.");
    expect(find("prep-made")!.textContent).toContain("Nothing was made");
  });
});
