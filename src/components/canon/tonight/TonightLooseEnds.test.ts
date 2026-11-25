import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TonightLooseEnds from "./TonightLooseEnds.vue";
import type { LooseEnd } from "@/lib/canon/canonTonight";

const ends: LooseEnd[] = [{ key: "secret:S1", kind: "secret", title: "The mayor is a ghoul", reasons: ["No clues yet"], entryId: "S1", subjectId: "S1", to: { path: "/canon", query: { entry: "S1" } } }];
const mountEnds = () => mount(TonightLooseEnds, { props: { ends }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href='to.query.entry'><slot /></a>" } } } });

describe("TonightLooseEnds", () => {
  // Bug caught: the block opened by default (crowding tonight's work) or its toggle not opening it.
  it("is folded until the heading is pressed", async () => {
    const w = mountEnds();
    expect(w.get("[data-testid=loose-list]").attributes("style")).toContain("display: none");
    await w.get("[data-testid=loose-toggle]").trigger("click");
    expect(w.get("[data-testid=loose-list]").attributes("style") ?? "").not.toContain("display: none");
  });

  // Bug caught: a row without its reason, or linking somewhere other than its entry.
  it("names each end's reason and links to its entry", () => {
    const w = mountEnds();
    expect(w.get("[data-testid=loose-end]").text()).toContain("Secret: No clues yet");
    expect(w.get("[data-testid=loose-end] a").attributes("href")).toBe("S1");
  });

  // Bug caught: Leave it emitting nothing (or another end), so a loose end the DM means to leave nags for ever.
  it("emits the end for Leave it and the entry for Pin", async () => {
    const w = mount(TonightLooseEnds, { props: { ends }, global: { stubs: { RouterLink: { template: "<a><slot /></a>" }, AppButton: { props: ["label"], template: "<button>{{ label }}</button>" }, TonightPinToggle: { template: "<button data-testid='pin' @click=\"$emit('toggle')\" />" } } } });
    await w.get("[data-testid=loose-leave]").trigger("click");
    expect(w.emitted("leave")?.[0]).toEqual([ends[0]]);
    await w.get("[data-testid=pin]").trigger("click");
    expect(w.emitted("pin")?.[0]).toEqual(["S1"]);
  });
});
