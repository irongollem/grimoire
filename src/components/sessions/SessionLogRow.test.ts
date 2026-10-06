import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SessionLogRow from "@/components/sessions/SessionLogRow.vue";
import type { CampaignSession } from "@/types/session.types";

// AppButton and the title link render real RouterLinks, which need an injected
// router; a stub keeps the test about the row.
const routerStub = { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } };

function session(over: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id: "s1",
    campaign_id: "c",
    user_id: "u",
    number: 14,
    title: "Into the Mere",
    played_on: null,
    started_at: "2026-10-04T19:30:00Z",
    ended_at: "2026-10-04T23:10:00Z",
    created_at: "2026-10-04T19:30:00Z",
    updated_at: "2026-10-04T23:10:00Z",
    ...over,
  };
}

function mountRow(row: CampaignSession, hasNote: boolean, facts = { people: 2, encounters: 1 }) {
  return mount(SessionLogRow, { props: { session: row, facts, hasNote }, ...routerStub });
}

describe("SessionLogRow", () => {
  it("shows the number, title and meta of a played session", () => {
    const wrapper = mountRow(session(), true);
    expect(wrapper.text()).toContain("Session 14");
    expect(wrapper.text()).toContain("Into the Mere");
    expect(wrapper.text()).toContain("3h 40m · 2 people met · 1 encounter");
  });

  it("says a recap is written when a note links to it, with no Write notes button", () => {
    const wrapper = mountRow(session(), true);
    expect(wrapper.text()).toContain("Recap written");
    expect(wrapper.text()).not.toContain("Write notes");
  });

  it("offers Write notes when there is no note, and emits write", async () => {
    const wrapper = mountRow(session(), false);
    expect(wrapper.text()).toContain("No notes yet");
    const write = wrapper.findAll("button").find((b) => b.text() === "Write notes");
    await write?.trigger("click");
    expect(wrapper.emitted("write")).toHaveLength(1);
  });

  it("shows the running session with End instead of a gap", async () => {
    const wrapper = mountRow(session({ ended_at: null }), false);
    expect(wrapper.text()).toContain("Running");
    expect(wrapper.text()).not.toContain("Write notes");
    await wrapper.findAll("button").find((b) => b.text() === "End")?.trigger("click");
    expect(wrapper.emitted("end")).toHaveLength(1);
  });

  it("lets an unnumbered row be numbered or deleted, and a numbered one not", async () => {
    const unnumbered = mountRow(session({ number: null }), true);
    expect(unnumbered.text()).toContain("No number");
    expect(unnumbered.text()).toContain("Number it");
    expect(unnumbered.text()).toContain("Delete");
    expect(mountRow(session(), true).text()).not.toContain("Number it");
    await unnumbered.findAll("button").find((b) => b.text() === "Delete")?.trigger("click");
    expect(unnumbered.emitted("delete")).toHaveLength(1);
  });

  it("says a never-run session predates the log", () => {
    const wrapper = mountRow(session({ started_at: null, ended_at: null }), true, { people: 0, encounters: 0 });
    expect(wrapper.text()).toContain("Played before the log began");
  });
});
