import { beforeEach, describe, expect, it, vi } from "vitest";
import { planProvisions } from "@/lib/travel/provisions";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { CalendarAdapter } from "@/types/calendar.types";
import { useSetOut, type SetOutPlan } from "./useSetOut";

// A small in-memory campaign the mocked mutations write to, so "Undo restores it" is checked against the world
// rather than against a list of calls.
const world = vi.hoisted(() => ({
  day: 10,
  partyAt: "start" as string | null,
  members: new Map<string, { id: string; current_location_id: string | null; conditions: { name: string; level?: number }[]; days_without_food: number }>(),
  inventory: new Map<string, Record<string, unknown>>(),
  events: new Map<string, unknown>(),
  failOn: null as string | null,
  nextId: 1,
  success: vi.fn(),
  error: vi.fn(),
}));

function gate(step: string): void {
  if (world.failOn === step) throw new Error(`${step} failed`);
}

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    activeCampaignId: "camp",
    todayYear: 1490,
    todayMonth: 1,
    get todayDay() {
      return world.day;
    },
    activeCampaign: { current_location_id: world.partyAt },
  }),
}));
vi.mock("@/lib/calendar/dayMath", () => ({ addDays: (_a: unknown, from: { year: number; month: number; day: number }, n: number) => ({ ...from, day: from.day + n }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ success: world.success, error: world.error, fromError: (e: unknown) => String(e) }) }));
vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCreateCalendarEvent: () => ({
    mutateAsync: async (e: unknown) => {
      gate("event");
      const id = `ev${world.nextId++}`;
      world.events.set(id, e);
      return { id };
    },
  }),
  useDeleteCalendarEvent: () => ({ mutateAsync: async (id: string) => void world.events.delete(id) }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useUpdatePartyMember: () => ({
    mutateAsync: async ({ id, update }: { id: string; update: object }) => {
      gate("member");
      Object.assign(world.members.get(id)!, update);
    },
  }),
}));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignLocation: () => ({
    mutateAsync: async ({ locationId }: { locationId: string | null }) => {
      gate("party");
      world.partyAt = locationId;
    },
  }),
  useSetCampaignToday: () => ({
    mutateAsync: async ({ day }: { day: number }) => {
      gate("date");
      world.day = day;
    },
  }),
}));
vi.mock("@/composables/items/usePartyInventory", () => ({
  useUpdateInventoryItem: () => ({ mutateAsync: async ({ id, update }: { id: string; update: object }) => void Object.assign(world.inventory.get(id)!, update) }),
  useRemoveInventoryItem: () => ({ mutateAsync: async (id: string) => void world.inventory.delete(id) }),
  useAddInventoryItem: () => ({ mutateAsync: async (fields: Record<string, unknown>) => void world.inventory.set(`new${world.nextId++}`, { ...fields }) }),
}));

const adapter = { formatDate: (y: number, m: number, d: number) => `${y}-${m}-${d}` } as unknown as CalendarAdapter;
const ration = (id: string, carriedBy: string | null, quantity: number): PartyInventoryItem =>
  ({ id, campaign_id: "camp", user_id: "u", name: "Rations (1 day)", quantity, carried_by: carriedBy, quality: "standard", location: "backpack", updated_at: "x" }) as unknown as PartyInventoryItem;

function plan(over: Partial<SetOutPlan> = {}): SetOutPlan {
  return {
    destination: { id: "far", name: "Daggerford" },
    summary: { distance: 30, unit: "mi", paceId: "normal", time: { calendarDays: 3 }, from: null, to: { id: "far", name: "Daggerford" } } as unknown as SetOutPlan["summary"],
    description: "Thirty miles.",
    travellers: [...world.members.values()],
    movesParty: true,
    adapter,
    provisions: null,
    ...over,
  };
}

function snapshot(): string {
  return JSON.stringify({ day: world.day, partyAt: world.partyAt, members: [...world.members.values()], inventory: [...world.inventory.values()].map((r) => `${String(r.carried_by)}:${String(r.quantity)}`).sort(), events: [...world.events.keys()] });
}

beforeEach(() => {
  world.day = 10;
  world.partyAt = "start";
  world.failOn = null;
  world.nextId = 1;
  world.events.clear();
  world.members = new Map([
    ["wren", { id: "wren", current_location_id: "start", conditions: [], days_without_food: 0 }],
    ["dorn", { id: "dorn", current_location_id: "start", conditions: [{ name: "Poisoned" }], days_without_food: 0 }],
  ]);
  world.inventory = new Map([
    ["w1", ration("w1", "wren", 1) as unknown as Record<string, unknown>],
    ["s1", ration("s1", null, 1) as unknown as Record<string, unknown>],
  ]);
  world.success.mockReset();
  world.error.mockReset();
});

