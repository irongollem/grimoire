import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestRunPath from "./QuestRunPath.vue";

describe("QuestRunPath", () => {
  it("labels a played move with its own kind", () => {
    const wrapper = mount(QuestRunPath, {
      props: { path: [{ id: "t1", kind: "forward", to_beat_title: "The Drowned Vault" }] },
    });
    // The badge text is the raw kind ("forward"); CSS `uppercase` renders it
    // capitalized on screen without changing the DOM text content.
    expect(wrapper.text()).toContain("forward");
    expect(wrapper.text()).not.toContain("Recorded");
  });

  // #796: a backfilled arrival must read as recorded, not as a move the party
  // made — the whole point of asserting is that the audit trail stays honest
  // about which rows happened at the table.
  it("visibly distinguishes an asserted arrival from a played one", () => {
    const wrapper = mount(QuestRunPath, {
      props: { path: [{ id: "t1", kind: "assert", to_beat_title: "The Drowned Vault", reason: "Session 4 recap" }] },
    });
    const badge = wrapper.findAll("span").find((span) => span.text() === "Recorded")!;
    expect(badge).toBeTruthy();
    expect(badge.classes().join(" ")).toContain("tone-caution");
    expect(wrapper.text()).not.toContain("ASSERT");
  });
});
