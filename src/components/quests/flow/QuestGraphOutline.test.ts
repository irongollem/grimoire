import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestGraphOutline from "./QuestGraphOutline.vue";
import type { QuestBeat } from "@/types/quest.types";

const beat = (id: string): QuestBeat => ({ id, quest_id: "q", campaign_id: "c", title: id, dm_content: null, secret: false, visible_to: null, read_aloud: null, how_it_plays: null, converge_mode: "any", rumor_text: null, reveal_text: null, visibility: "hidden", kind: "neutral", presentation_hint: null, canvas_x: 0, canvas_y: 0, is_improvised: false, staged_at_location_id: null, improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "now" });

describe("QuestGraphOutline", () => {
  it("offers open, link, and delete without the canvas — creation lives on the header's own Add beat button now", async () => {
    const wrapper = mount(QuestGraphOutline, { props: { beats: [beat("a"), beat("b")], selectedBeatId: "a" } });
    await wrapper.findAll("li")[1]!.find("button").trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "Link")!.trigger("click");
    await wrapper.findAll("button").find((button) => button.attributes("aria-label") === "Remove beat")!.trigger("click");
    const commands = wrapper.emitted("command")!.map((event) => event[0]);
    expect(commands).toContainEqual({ type: "open", beatId: "b" });
    expect(commands).toContainEqual({ type: "link", sourceBeatId: "a", targetBeatId: "b" });
    expect(commands).toContainEqual({ type: "delete-beat", beatId: "a" });
  });

  it("keeps selection available while hiding later authoring actions in read mode", () => {
    const wrapper = mount(QuestGraphOutline, { props: { beats: [beat("a")], selectedBeatId: "a", editable: false } });
    expect(wrapper.findAll("button").some((button) => button.attributes("aria-label") === "Remove beat")).toBe(false);
    expect(wrapper.text()).toContain("a");
  });

  it("names the thread standing on the current beat, the one that visited an earlier beat, and says a stranded beat was cut off by a choice", () => {
    const threads = [{ id: "main", status: "live" as const, created_at: "2026-09-01T00:00:00Z", label: "The petition", opened_by_edge_id: null }];
    const presentations = {
      a: { reach: "visited", currentThreadIds: [], prepGapCount: 0 } as never,
      b: { reach: "current", currentThreadIds: ["main"], prepGapCount: 1 } as never,
      c: { reach: "stranded", currentThreadIds: [], prepGapCount: 0 } as never,
    };
    const wrapper = mount(QuestGraphOutline, {
      props: {
        beats: [beat("a"), beat("b"), beat("c")],
        presentations,
        threads,
        transitions: [{ to_beat_id: "a", thread_id: "main" } as never],
      },
    });
    expect(wrapper.text()).toContain("Thread A · visited");
    expect(wrapper.text()).toContain("Thread A · current · 1 prep gap");
    expect(wrapper.text()).toContain("Cut off by a choice");

    // Each row wears the shared bookmark and its fill, so the outline reads
    // like the canvas.
    const rows = wrapper.findAll("li");
    const states = rows.map((row) => row.get("[data-testid=beat-bookmark]").attributes("data-state"));
    expect(states).toEqual(["done", "here", "unreachable"]);
    expect(rows[1]!.classes()).toContain("bg-primary/15");
    expect(rows[2]!.classes()).toContain("opacity-40");
    expect(rows[2]!.text()).toContain("unreachable");
  });

  const edge = (id: string, source: string, target: string, route_kind: "choice" | "parallel") =>
    ({ id, source_beat_id: source, target_beat_id: target, route_kind }) as never;
  const reach = (r: string, ids: string[] = [], gaps = 0) => ({ reach: r, currentThreadIds: ids, prepGapCount: gaps }) as never;
  const main = { id: "main", status: "live" as const, created_at: "2026-09-01T00:00:00Z", label: "Main", opened_by_edge_id: null };
  const side = { id: "side", status: "live" as const, created_at: "2026-09-02T00:00:00Z", label: "Side", opened_by_edge_id: "e1" };

  it("says 'Played' for a visited beat no thread is recorded on, and 'Party is here' with the gap count for a current beat with no thread", () => {
    const wrapper = mount(QuestGraphOutline, {
      props: { beats: [beat("a"), beat("b")], presentations: { a: reach("visited"), b: reach("current", [], 2) } },
    });
    const rows = wrapper.findAll("li");
    expect(rows[0]!.text()).toContain("Played");
    expect(rows[1]!.text()).toContain("Party is here · 2 prep gaps");
  });

  it("a transition with no thread does not erase which thread walked the beat", () => {
    const wrapper = mount(QuestGraphOutline, {
      props: {
        beats: [beat("a")],
        presentations: { a: reach("visited") },
        threads: [main],
        transitions: [{ to_beat_id: "a", thread_id: "main" } as never, { to_beat_id: "a", thread_id: null } as never],
      },
    });
    expect(wrapper.text()).toContain("Thread A · visited");
  });

  it("tells which beat opened a parallel thread, and not for a plain choice", () => {
    const visited = { a: reach("visited"), b: reach("current", ["side"]) };
    const props = { beats: [beat("a"), beat("b")], presentations: visited, threads: [main, side], transitions: [{ to_beat_id: "a", thread_id: "main" } as never] };
    const parallel = mount(QuestGraphOutline, { props: { ...props, edges: [edge("e1", "a", "b", "parallel")] } });
    expect(parallel.findAll("li")[0]!.text()).toContain("Thread A · visited · opened Thread B");
    const choice = mount(QuestGraphOutline, { props: { ...props, edges: [edge("e1", "a", "b", "choice")] } });
    expect(choice.findAll("li")[0]!.text()).not.toContain("opened Thread");
  });

  it("writes '1 prep gap' in the singular", () => {
    const wrapper = mount(QuestGraphOutline, { props: { beats: [beat("a")], presentations: { a: reach("current", [], 1) } } });
    expect(wrapper.text()).toContain("1 prep gap");
    expect(wrapper.text()).not.toContain("1 prep gaps");
  });

  it("the entry beat reads green until the party stands on it, then gold", () => {
    const mk = (r: string) => mount(QuestGraphOutline, { props: { beats: [beat("a")], entryBeatId: "a", presentations: { a: reach(r) } } }).get("li").classes();
    expect(mk("ahead")).toContain("bg-tone-success/15");
    expect(mk("current")).toContain("bg-primary/15");
    expect(mk("current")).not.toContain("bg-tone-success/15");
  });
});