function foodPlan(days: number): SetOutPlan {
  const inventory = [...world.inventory.values()] as unknown as PartyInventoryItem[];
  const travellers = [...world.members.values()];
  const result = planProvisions({
    days,
    travellers: travellers.map((t) => ({ id: t.id, carried: t.id === "wren" ? 1 : 0, daysWithoutFood: 0, exhaustion: 0, conModifier: 0, ruleset: "2014" })),
    stash: 1,
    forage: null,
    roll: () => 1,
  });
  return plan({ travellers, summary: { ...plan().summary, time: { calendarDays: days } } as SetOutPlan["summary"], provisions: { plan: result, inventory } });
}

describe("useSetOut", () => {
  it("moves travellers and party, advances the day by the journey's days, and records the event", async () => {
    await useSetOut().setOut(plan());
    expect(world.day).toBe(13);
    expect(world.partyAt).toBe("far");
    expect([...world.members.values()].map((m) => m.current_location_id)).toEqual(["far", "far"]);
    expect(world.events.size).toBe(1);
    expect(world.success.mock.calls[0][0]).toContain("The party set out for Daggerford. They arrive on 1490-1-13");
  });

  it("leaves the party's own place when the journey does not start where it stands", async () => {
    await useSetOut().setOut(plan({ movesParty: false }));
    expect(world.partyAt).toBe("start");
  });

  it("with the rule off (no provisions) writes no food, conditions or inventory", async () => {
    await useSetOut().setOut(plan());
    expect(world.members.get("dorn")).toMatchObject({ conditions: [{ name: "Poisoned" }], days_without_food: 0 });
    expect([...world.inventory.values()].map((r) => r.quantity)).toEqual([1, 1]);
  });

  it("with the rule on eats own pack then stash, deletes emptied rows and writes hunger", async () => {
    // One day: wren eats her own ration, dorn the stash's; both rows are emptied and so deleted.
    await useSetOut().setOut(foodPlan(1));
    expect(world.inventory.size).toBe(0);
    expect(world.members.get("wren")?.days_without_food).toBe(0);
  });

  it("hunger beyond the allowance lands as Exhaustion on the member", async () => {
    world.members.get("dorn")!.days_without_food = 3; // 2014, Con +0: 3 days free, so the next hungry day costs a level
    await useSetOut().setOut(
      (() => {
        const p = foodPlan(2);
        p.provisions!.plan = planProvisions({ days: 2, travellers: [{ id: "dorn", carried: 0, daysWithoutFood: 3, exhaustion: 0, conModifier: 0, ruleset: "2014" }], stash: 0, forage: null, roll: () => 1 });
        return p;
      })(),
    );
    expect(world.members.get("dorn")).toMatchObject({ days_without_food: 5, conditions: [{ name: "Poisoned" }, { name: "Exhaustion", level: 2 }] });
  });

  it("a failing step takes back every step before it and throws", async () => {
    const before = snapshot();
    world.failOn = "date";
    await expect(useSetOut().setOut(foodPlan(1))).rejects.toThrow("date failed");
    expect(snapshot()).toBe(before);
    expect(world.success).not.toHaveBeenCalled();
  });

  it("a failure at the first step leaves nothing behind", async () => {
    const before = snapshot();
    world.failOn = "event";
    await expect(useSetOut().setOut(plan())).rejects.toThrow("event failed");
    expect(snapshot()).toBe(before);
  });

  it("Undo restores the date, places, hunger, conditions and rations, and deletes the event", async () => {
    const before = snapshot();
    await useSetOut().setOut(foodPlan(1));
    expect(snapshot()).not.toBe(before);
    world.success.mock.calls[0][2].action.run();
    await vi.waitFor(() => expect(snapshot()).toBe(before));
    expect(world.day).toBe(10);
    expect(world.partyAt).toBe("start");
    expect(world.events.size).toBe(0);
    expect(world.members.get("dorn")).toMatchObject({ current_location_id: "start", conditions: [{ name: "Poisoned" }], days_without_food: 0 });
  });

  it("Undo takes back hunger: the Exhaustion and the run without food go back to what they were", async () => {
    world.members.get("dorn")!.days_without_food = 3;
    const hungry = plan({ provisions: { inventory: [], plan: planProvisions({ days: 2, travellers: [{ id: "dorn", carried: 0, daysWithoutFood: 3, exhaustion: 0, conModifier: 0, ruleset: "2014" }], stash: 0, forage: null, roll: () => 1 }) } });
    const before = snapshot();
    await useSetOut().setOut(hungry);
    expect(world.members.get("dorn")?.conditions).toContainEqual({ name: "Exhaustion", level: 2 });
    world.success.mock.calls[0][2].action.run();
    await vi.waitFor(() => expect(snapshot()).toBe(before));
  });
});
