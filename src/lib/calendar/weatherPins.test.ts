import { describe, expect, it } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import { addDays, type CalendarDate } from "./dayMath";
import { weatherOn, type Weather, type WeatherPin } from "./weather";
import { PIN_KEEP_DAYS, pinOn, withPin, withoutPin } from "./weatherPins";

const adapter = gregorianAdapter;
const today: CalendarDate = { year: 12, month: 5, day: 10 };
const calm: Weather = { temperature: "mild", precipitation: "none", wind: "calm", fog: false };
const set = (source: string | null, date: CalendarDate): WeatherPin => ({ source, ...date, kind: "set", weather: calm });
const reroll = (source: string | null, date: CalendarDate, salt = "s"): WeatherPin => ({ source, ...date, kind: "reroll", salt });
const back = (n: number) => addDays(adapter, today, -n);

describe("weather pin bookkeeping", () => {
  it("replaces that source's pin for the same day and finds it", () => {
    const pins = withPin(adapter, [set("a", today), set("b", today)], reroll("a", today), today);
    expect(pins).toHaveLength(2);
    expect(pinOn(pins, "a", today)?.kind).toBe("reroll");
    expect(pinOn(pins, "b", today)?.kind).toBe("set");
    expect(pinOn(pins, null, today)).toBeUndefined();
  });

  it("drops this source's pins older than the keep window, and only this source's", () => {
    const old = back(PIN_KEEP_DAYS + 5);
    const pins = withPin(adapter, [set("a", old), set("a", back(3)), set("b", old)], set("a", today), today);
    expect(pins.filter((p) => p.source === "a")).toHaveLength(2);
    expect(pinOn(pins, "a", old)).toBeUndefined();
    expect(pinOn(pins, "b", old)).toBeDefined();
  });

  it("keeps the latest reroll however old, so today's sky does not flip back", () => {
    const old = back(PIN_KEEP_DAYS + 30);
    const rolled = [reroll(null, old, "x1")];
    const skyBefore = weatherOn(adapter, "temperate", "c:campaign", today.year, today.month, today.day, null, rolled);
    const after = withPin(adapter, rolled, set(null, today), today);
    expect(pinOn(after, null, old)).toBeDefined();
    const skyTomorrowKept = weatherOn(adapter, "temperate", "c:campaign", 12, 5, 20, null, after);
    expect(skyTomorrowKept).toEqual(weatherOn(adapter, "temperate", "c:campaign", 12, 5, 20, null, rolled));
    expect(skyBefore).not.toBeNull();
    // An older reroll superseded by a newer one does go.
    const twice = withPin(adapter, [reroll(null, old, "x1"), reroll(null, back(PIN_KEEP_DAYS + 10), "x2")], set(null, today), today);
    expect(pinOn(twice, null, old)).toBeUndefined();
    expect(pinOn(twice, null, back(PIN_KEEP_DAYS + 10))).toBeDefined();
  });

  it("removes today's pin and nothing else", () => {
    const pins = withoutPin([set("a", today), set("a", back(1)), set("b", today)], "a", today);
    expect(pins).toHaveLength(2);
    expect(pinOn(pins, "a", today)).toBeUndefined();
  });
});
