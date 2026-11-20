import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const notes = ref<Array<Record<string, unknown>>>([]);

vi.mock("@/composables/notes/useNotes", () => ({
  useNotes: () => ({ data: notes, isLoading: ref(false) }),
  useReorderNotes: () => ({ mutate: vi.fn() }),
  useUpdateNote: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true), quota: ref(null) }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useListLayout", () => ({ useListLayout: () => ref("rows") }));
vi.mock("@/composables/useGridColumns", () => ({ useBreakpointColumns: () => ref(1) }));

import NotesList from "./NotesList.vue";

const note = (id: string, session_id: string | null) => ({
  id, title: id, session_id, tags: [], is_pinned: false, player_visible_to: [], content: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", sort_order: null,
});

describe("NotesList", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("lists the DM's own notes and leaves out a session's chronicle entry", () => {
    // Fails if a note linked to a session still shows among the DM's notes (it is read on the Canon page).
    notes.value = [note("loose", null), note("recap", "s1")];
    const w = mount(NotesList, {
      global: {
        stubs: {
          NoteSortingSection: true, NoteRow: { props: ["note"], template: '<li class="row">{{ note.id }}</li>' },
          NoteCard: true, EntityCollection: { props: ["items"], template: '<ul><slot name="row" v-for="item in items" :item="item" /></ul>' },
          ListFilterBar: { template: "<div><slot /></div>" }, ListSearchInput: true, SortControl: true, ListSkeleton: true,
          EmptyState: true, PaywallModal: true, VueDraggable: true,
        },
      },
    });
    expect(w.findAll(".row").map((r) => r.text())).toEqual(["loose"]);
    expect(w.text()).toContain("1 of 1 notes");
  });
});
