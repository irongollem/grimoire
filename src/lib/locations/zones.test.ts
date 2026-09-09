import { describe, expect, it } from "vitest";
import { emptyZoneInsert, isPlayerVisible, zoneSummary } from "./zones";
import type { ZonePayload } from "@/types/locationMapRegion.types";

function region(zone_kind: Parameters<typeof zoneSummary>[0]["zone_kind"], zone_payload: ZonePayload = {}) {
  return { zone_kind, zone_payload };
}

describe("zoneSummary", () => {
  it("reads terrain's movement cost and depth", () => {
    expect(zoneSummary(region("terrain", { movement_cost: 2, depth_ft: 3 }))).toBe("difficult terrain · 3 ft");
  });

  it("names impassable terrain distinctly from difficult terrain", () => {
    expect(zoneSummary(region("terrain", { movement_cost: 3 }))).toBe("impassable");
  });

  it("falls back to the kind label when terrain carries no payload yet", () => {
    expect(zoneSummary(region("terrain"))).toBe("Terrain");
  });

  it("reads each light level", () => {
    expect(zoneSummary(region("light", { light_level: "dark" }))).toBe("darkness");
    expect(zoneSummary(region("light", { light_level: "bright" }))).toBe("bright light");
    expect(zoneSummary(region("light", { light_level: "dim" }))).toBe("dim light");
    expect(zoneSummary(region("light", { light_level: "magical_darkness" }))).toBe("magical darkness");
  });

  it("falls back to the kind label when light carries no level yet", () => {
    expect(zoneSummary(region("light"))).toBe("Light");
  });

  it("reports a linked trap for hazard zones that carry one", () => {
    expect(zoneSummary(region("hazard", { trap_id: "trap-1" }))).toBe("trap linked");
  });

  it("falls back to the kind label for a hazard with no trap yet", () => {
    expect(zoneSummary(region("hazard"))).toBe("Hazard");
  });

  it("reports a prompt for trigger zones carrying an encounter or a beat", () => {
    expect(zoneSummary(region("trigger", { encounter_id: "enc-1" }))).toBe("prompts a beat");
    expect(zoneSummary(region("trigger", { beat_id: "beat-1" }))).toBe("prompts a beat");
  });

  it("falls back to the kind label for a trigger with nothing wired yet", () => {
    expect(zoneSummary(region("trigger"))).toBe("Trigger");
  });

  it("always reads marker zones as the honest default label", () => {
    expect(zoneSummary(region("marker"))).toBe("Marker");
  });

  it("returns empty for a region with no zone_kind at all", () => {
    expect(zoneSummary(region(null))).toBe("");
  });
});

describe("isPlayerVisible", () => {
  it("defaults to DM-only when visible_to_players is absent", () => {
    expect(isPlayerVisible({ zone_payload: {} })).toBe(false);
  });

  it("reads an explicit true", () => {
    expect(isPlayerVisible({ zone_payload: { visible_to_players: true } })).toBe(true);
  });

  it("treats an explicit false the same as absent", () => {
    expect(isPlayerVisible({ zone_payload: { visible_to_players: false } })).toBe(false);
  });
});

describe("emptyZoneInsert", () => {
  it("builds an unbound, empty zone of the given kind", () => {
    expect(emptyZoneInsert("site-1", "marker")).toEqual({
      site_location_id: "site-1",
      region_role: "zone",
      zone_kind: "marker",
      zone_payload: {},
    });
  });

  it("defaults a light zone to player-visible, and every other kind to DM-only", () => {
    expect(emptyZoneInsert("site-1", "light").zone_payload).toEqual({ visible_to_players: true });
    expect(emptyZoneInsert("site-1", "hazard").zone_payload).toEqual({});
    expect(emptyZoneInsert("site-1", "terrain").zone_payload).toEqual({});
    expect(emptyZoneInsert("site-1", "trigger").zone_payload).toEqual({});
  });
});
