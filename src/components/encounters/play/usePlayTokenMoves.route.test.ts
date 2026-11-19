import { computed, effectScope, ref } from "vue";
import { describe, expect, it } from "vitest";
import { OPEN_GROUND, type Cell } from "@/lib/battlemap/movement";
import type { RunCombatant } from "@/types/encounter.types";
import type { PlayTool } from "./playTypes";
import { usePlayTokenMoves, type MoveMapState, type MoveTurnBook } from "./usePlayTokenMoves";

const rosie = { instance_id: "p-1", type: "player", name: "Rosie", faction_id: "players", position: { x: 0, y: 0 } } as RunCombatant;

/** One token on open ground, moved by clicking squares, with the route the test gives. */
function mover(route?: (mover: RunCombatant, to: Cell) => readonly Cell[] | null) {
  const moved: Cell[] = [];
  const state: MoveMapState = {
    placed: computed(() => [rosie]),
    monsters: computed(() => []),
    activeInstanceId: computed(() => null),
    moveTerrain: computed(() => OPEN_GROUND),
    moveCombatant: (_id, position) => {
      moved.push(position);
    },
  };
  const book: MoveTurnBook = { availableMonsters: [], availableNpcs: [], started: false, combatants: [], recordMove: () => {}, undoMove: () => null };
  const moves = effectScope().run(() =>
    usePlayTokenMoves({
      ...(route ? { route } : {}),
      state,
      store: book,
      selectedId: () => "p-1",
      groupIds: () => [],
      partyMembers: () => [],
      canEdit: computed(() => true),
      tool: ref<PlayTool>("move"),
      placing: () => false,
      select: () => {},
      selectGroup: () => {},
    }),
  )!;
  return { moves, moved };
}

describe("usePlayTokenMoves: a routed mover", () => {
  // Bug caught (seen live): a player's own token walked, and its line was drawn, straight through a wall.
  it("goes nowhere when the route says there is no way", () => {
    const { moves, moved } = mover(() => null);
    moves.clickSquare({ x: 3, y: 0 });
    expect(moved).toEqual([]);
  });

  // Bug caught: the route asked for and then ignored, so the line is still the straight one.
  it("walks the squares the route gives, in order", () => {
    const { moves, moved } = mover(() => [{ x: 0, y: 1 }, { x: 1, y: 2 }]);
    moves.hover.value = { x: 2, y: 2 };
    expect(moves.preview.value?.lines[0].steps).toEqual([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
    moves.clickSquare({ x: 2, y: 2 });
    expect(moved).toEqual([{ x: 2, y: 2 }]);
  });

  // The Dungeon Master is never blocked: with no route the line is the straight one, as it always was.
  it("leaves an unrouted mover its straight line", () => {
    const { moves } = mover();
    moves.hover.value = { x: 2, y: 0 };
    expect(moves.preview.value?.lines[0].steps).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });
});
