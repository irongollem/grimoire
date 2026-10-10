import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({ activeCampaignId: "camp-1" as string | null }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() { return mocks.activeCampaignId; },
  }),
}));

const { default: BulkScopeBar } = await import("./BulkScopeBar.vue");

describe("BulkScopeBar", () => {
  it("renders the selected count in an aria-live region", () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 3, campaignName: "Curse of Strahd", selectableCount: 1 } });
    const live = wrapper.get("[aria-live='polite']");
    expect(live.text()).toContain("3 selected");
  });

  it("emits select-all when its button is clicked", async () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 0, campaignName: "Curse of Strahd", selectableCount: 1 } });
    const selectAllBtn = wrapper.findAll("button").find((b) => b.text().includes("Select all shown"));
    await selectAllBtn?.trigger("click");
    expect(wrapper.emitted("select-all")).toBeTruthy();
  });

  it("emits move with the active campaign id for 'Move to {campaignName}'", async () => {
    mocks.activeCampaignId = "camp-1";
    const wrapper = mount(BulkScopeBar, { props: { count: 2, campaignName: "Curse of Strahd", selectableCount: 1 } });
    const moveBtn = wrapper.findAll("button").find((b) => b.text().includes("Move to Curse of Strahd"));
    await moveBtn?.trigger("click");
    expect(wrapper.emitted("move")).toEqual([["camp-1"]]);
  });

  it("emits move with null for 'Make available in all campaigns'", async () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 2, campaignName: "Curse of Strahd", selectableCount: 1 } });
    const allBtn = wrapper.findAll("button").find((b) => b.text().includes("Make available in all campaigns"));
    await allBtn?.trigger("click");
    expect(wrapper.emitted("move")).toEqual([[null]]);
  });

  it("disables the move-to-campaign button when there is no active campaign", () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 2, campaignName: null, selectableCount: 1 } });
    const moveBtn = wrapper.findAll("button").find((b) => b.text().includes("Move to campaign"));
    expect(moveBtn?.attributes("disabled")).toBeDefined();
  });

  it("emits stop and clear from their respective buttons", async () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 1, campaignName: "Curse of Strahd", selectableCount: 1 } });
    const clearBtn = wrapper.findAll("button").find((b) => b.text().includes("Clear"));
    await clearBtn?.trigger("click");
    expect(wrapper.emitted("clear")).toBeTruthy();

    const doneBtn = wrapper.findAll("button").find((b) => b.text().includes("Done"));
    await doneBtn?.trigger("click");
    expect(wrapper.emitted("stop")).toBeTruthy();
  });

  // A list whose every visible row is shared-library content can select
  // nothing; the bar says so rather than offering moves that cannot apply.
  it("replaces the actions with an explanation when nothing on screen is selectable", () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 0, campaignName: "Icewind Dale", selectableCount: 0 } });
    expect(wrapper.text()).toContain("Nothing here can be moved");
    const labels = wrapper.findAllComponents({ name: "AppButton" }).map((b) => b.props("label"));
    expect(labels).not.toContain("Select all shown");
    expect(labels.some((l) => typeof l === "string" && l.startsWith("Move to"))).toBe(false);
    expect(labels).toContain("Done");
  });
});

describe("allowGeneralScope (#885)", () => {
  it("still offers 'Make available in all campaigns' by default, for the eight existing callers", () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 2, campaignName: "Curse of Strahd", selectableCount: 1 } });
    expect(wrapper.findAll("button").some((b) => b.text().includes("Make available in all campaigns"))).toBe(true);
  });

  it("hides 'Make available in all campaigns' when allowGeneralScope is false", () => {
    const wrapper = mount(BulkScopeBar, {
      props: { count: 2, campaignName: "Curse of Strahd", selectableCount: 1, allowGeneralScope: false },
    });
    expect(wrapper.findAll("button").some((b) => b.text().includes("Make available in all campaigns"))).toBe(false);
    // Move-to-campaign and Copy stay unaffected — only the general scope is suppressed.
    expect(wrapper.findAll("button").some((b) => b.text().includes("Move to Curse of Strahd"))).toBe(true);
    expect(wrapper.findAll("button").some((b) => b.text().includes("Copy to campaign"))).toBe(true);
  });
});

describe("copy to campaign (#598)", () => {
  it("offers Copy alongside Move, and emits without naming a target — the dialog picks one", async () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 3, campaignName: "Icewind Dale", selectableCount: 1 } });
    const copy = wrapper.findAll("button").find((b) => b.text().includes("Copy to campaign"));
    expect(copy).toBeTruthy();
    await copy!.trigger("click");
    // No payload: unlike `move`, which means "the active campaign or general",
    // the copy target is chosen in the dialog the caller opens.
    expect(wrapper.emitted("copy")).toEqual([[]]);
  });

  it("hides Copy when nothing on screen can be acted on at all", () => {
    const wrapper = mount(BulkScopeBar, { props: { count: 0, campaignName: "Icewind Dale", selectableCount: 0 } });
    expect(wrapper.findAll("button").some((b) => b.text().includes("Copy to campaign"))).toBe(false);
  });
});
