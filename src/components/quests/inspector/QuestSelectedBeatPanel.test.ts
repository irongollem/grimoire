import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestSelectedBeatPanel from "./QuestSelectedBeatPanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const beat = {
  id: "beat-1", quest_id: "quest-1", title: "The Vault", kind: "combat", visibility: "hidden",
} as QuestBeat;

function mountPanel(staging: InstanceType<typeof QuestSelectedBeatPanel>["$props"]["staging"], extra: Partial<InstanceType<typeof QuestSelectedBeatPanel>["$props"]> = {}) {
  return mount(QuestSelectedBeatPanel, {
    props: { beat, staging, ...extra },
    global: { stubs: { RouterLink: RouterLinkStub, QuestConvergeControl: true } },
  });
}

function linkTargets(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAllComponents(RouterLinkStub).map((link) => [link.text(), link.props("to")]);
}

// The summary beside the story flow links where a beat happens, so the DM can
// reach the site without opening the beat first.
describe("QuestSelectedBeatPanel — where the beat happens", () => {
  it("links the site and the room when the beat is staged in a room", () => {
    const wrapper = mountPanel({ locationId: "room-6", name: "The Vault", siteId: "site-1", siteName: "The Locked Workshop" });
    expect(linkTargets(wrapper)).toEqual(expect.arrayContaining([
      ["The Locked Workshop", "/locations?at=site-1"],
      ["The Vault", "/locations?at=room-6"],
    ]));
  });

  it("links just the place when the beat is staged somewhere that is not a room", () => {
    const wrapper = mountPanel({ locationId: "inn-1", name: "The Pulled Sugar Inn", siteId: null, siteName: null });
    const targets = linkTargets(wrapper);
    expect(targets).toEqual(expect.arrayContaining([["The Pulled Sugar Inn", "/locations?at=inn-1"]]));
    expect(wrapper.text()).not.toContain("›");
  });

  it("shows no place at all for a beat staged nowhere", () => {
    const wrapper = mountPanel(null);
    expect(linkTargets(wrapper).some(([, to]) => String(to).startsWith("/locations?at="))).toBe(false);
  });
});

describe("QuestSelectedBeatPanel — header and chips", () => {
  const presentation = (over: Record<string, unknown> = {}) => ({
    prepGapCount: 0, prepGaps: [], handoutCount: 0, loot: { total: 0, undispatched: 0, unclaimed: 0 },
    isReady: true, isCurrent: false, isVisited: false, isDisconnected: false, reach: "ahead", currentThreadIds: [],
    payoffCount: 0, unlocksQuest: false, convergeLabel: null, site: null, ...over,
  }) as never;

  it("opens the beat page, handing it the way back to this beat in the story flow", () => {
    const link = mountPanel(null).findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Open beat")!;
    expect(link.props("to")).toEqual({
      path: "/quests/quest-1/beats/beat-1",
      query: { returnTo: "/quests/quest-1?view=work&beat=beat-1" },
    });
  });

  it("names a beat without a title, and states its kind and visibility", () => {
    const wrapper = mount(QuestSelectedBeatPanel, { props: { beat: { ...beat, title: "" } }, global: { stubs: { RouterLink: RouterLinkStub, QuestConvergeControl: true } } });
    expect(wrapper.text()).toContain("Untitled beat");
    expect(wrapper.text()).toContain("hidden");
  });

  it("asks for a player preview exactly once per click", async () => {
    const wrapper = mountPanel(null);
    await wrapper.findAllComponents({ name: "AppButton" })[0]!.trigger("click");
    expect(wrapper.emitted("preview")).toHaveLength(1);
  });

  it("counts prep gaps and held loot, singular and plural; a beat with loot only dispatched shows none", () => {
    expect(mountPanel(null, { presentation: presentation({ prepGapCount: 1 }) }).text()).toContain("1 prep gap");
    expect(mountPanel(null, { presentation: presentation({ prepGapCount: 1 }) }).text()).not.toContain("1 prep gaps");
    expect(mountPanel(null, { presentation: presentation({ prepGapCount: 3 }) }).text()).toContain("3 prep gaps");
    expect(mountPanel(null, { presentation: presentation({ loot: { total: 5, undispatched: 2, unclaimed: 0 } }) }).text()).toContain("2 loot held");
    expect(mountPanel(null, { presentation: presentation({ loot: { total: 5, undispatched: 0, unclaimed: 5 } }) }).text()).not.toContain("loot held");
  });

  it("links a staged room under its site only when the site has a name", () => {
    const wrapper = mountPanel({ locationId: "room-6", name: "The Vault", siteId: "site-1", siteName: null });
    expect(linkTargets(wrapper).map(([, to]) => String(to)).filter((to) => to.startsWith("/locations"))).toEqual(["/locations?at=room-6"]);
  });
});
