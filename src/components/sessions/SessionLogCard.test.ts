import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { Note } from "@/types/notes.types";
import SessionLogCard from "@/components/sessions/SessionLogCard.vue";
import type { CampaignSession } from "@/types/session.types";

// The chronicle line reads the party, the canon and the learned list; its own test covers it.
vi.mock("@/components/sessions/SessionChronicleLine.vue", () => ({ default: { template: "<div />" } }));
const NOTE = { id: "n1" } as Note;
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

function mountCard(row: CampaignSession, hasNote: boolean) {
  return mount(SessionLogCard, {
    props: { session: row, facts: { people: 2, encounters: 1 }, note: hasNote ? NOTE : null },
    ...routerStub,
  });
}

describe("SessionLogCard", () => {
  it("shows the same number, title and meta as the row", () => {
    const wrapper = mountCard(session(), true);
    expect(wrapper.text()).toContain("Session 14");
    expect(wrapper.text()).toContain("Into the Mere");
    expect(wrapper.text()).toContain("3h 40m · 2 people met · 1 encounter");
    expect(wrapper.text()).toContain("Recap written");
  });

  it("offers Write notes and emits write when there is no recap", async () => {
    const wrapper = mountCard(session(), false);
    await wrapper.findAll("button").find((b) => b.text() === "Write notes")?.trigger("click");
    expect(wrapper.emitted("write")).toHaveLength(1);
  });

  // Bug caught: the Chronicler draft reachable only from the notes page, so a session in the log could not be started from it.
  it("offers Draft with the Chronicler beside Write notes, and emits draft", async () => {
    const wrapper = mountCard(session(), false);
    await wrapper.findAll("button").find((b) => b.text() === "Draft with the Chronicler")?.trigger("click");
    expect(wrapper.emitted("draft")).toHaveLength(1);
  });

  it("names an untitled session by its number, and an unnumbered one as untitled", () => {
    expect(mountCard(session({ title: null }), true).text()).toContain("Session 14");
    const unnumbered = mountCard(session({ title: null, number: null }), true);
    expect(unnumbered.text()).toContain("Untitled session");
    expect(unnumbered.text()).toContain("Number it");
  });
});
