import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PeopleWaitingPane from "@/components/player/people/PeopleWaitingPane.vue";

// The pane stands beside the ledger from lg up while nobody is selected. With
// people waiting in New to you it counts them; with none, everyone met has been
// filtered out of the ledger, and it says so instead of inviting a turn.
describe("PeopleWaitingPane", () => {
  it.each([
    [12, "12 people to meet"],
    [1, "1 person to meet"],
    [0, "No one matches your filters"],
  ])("with %i waiting, heads the pane '%s'", (count, heading) => {
    const w = mount(PeopleWaitingPane, { props: { count } });
    expect(w.find("h2").text()).toBe(heading);
  });

  it("shows the waiting deck only while someone is waiting", () => {
    expect(mount(PeopleWaitingPane, { props: { count: 3 } }).findAll("img")).toHaveLength(3);
    expect(mount(PeopleWaitingPane, { props: { count: 0 } }).findAll("img")).toHaveLength(0);
  });
});
