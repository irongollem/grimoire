import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Tonight } from "@/lib/canon/canonTonight";

const empty: Tonight = { lore: [], clues: [], forces: [], threads: [], tableUnreviewed: 0 };
const plan = ref<Tonight | null>(empty);
const proposals = ref<unknown[] | undefined>([]);
const cadence = ref<unknown>(null);

vi.mock("@/composables/canon/useTonight", () => ({ useTonight: () => ({ plan }) }));
vi.mock("@/composables/calendar/useScheduling", () => ({
  useSessionProposals: () => ({ data: proposals }),
  useSessionCadence: () => ({ data: cadence }),
}));
vi.mock("@/composables/calendar/useLocalToday", () => ({ useLocalToday: () => ref("2026-11-24") }));

import CanonNextSession from "./CanonNextSession.vue";

const stubs = { AppButton: { props: ["label", "to"], template: "<a data-testid='prepare'>{{ label }}</a>" } };
const mountCard = () => mount(CanonNextSession, { global: { stubs } });
const item = { passageId: "p", passageTitle: "t", entryId: "e", entryTitle: "E", tellTo: null };
const clue = { clueId: "c", title: "t", secretId: "s", secretTitle: "S" };

describe("CanonNextSession", () => {
  beforeEach(() => {
    plan.value = empty;
    proposals.value = [];
    cadence.value = null;
  });

  // Bug caught: a card with a "Prepare" button and no lines drawing under the contents of a canon with nothing waiting.
  it("renders nothing when nothing is waiting or the reads are still loading", () => {
    expect(mountCard().find("[data-testid=canon-next-session]").exists()).toBe(false);
    plan.value = null;
    expect(mountCard().find("[data-testid=canon-next-session]").exists()).toBe(false);
  });

  // Bug caught: counting groups instead of the passages and clues inside them (two places hold three items).
  it("counts the items inside the groups and names a force one tick from its next step", () => {
    plan.value = {
      ...empty,
      lore: [{ at: null, items: [item, item] }],
      clues: [{ at: null, items: [clue] }, { at: { location_id: "l", npc_id: null, quest_beat_id: null }, items: [clue, clue] }],
      forces: [{ entryId: "f", title: "The Guild", nextStep: "Raid", clock: { filled: 3, size: 4, full: false } }],
    };
    const lines = mountCard().findAll("[data-testid=next-session-line]").map((l) => l.text());
    expect(lines).toEqual(["2 lore passages to tell", "3 clues not yet found", "The Guild is one tick from its next step"]);
  });

  // Bug caught: a planned evening's date lost, or a date drawn when no session is planned.
  it("shows the date of the next planned session, and none when nothing is planned", () => {
    plan.value = { ...empty, lore: [{ at: null, items: [item] }] };
    expect(mountCard().find("[data-testid=next-session-date]").exists()).toBe(false);
    proposals.value = [
      { id: "x", proposed_date: "2026-11-27", proposed_time: "19:00", duration_minutes: 180, title: "Game", notes: null, status: "confirmed", min_attendance: 1 },
    ];
    const w = mountCard();
    expect(w.find("[data-testid=next-session-date]").text()).toContain("27 November");
  });
});
