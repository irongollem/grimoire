// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import type { TurnRun } from "@/composables/encounters/useFightCommands";
import type { RunCombatant } from "@/types/encounter.types";
import { RUNNER_TAKE_TURN, createRunnerTakeTurn, type RunnerTakeTurn } from "./runnerResolve";
import RunnerRunForMe from "./RunnerRunForMe.vue";

function ogre(over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: "ogre", type: "monster", name: "Ogre", faction_id: "enemy", initiative: 10, hp: 20, max_hp: 30, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
  };
}

const run = (over: Partial<NonNullable<TurnRun["turn"]>> = {}): TurnRun => ({
  turn: { instanceId: "ogre", optionId: "o1", kind: "attack", summary: "Attack Fresco with Greatclub", reason: "Attacks Fresco, the nearest enemy.", picked: "rules", ...over },
  outcomes: [],
});

function setup(takeTurn: (id: string) => Promise<TurnRun>, combatant = ogre(), provided: RunnerTakeTurn | null = createRunnerTakeTurn(takeTurn, (e) => (e as Error).message)) {
  const w = mount(RunnerRunForMe, { props: { combatant }, global: { provide: provided ? { [RUNNER_TAKE_TURN as symbol]: provided } : {} } });
  return { w, provided };
}
const button = (w: ReturnType<typeof setup>["w"]) => w.get("button");

describe("RunnerRunForMe", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("fails if it draws a button outside the runner, where nothing can answer it", () => {
    const { w } = setup(vi.fn(), ogre(), null);
    expect(w.find("button").exists()).toBe(false);
  });

  it("fails if a creature at 0 hit points can still be sent to the server, or is not told why", async () => {
    const takeTurn = vi.fn();
    const { w } = setup(takeTurn, ogre({ hp: 0 }));
    expect(button(w).attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("Ogre is down.");
    await button(w).trigger("click");
    expect(takeTurn).not.toHaveBeenCalled();
  });

  it("fails if a spent Action can still be sent to the server, or is not told why", async () => {
    const takeTurn = vi.fn();
    const { w } = setup(takeTurn, ogre({ action_used: true }));
    expect(button(w).attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("Ogre has used its Action this turn.");
    await button(w).trigger("click");
    expect(takeTurn).not.toHaveBeenCalled();
  });

  it("fails if the summary, the reason and what its note ruled out are not all shown after a reply", async () => {
    const takeTurn = vi.fn().mockResolvedValue(run({ picked: "rules_with_note", ruledOutByNote: [{ optionId: "o2", summary: "Move toward Fresco" }, { optionId: "o3", summary: "Dodge" }] }));
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(takeTurn).toHaveBeenCalledWith("ogre");
    expect(w.text()).toContain("Attack Fresco with Greatclub");
    expect(w.text()).toContain("Attacks Fresco, the nearest enemy.");
    expect(w.text()).toContain("Its note ruled out: Move toward Fresco; Dodge");
  });

  it("fails if a creature that left the map throws, or is not said to have left", async () => {
    const takeTurn = vi.fn().mockResolvedValue(run({ kind: "flee", summary: "Flee", leftTheMap: true }));
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.text()).toContain("It left the map");
  });

  it("fails if a walk across a map with nothing drawn on it is shown as if the creature chose to cross the furniture", async () => {
    const takeTurn = vi.fn().mockResolvedValue(run({ bareMap: true }));
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Nothing is drawn on this map");
  });

  it("fails if a second click while the request is out sends a second request", async () => {
    let finish!: (r: TurnRun) => void;
    const takeTurn = vi.fn().mockReturnValue(new Promise<TurnRun>((resolve) => { finish = resolve; }));
    const { provided } = setup(takeTurn);
    void provided!.run("ogre");
    void provided!.run("ogre");
    expect(takeTurn).toHaveBeenCalledTimes(1);
    finish(run());
    await flushPromises();
    void provided!.run("ogre");
    expect(takeTurn).toHaveBeenCalledTimes(2);
  });

  it("fails if a refusal is not shown inline with the server's words", async () => {
    const takeTurn = vi.fn().mockRejectedValue(new Error("That option is not on offer."));
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.get("[role=alert]").text()).toBe("That option is not on offer.");
  });

  it("fails if a result is lost when the panel closes and reopens, or kept past the creature's next run", async () => {
    const takeTurn = vi.fn().mockResolvedValueOnce(run({ summary: "First turn" })).mockResolvedValueOnce(run({ summary: "Second turn" }));
    const { w, provided } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    w.unmount();
    const { w: reopened } = setup(takeTurn, ogre(), provided);
    expect(reopened.text()).toContain("First turn");
    await button(reopened).trigger("click");
    await flushPromises();
    expect(reopened.text()).toContain("Second turn");
    expect(reopened.text()).not.toContain("First turn");
  });

  it("fails if a reply with no turn (a replayed batch) shows an invented one", async () => {
    const takeTurn = vi.fn().mockResolvedValue({ turn: null, outcomes: [] } satisfies TurnRun);
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.find("[aria-live]").exists()).toBe(false);
  });

  it("fails if an old refusal stays on screen after the creature's next run succeeds", async () => {
    const takeTurn = vi.fn().mockRejectedValueOnce(new Error("Ogre is at 0 hit points.")).mockResolvedValueOnce(run());
    const { w } = setup(takeTurn);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.find("[role=alert]").exists()).toBe(true);
    await button(w).trigger("click");
    await flushPromises();
    expect(w.find("[role=alert]").exists()).toBe(false);
  });
});
