import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestSelectedBeatPanel from "./QuestSelectedBeatPanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const beat = {
  id: "beat-1", quest_id: "quest-1", title: "The Vault", kind: "combat", visibility: "hidden",
} as QuestBeat;

function mountPanel(staging: InstanceType<typeof QuestSelectedBeatPanel>["$props"]["staging"]) {
  return mount(QuestSelectedBeatPanel, {
    props: { beat, staging },
    global: { stubs: { RouterLink: RouterLinkStub } },
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
