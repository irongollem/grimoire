import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import SessionDetailsForm from "./SessionDetailsForm.vue";
import type { CampaignSession } from "@/types/session.types";

const mutateAsync = vi.fn<(arg: { id: string; update: Record<string, unknown> }) => Promise<void>>();

vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useUpdateCampaignSession: () => ({ mutateAsync }),
}));
vi.mock("@/composables/calendar/useScheduling", () => ({
  useSessionProposals: () => ({ data: { value: [] } }),
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
});
