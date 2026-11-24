import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

const canon = vi.hoisted(() => ({ current: { groups: [] as unknown[], total: 0 } }));
vi.mock("@/composables/canon/useSessionCanon", () => ({ useSessionCanon: () => ({ value: () => canon.current }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "m1", name: "Wren" }, { id: "m2", name: "Brakka" }]) }) }));
vi.mock("@/composables/sessions/useSessionLearned", () => ({ useSessionLearned: () => ({ entries: ref([]) }) }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: (y: number) => `year ${y}` } }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a><slot /></a>" } }));

import SessionChronicleLine from "./SessionChronicleLine.vue";

const session = { id: "s1" } as CampaignSession;
const note = (over: Partial<Note> = {}): Note =>
  ({
    id: "n1",
    content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The party followed the lanterns." }] }] }),
    player_visible_to: [],
    session_start_year: 512,
    session_start_month: 3,
    session_start_day: 3,
    ...over,
  }) as Note;

describe("SessionChronicleLine", () => {
  beforeEach(() => {
    canon.current = { groups: [], total: 0 };
  });

  // Bug caught: the chronicle paragraph or its sharing state lost when the Chronicle list was folded into the log.
  it("shows the excerpt, the date in the world and who it is shared with", () => {
    const w = mount(SessionChronicleLine, { props: { session, note: note({ player_visible_to: ["m1", "m2"] }) } });
    expect(w.get("[data-testid=chronicle-excerpt]").text()).toBe("The party followed the lanterns.");
    expect(w.get("[data-testid=chronicle-world-date]").text()).toContain("year 512");
    expect(w.get("[data-testid=chronicle-shared]").text()).not.toBe("Not shared yet");
  });

  // Bug caught: a note nobody can read yet looking shared.
  it("says Not shared yet for a note no player is named on", () => {
    const w = mount(SessionChronicleLine, { props: { session, note: note() } });
    expect(w.get("[data-testid=chronicle-shared]").text()).toBe("Not shared yet");
  });

  // Bug caught: an empty line (padding and a gap) under every session that has nothing to say.
  it("renders nothing for a session with no note, nothing learned and no canon", () => {
    expect(mount(SessionChronicleLine, { props: { session, note: null } }).find("[data-testid=session-chronicle]").exists()).toBe(false);
  });

  // Bug caught: a session's canon changes dropped in the fold.
  it("shows the canon counts when the canon did something that session", () => {
    canon.current = { groups: [{ kind: "clues", label: "Clues found", items: [{ key: "c", title: "A ledger", to: "/x" }] }], total: 1 };
    const w = mount(SessionChronicleLine, { props: { session, note: null } });
    expect(w.get("[data-testid=chronicle-canon-count]").text()).toBe("Clues found 1");
  });
});
