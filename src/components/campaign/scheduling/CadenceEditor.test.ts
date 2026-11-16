// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import CadenceEditor from "./CadenceEditor.vue";
import type { SessionCadence, SessionProposal } from "@/types/scheduling.types";

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));

// 2026-11-16 is a Monday.
const TODAY = "2026-11-16";

function cadence(over: Partial<SessionCadence> = {}): SessionCadence {
  return {
    id: "cad1",
    campaign_id: "c1",
    user_id: "u1",
    repeat: "weekly",
    every_weeks: 1,
    weekday: 4,
    week_of_month: null,
    start_time: "19:30:00",
    duration_minutes: 240,
    title: "Session",
    starts_on: "2026-09-03",
    ends_on: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function mountEditor(c: SessionCadence | null, proposals: SessionProposal[] = []) {
  return mount(CadenceEditor, { props: { cadence: c, proposals, today: TODAY }, global: { stubs: { VueDatePicker: true } } });
}

async function openForm(w: ReturnType<typeof mountEditor>) {
  await w.find('button[aria-label="Edit rhythm"], button').trigger("click");
}

// Pickers in form order: start time, starts on, ends on.
function picker(w: ReturnType<typeof mountEditor>, index: number) {
  return w.findAllComponents(VueDatePicker)[index];
}

function button(w: ReturnType<typeof mountEditor>, label: string) {
  const b = w.findAll("button").find((x) => x.text().includes(label));
  if (!b) throw new Error(`no button "${label}"`);
  return b;
}

describe("CadenceEditor", () => {
  beforeEach(() => confirmMock.mockReset());

  it("summarises the rule with its time range and the next three evenings", () => {
    const w = mountEditor(cadence());
    expect(w.text()).toContain("Every Thursday · 19:30 to 23:30");
    expect(w.text()).toContain("Nov 19");
    expect(w.text()).toContain("Dec 3");
  });

  it("leaves a moved evening out of the next three (it is no longer on the rule's date)", () => {
    const moved = { replaces_date: "2026-11-19" } as SessionProposal;
    const w = mountEditor(cadence(), [moved]);
    expect(w.text()).not.toContain("Nov 19");
    expect(w.text()).toContain("Nov 26");
  });

  it("offers a first rhythm when none is set", () => {
    const w = mountEditor(null);
    expect(w.text()).toContain("Set it once");
    expect(button(w, "Set a regular rhythm")).toBeTruthy();
  });

  it("changing the rule on a cadence that started in the past starts the new rule today", async () => {
    const w = mountEditor(cadence());
    await openForm(w);
    await w.find('select[aria-label="How often"]').setValue("2");
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input.every_weeks).toBe(2);
    expect(input.starts_on).toBe(TODAY);
  });

  it("saving only a new title keeps the original start date", async () => {
    const w = mountEditor(cadence());
    await openForm(w);
    await w.find('input[placeholder="Session"]').setValue("Game night");
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input.title).toBe("Game night");
    expect(input.starts_on).toBe("2026-09-03");
  });

  it("keeps a start date the DM chose themselves when the rule changes too", async () => {
    const w = mountEditor(cadence());
    await openForm(w);
    await w.find('select[aria-label="Day"]').setValue("6");
    picker(w, 1).vm.$emit("update:modelValue", "2026-12-01");
    await w.vm.$nextTick();
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input.starts_on).toBe("2026-12-01");
  });

  it("does not move a future start date when the rule changes", async () => {
    const w = mountEditor(cadence({ starts_on: "2026-12-10" }));
    await openForm(w);
    await w.find('select[aria-label="Day"]').setValue("6");
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input.starts_on).toBe("2026-12-10");
  });

  it("a weekly rule saves no week-of-month, a monthly one saves no every-weeks", async () => {
    const w = mountEditor(null);
    await button(w, "Set a regular rhythm").trigger("click");
    await button(w, "Monthly").trigger("click");
    await w.find('select[aria-label="Which week"]').setValue("-1");
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input).toMatchObject({ repeat: "monthly", week_of_month: -1, every_weeks: 1 });
  });

  it("saves the start time the picker gives, as HH:mm", async () => {
    const w = mountEditor(cadence());
    await openForm(w);
    picker(w, 0).vm.$emit("update:modelValue", { hours: 18, minutes: 5 });
    await w.vm.$nextTick();
    await button(w, "Save rhythm").trigger("click");
    const [input] = w.emitted("save")![0] as [Record<string, unknown>];
    expect(input.start_time).toBe("18:05");
  });

  it("cannot save an end date before the start date", async () => {
    const w = mountEditor(null);
    await button(w, "Set a regular rhythm").trigger("click");
    picker(w, 1).vm.$emit("update:modelValue", "2026-12-01");
    picker(w, 2).vm.$emit("update:modelValue", "2026-11-01");
    await w.vm.$nextTick();
    expect(button(w, "Save rhythm").attributes("disabled")).toBeDefined();
  });

  it("removing asks first: a cancelled confirm removes nothing", async () => {
    confirmMock.mockResolvedValue(false);
    const w = mountEditor(cadence());
    await w.find('button[aria-label="Remove rhythm"]').trigger("click");
    await Promise.resolve();
    expect(w.emitted("remove")).toBeUndefined();
  });

  it("removes after the confirm is accepted", async () => {
    confirmMock.mockResolvedValue(true);
    const w = mountEditor(cadence());
    await w.find('button[aria-label="Remove rhythm"]').trigger("click");
    await vi.waitFor(() => expect(w.emitted("remove")).toHaveLength(1));
  });
});
