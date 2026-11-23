// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { AskReportDraft } from "@edge-shared/agent/askContract";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
import BugReportModal from "./BugReportModal.vue";

// The shell and header are not what is tested: a stub shell renders its slot when open.
const stubs = { AppModal: { props: ["open"], template: "<div v-if=\"open\"><slot /></div>" }, ModalHeader: true };

const bug: AskReportDraft = { kind: "bug", where: "Encounters", action: "Pressed next", expected: "Next turn", actual: "Nothing" };
const feature: AskReportDraft = { kind: "feature", where: "Atlas", summary: "Dark maps", problem: "Too bright" };

function modal(props: { modelValue: boolean; draft?: AskReportDraft }) {
  return mount(BugReportModal, { props, global: { stubs } });
}

describe("BugReportModal: a draft from Ask", () => {
  // Bug caught: the draft not reaching the form, so the DM retypes what Ask already wrote.
  it("fills the bug form from the draft when it opens", () => {
    const w = modal({ modelValue: true, draft: bug });
    const values = w.findAll("textarea").map((t) => (t.element as HTMLTextAreaElement).value);
    expect(values).toEqual(["Pressed next", "Next turn", "Nothing"]);
    expect((w.get("input[type=text]").element as HTMLInputElement).value).toBe("Encounters");
  });

  // Bug caught: a feature draft landing in the bug form (kind left at its default).
  it("switches to the feature form for a feature draft", () => {
    const w = modal({ modelValue: true, draft: feature });
    const values = w.findAll("textarea").map((t) => (t.element as HTMLTextAreaElement).value);
    expect(values).toEqual(["Dark maps", "Too bright"]);
  });

  // Bug caught: opening the form with the draft sending it, which would file a report without the DM's consent.
  it("files nothing by opening, and only the form's submit calls create-bug-report", async () => {
    const w = modal({ modelValue: false, draft: bug });
    await w.setProps({ modelValue: true });
    await nextTick();
    expect(invoke).not.toHaveBeenCalled();
  });

  // Bug caught: the plain report form pre-filled when no draft was given.
  it("is empty without a draft", () => {
    const w = modal({ modelValue: true });
    expect(w.findAll("textarea").every((t) => (t.element as HTMLTextAreaElement).value === "")).toBe(true);
  });
});
