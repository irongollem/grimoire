// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { Note } from "@/types/notes.types";

const mocks = vi.hoisted(() => ({ open: vi.fn(), insertPending: vi.fn(), insertChronicle: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true }));

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/composables/useUnsavedGuard", () => ({ useUnsavedGuard: () => ({ allowLeave: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/ask/useOpenGenerator", () => ({ useOpenGenerator: () => ({ open: mocks.open }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaignId: "camp-1" }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textProvider: ref("openai"), imageProvider: ref("openai") }) }));
vi.mock("@/composables/notes/useNotes", () => ({
  useCreateNote: () => ({ mutateAsync: vi.fn() }), useUpdateNote: () => ({ mutateAsync: vi.fn() }), useDeleteNote: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([]) }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: ref([{ id: "s4", number: 4 }]) }) }));
vi.mock("@/composables/notes/useNoteSession", () => ({ useNoteSession: (id: () => string | null) => ({ get value() { return id() === "s4" ? { number: 4 } : null; } }) }));
vi.mock("@/composables/notes/useNoteCalendarSync", () => ({ useNoteCalendarSync: () => ({ syncSessionCalendarEvent: vi.fn() }) }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({ useDeleteCalendarEvent: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: vi.fn() }));

const { default: NoteEditor } = await import("./NoteEditor.vue");
const { currentNoteSurface } = await import("@/composables/notes/useNoteSurface");

/** The editor, as far as the note needs it: the two toolbar slots, what it inserts, and a click on a scene suggestion. */
const RichTextEditorStub = defineComponent({
  props: { modelValue: { type: String, default: null } },
  emits: ["update:modelValue", "illustrationClick"],
  setup(_props, { slots, expose }) {
    expose({ insertPendingImage: mocks.insertPending, insertChronicleContent: mocks.insertChronicle });
    return () => h("div", { "data-testid": "rte" }, slots["toolbar-end"]?.());
  },
});

const note = (over: Partial<Note> = {}): Note => ({
  id: "n1", title: "The Heist", content: null, session_id: "s4", is_pinned: false, player_visible_to: [], tags: ["heist"], ai_provenance: null, linked_calendar_event_id: null,
  session_start_year: null, session_start_month: null, session_start_day: null, session_end_year: null, session_end_month: null, session_end_day: null, session_real_date: null,
  ...over,
}) as Note;

function mountEditor(n: Note | null) {
  return mount(NoteEditor, {
    props: { note: n },
    global: {
      stubs: {
        RichTextEditor: RichTextEditorStub, InlineCalendarEventModal: true, ChroniclerLibraryPicker: true, NoteSessionDatesPanel: true, NoteSessionPicker: true,
        AudienceRevealControl: true, TagInput: true, PaywallModal: true, DraftConflictNotice: true,
      },
    },
  });
}

const press = (w: ReturnType<typeof mountEditor>, tooltip: string) => w.findAll("button").find((b) => b.attributes("data-tooltip") === tooltip || b.attributes("aria-label") === tooltip || b.attributes("title") === tooltip);

describe("NoteEditor and the Familiar's cards (#1270)", () => {
  beforeEach(() => {
    mocks.open.mockReset();
    mocks.insertPending.mockReset();
    mocks.insertChronicle.mockReset();
    state.aiEnabled = true;
  });

  // Bug caught: the toolbar's Write Chronicle opening a card with no note to write into.
  it("opens the chronicle card with this note as its target, by the name on the editor", async () => {
    const wrapper = mountEditor(note());
    await wrapper.get("input").setValue("The Heist, part two");
    await press(wrapper, "Write Chronicle")?.trigger("click");
    expect(mocks.open).toHaveBeenCalledWith("chronicle", { target: { type: "note", id: "n1", name: "The Heist, part two" } });
  });

  // Bug caught: a card opened from a note not saved yet carried no target, so it wrote into whichever note editor was open later.
  it("binds the cards of a note that is not saved yet to this editor's instance", async () => {
    const wrapper = mountEditor(null);
    const token = currentNoteSurface.value?.instance;
    expect(token).toMatch(/^note-editor:/);
    await press(wrapper, "Write Chronicle")?.trigger("click");
    expect(mocks.open).toHaveBeenCalledWith("chronicle", { target: { type: "note", id: token, name: "This note" } });
    await press(wrapper, "Generate scene illustration")?.trigger("click");
    expect(mocks.open).toHaveBeenLastCalledWith("scene_illustration", { target: { type: "note", id: token, name: "This note" } });
  });

  // Bug caught: the AI switched off but the cards still opening from a stray trigger.
  it("opens nothing while AI is off", async () => {
    state.aiEnabled = false;
    const wrapper = mountEditor(note());
    expect(press(wrapper, "Write Chronicle")).toBeUndefined();
    expect(press(wrapper, "Generate scene illustration")).toBeUndefined();
  });

  // Bug caught: a clicked scene suggestion opening an empty card, so the DM retyped the prompt they were looking at.
  it("opens the scene card on a clicked suggestion with its prompt as the scene", async () => {
    const wrapper = mountEditor(note());
    await wrapper.getComponent(RichTextEditorStub).vm.$emit("illustrationClick", { prompt: "a storm over the keep", pos: 7 });
    expect(mocks.open).toHaveBeenCalledWith("scene_illustration", { target: { type: "note", id: "n1", name: "The Heist" }, concept: "a storm over the keep" });
  });

  // Bug caught: a scene queued from the card landing at the cursor when it was started from a suggestion chip, leaving the chip behind.
  it("puts the first scene from a clicked suggestion in the suggestion's place, and the next at the cursor", async () => {
    const wrapper = mountEditor(note());
    const target = { prompt: "a storm over the keep", pos: 7 };
    await wrapper.getComponent(RichTextEditorStub).vm.$emit("illustrationClick", target);
    const job = { jobId: "j1", prompt: "a storm over the keep", size: "1024x1024" };
    currentNoteSurface.value?.insertScene(job);
    currentNoteSurface.value?.insertScene({ ...job, jobId: "j2" });
    expect(mocks.insertPending).toHaveBeenNthCalledWith(1, job, target);
    expect(mocks.insertPending).toHaveBeenNthCalledWith(2, { ...job, jobId: "j2" }, null);
  });

  // Bug caught: a chip clicked and left, then the toolbar's scene taking the chip's place instead of going to the cursor.
  it("sends a toolbar scene to the cursor even after a suggestion was clicked and left", async () => {
    const wrapper = mountEditor(note());
    await wrapper.getComponent(RichTextEditorStub).vm.$emit("illustrationClick", { prompt: "old", pos: 7 });
    await press(wrapper, "Generate scene illustration")?.trigger("click");
    currentNoteSurface.value?.insertScene({ jobId: "j1", prompt: "new", size: "1024x1024" });
    expect(mocks.insertPending).toHaveBeenCalledWith(expect.anything(), null);
  });

  // Bug caught: the editor's own fields invisible to the card, so a chronicle could not keep the DM's title or the session.
  it("lets the card read the note's id, title and linked session, and takes the surface away when the editor goes", async () => {
    const wrapper = mountEditor(note());
    const surface = currentNoteSurface.value;
    expect(surface).not.toBeNull();
    expect([surface?.noteId(), surface?.title(), surface?.sessionNum()]).toEqual(["n1", "The Heist", 4]);
    wrapper.unmount();
    expect(currentNoteSurface.value).toBeNull();
  });

  // Bug caught: a chronicle inserted from the card writing only the text, so the title, session and tags the DM saw were lost.
  it("fills the text, title, session and tags exactly as the dialog's Insert did", async () => {
    const wrapper = mountEditor(note({ title: "", session_id: null, tags: ["heist"] }));
    currentNoteSurface.value?.insertChronicle({ markdown: "Kira struck.", title: "The Duke's Blood", sessionNum: 4, tags: ["Heist", "sewer"], aiProvenance: null });
    await wrapper.vm.$nextTick();
    expect(mocks.insertChronicle).toHaveBeenCalledWith("Kira struck.", null);
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("The Duke's Blood");
    // The note's own tags are kept, and a tag it already has under another spelling is not added twice.
    expect(wrapper.findComponent({ name: "TagInput" }).props("modelValue")).toEqual(["heist", "sewer"]);
    expect(currentNoteSurface.value?.sessionNum()).toBe(4);
  });
});
