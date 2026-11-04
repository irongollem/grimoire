// @vitest-environment happy-dom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarStore } from "./calendar";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("calendar store", () => {
  // Bug it fails on: a cold start (no saved position) was Faerun, year 1495.
  it("starts on the blank calendar at year 1, not Faerun", () => {
    const calendar = useCalendarStore();
    expect(calendar.activeCalendarId).toBeNull();
    expect(calendar.currentYear).toBe(1);
    expect(calendar.adapter.epochName).toBe("AY");
  });

  it("keeps a campaign with no calendar as none, and a chosen one by id", () => {
    const calendar = useCalendarStore();
    calendar.loadFromCampaign("eberron", 998, 1, null);
    expect(calendar.activeCalendarId).toBe("eberron");
    calendar.loadFromCampaign(null, 1, 1, null);
    expect(calendar.activeCalendarId).toBeNull();
    expect(calendar.adapter.epochName).toBe("AY");
  });
});
