import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { CampaignSession } from "@/types/session.types";
import type { Note } from "@/types/notes.types";

function logged(id: string, playedOn: string, over: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id, campaign_id: "c", user_id: "u", number: null, title: null, played_on: playedOn,
    started_at: null, ended_at: null, created_at: `${playedOn}T00:00:00Z`, updated_at: "", ...over,
  };
}

const log = ref<CampaignSession[]>([]);
const notes = ref<Pick<Note, "id" | "category" | "session_id">[]>([]);
const createSession = vi.fn();

vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: log }),
  useCreatePastSession: () => ({ mutateAsync: createSession, isPending: ref(false) }),
}));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: () => ({ data: notes }) }));

import NoteSessionPicker from "./NoteSessionPicker.vue";

function mountPicker(modelValue: string | null = null) {
  const onUpdate = vi.fn();
  const wrapper = mount(NoteSessionPicker, {
    props: { modelValue, "onUpdate:modelValue": onUpdate },
    attachTo: document.body,
    global: { stubs: { VueDatePicker: true } },
  });
  return { wrapper, onUpdate };
}

async function openList(wrapper: ReturnType<typeof mountPicker>["wrapper"]) {
  await wrapper.get("input[type=text]").trigger("focus");
  await flushPromises();
}

function rows(): string[] {
  return [...document.body.querySelectorAll("ul li")].map((li) => li.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

beforeEach(() => {
  document.body.innerHTML = "";
  createSession.mockReset();
  log.value = [
    logged("a", "2026-09-20", { number: 12, title: "Mere" }),
    logged("b", "2026-09-27", { number: 13, title: "Bells of Daggerford" }),
  ];
  notes.value = [{ id: "n1", category: "session", session_id: "b" }];
});

describe("NoteSessionPicker", () => {
  it("lists sessions without a note first and says what each one has", async () => {
    const { wrapper } = mountPicker();
    await openList(wrapper);
    const list = rows();
    expect(list[0]).toContain("Session 12 · Mere");
    expect(list[0]).toContain("no notes yet");
    expect(list[1]).toContain("Session 13 · Bells of Daggerford");
    expect(list[1]).toContain("has a note");
    expect(list[2]).toContain("+ A session that is not in the log yet");
    wrapper.unmount();
  });

  it("selects a session by id", async () => {
    const { wrapper, onUpdate } = mountPicker();
    await openList(wrapper);
    document.body.querySelectorAll("ul li")[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(onUpdate).toHaveBeenCalledWith("a");
    wrapper.unmount();
  });

  it("creates a session that is not in the log and selects it", async () => {
    createSession.mockResolvedValue(logged("new", "2026-10-04", { number: 14, title: "Ashes" }));
    const { wrapper, onUpdate } = mountPicker();
    await openList(wrapper);
    document.body.querySelectorAll("ul li")[2].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await flushPromises();

    const inputs = wrapper.findAll("input");
    // number is prefilled with the next one in the log
    const numberInput = inputs.find((i) => i.attributes("type") === "number");
    expect((numberInput!.element as HTMLInputElement).value).toBe("14");
    const add = wrapper.findAll("button").find((b) => b.text().includes("Add session"));
    await add!.trigger("click");
    await flushPromises();

    expect(createSession).toHaveBeenCalledWith({ number: 14, title: null, played_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(onUpdate).toHaveBeenCalledWith("new");
    wrapper.unmount();
  });
});
