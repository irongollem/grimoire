import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import SessionDetailsForm from "./SessionDetailsForm.vue";
import type { CampaignSession } from "@/types/session.types";

const mutateAsync = vi.fn<(arg: { id: string; update: Record<string, unknown> }) => Promise<void>>();

vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useUpdateCampaignSession: () => ({ mutateAsync }),
}));
const proposals = vi.hoisted(() => ({ list: [] as Array<{ session_id: string | null; title: string }> }));
vi.mock("@/composables/calendar/useScheduling", () => ({
  useSessionProposals: () => ({ data: { value: proposals.list } }),
}));

function session(over: Partial<CampaignSession>): CampaignSession {
  return {
    id: "s1",
    campaign_id: "c1",
    user_id: "u1",
    number: 1,
    title: "Prisoners of Bryn Shander",
    played_on: "2026-04-25",
    started_at: null,
    ended_at: null,
    created_at: "2026-10-06T10:00:00Z",
    updated_at: "2026-10-06T10:00:00Z",
    ...over,
  };
}

function mountFor(row: CampaignSession) {
  return mount(SessionDetailsForm, {
    props: { session: row },
    global: { stubs: { VueDatePicker: true } },
  });
}

describe("SessionDetailsForm", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue();
    proposals.list = [];
  });

  it("lets the DM correct the day of a session logged by hand", async () => {
    const wrapper = mountFor(session({}));
    const picker = wrapper.findComponent(VueDatePicker);
    expect(picker.props("modelValue")).toBe("2026-04-25");

    // The picker emits the day as "YYYY-MM-DD" (its model-type).
    picker.vm.$emit("update:modelValue", "2026-02-06");
    await flushPromises();
    wrapper.unmount();
    await flushPromises();

    expect(mutateAsync).toHaveBeenCalledWith({
      id: "s1",
      update: { number: 1, title: "Prisoners of Bryn Shander", played_on: "2026-02-06" },
    });
  });

  it("dates a run session by its clock and never writes played_on for it", async () => {
    const wrapper = mountFor(
      session({ played_on: null, started_at: "2026-10-02T19:00:00Z", ended_at: "2026-10-02T22:30:00Z" }),
    );
    expect(wrapper.findComponent(VueDatePicker).exists()).toBe(false);
    expect(wrapper.text()).toContain("Played:");

    await wrapper.get("#session-title").setValue("The Wolves of Dougan's Hole");
    wrapper.unmount();
    await flushPromises();

    expect(mutateAsync).toHaveBeenCalledWith({
      id: "s1",
      update: { number: 1, title: "The Wolves of Dougan's Hole" },
    });
  });

  it("writes nothing when the DM opened the session and changed nothing", async () => {
    const wrapper = mountFor(session({}));
    wrapper.unmount();
    await flushPromises();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("saves a changed number, and a cleared title as null", async () => {
    const wrapper = mountFor(session({}));
    await wrapper.get("#session-number").setValue("4");
    await wrapper.get("#session-title").setValue("   ");
    wrapper.unmount();
    await flushPromises();
    expect(mutateAsync).toHaveBeenCalledWith({ id: "s1", update: { number: 4, title: null, played_on: "2026-04-25" } });
  });

  it("saves a change to the number alone", async () => {
    const wrapper = mountFor(session({}));
    await wrapper.get("#session-number").setValue("9");
    wrapper.unmount();
    await flushPromises();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].update.number).toBe(9);
  });

  it("never writes played_on for a session that was run, even one that carries a day", async () => {
    const wrapper = mountFor(session({ played_on: "2026-10-02", started_at: "2026-10-02T19:00:00Z" }));
    await wrapper.get("#session-title").setValue("Renamed");
    wrapper.unmount();
    await flushPromises();
    expect(mutateAsync.mock.calls[0][0].update).toEqual({ number: 1, title: "Renamed" });
  });

  it("names the proposal a session was scheduled as, only for that session", () => {
    proposals.list = [{ session_id: "other", title: "Not this one" }, { session_id: "s1", title: "Thursday night" }];
    const text = mountFor(session({})).text();
    expect(text).toContain("Scheduled as: Thursday night");
    expect(text).not.toContain("Not this one");
    proposals.list = [{ session_id: "other", title: "Not this one" }];
    expect(mountFor(session({})).text()).not.toContain("Scheduled as");
  });
});
