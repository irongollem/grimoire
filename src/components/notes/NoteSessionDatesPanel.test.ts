import { mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import type { Note, NoteSessionDates } from "@/types/notes.types";

import type { CampaignSession } from "@/types/session.types";

const allNotes = ref<Note[] | undefined>(undefined);
const log = ref<CampaignSession[] | undefined>(undefined);

vi.mock("@/composables/notes/useNotes", () => ({ useNotes: () => ({ data: allNotes }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: log }) }));
vi.mock("@/stores/calendar", () => ({
  useCalendarStore: () => ({ adapter: { months: [{ num: 1, name: "Hammer" }] } }),
}));

import NoteSessionDatesPanel from "./NoteSessionDatesPanel.vue";

function sessionNote(over: Partial<Note>): Note {
  return {
    id: "n", user_id: "u", campaign_id: "c", title: "t", content: null,
    category: "session", tags: [], session_id: null, is_pinned: false, player_visible_to: [],
    session_start_year: null, session_start_month: null, session_start_day: null,
    session_end_year: null, session_end_month: null, session_end_day: null,
    session_real_date: null, linked_calendar_event_id: null, sort_order: null,
    created_at: "", updated_at: "", ...over,
  };
}

function logged(id: string, playedOn: string, over: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id, campaign_id: "c", user_id: "u", number: null, title: null, played_on: playedOn,
    started_at: null, ended_at: null, created_at: `${playedOn}T00:00:00Z`, updated_at: "", ...over,
  };
}

const LOG = [
  // Numbered out of order on purpose: the number is a label, the date is the order.
  logged("s-old", "2026-01-01", { number: 9 }),
  logged("s-new", "2026-02-01", { number: 2 }),
];

const EMPTY: NoteSessionDates = {
  startYear: null, startMonth: null, startDay: null,
  endYear: null, endMonth: null, endDay: null, realDate: null,
};

function mountPanel(dates: NoteSessionDates, isNewNote = true) {
  const model = ref<NoteSessionDates>({ ...dates });
  const wrapper = mount(NoteSessionDatesPanel, {
    props: {
      modelValue: model.value,
      "onUpdate:modelValue": (v: NoteSessionDates) => { model.value = v; },
      isNewNote,
      linkedCalendarEventId: null,
    },
    global: { stubs: { VueDatePicker: true } },
  });
  return { model, wrapper };
}

const PRIOR = [
  sessionNote({ id: "n1", session_id: "s-old", session_start_year: 1490, session_end_year: 1491, session_end_month: 2, session_end_day: 9 }),
  sessionNote({ id: "n2", session_id: "s-new", session_start_year: 1492, session_start_month: 3, session_start_day: 4 }),
];

beforeEach(() => {
  allNotes.value = undefined;
  log.value = LOG;
});

describe("NoteSessionDatesPanel — prefill from the last session", () => {
  it("still prefills when the notes query resolves after mount", async () => {
    // The regression this exists for: `useNotes()` is called here rather than
    // in NoteEditor, so on a cold cache the data is not there at mount. A
    // one-shot read would silently skip the prefill — which is what landing
    // straight on /notes/new from the dashboard does.
    const { model } = mountPanel(EMPTY);
    expect(model.value.startYear).toBeNull();

    allNotes.value = PRIOR;
    await nextTick();

    // The newest session in the log (numbered 2, not 9) has no end date, so its start date is used.
    expect(model.value.startYear).toBe(1492);
    expect(model.value.startMonth).toBe(3);
    expect(model.value.startDay).toBe(4);
  });

  it("waits for the session log too", async () => {
    log.value = undefined;
    const { model } = mountPanel(EMPTY);
    allNotes.value = PRIOR;
    await nextTick();
    expect(model.value.startYear).toBeNull();

    log.value = LOG;
    await nextTick();
    expect(model.value.startYear).toBe(1492);
  });

  it("skips a session that is still running", async () => {
    log.value = [LOG[0], { ...LOG[1], started_at: "2026-02-01T18:00:00Z", ended_at: null }];
    const { model } = mountPanel(EMPTY);
    allNotes.value = PRIOR;
    await nextTick();
    expect(model.value.startYear).toBe(1491);
  });

  it("prefers the last session's end date over its start date", async () => {
    const { model } = mountPanel(EMPTY);
    allNotes.value = [PRIOR[0]];
    await nextTick();
    expect(model.value.startYear).toBe(1491);
    expect(model.value.startDay).toBe(9);
  });

  it("prefills immediately when the cache is already warm", async () => {
    allNotes.value = PRIOR;
    const { model } = mountPanel(EMPTY);
    await nextTick();
    expect(model.value.startYear).toBe(1492);
  });

  it("never overwrites an existing note's dates", async () => {
    const { model } = mountPanel(EMPTY, false);
    allNotes.value = PRIOR;
    await nextTick();
    expect(model.value.startYear).toBeNull();
  });

  it("leaves a date the DM already set alone", async () => {
    const { model } = mountPanel({ ...EMPTY, startYear: 1400 });
    allNotes.value = PRIOR;
    await nextTick();
    expect(model.value.startYear).toBe(1400);
  });

  it("does not re-prefill on a refetch after the DM clears the date", async () => {
    const { model } = mountPanel(EMPTY);
    allNotes.value = PRIOR;
    await nextTick();
    expect(model.value.startYear).toBe(1492);

    model.value.startYear = null; // the DM deliberately empties it
    allNotes.value = [...PRIOR];  // a refetch lands
    await nextTick();
    expect(model.value.startYear).toBeNull();
  });
});
