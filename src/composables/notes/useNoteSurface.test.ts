import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import { currentNoteSurface, provideNoteSurface, type NoteSurface } from "./useNoteSurface";

const surface = (id: string | null): Omit<NoteSurface, "instance"> => ({ noteId: () => id, title: () => "", sessionNum: () => null, insertChronicle: vi.fn(), insertScene: vi.fn() });

describe("provideNoteSurface", () => {
  // Fails on: the Familiar's card inserting into a note editor that has been closed, losing a chronicle the DM paid for.
  it("is the open note while its editor lives, and nothing once the editor goes", () => {
    const scope = effectScope();
    const mine = surface("n1");
    scope.run(() => provideNoteSurface(mine));
    expect(currentNoteSurface.value).toMatchObject(mine);
    scope.stop();
    expect(currentNoteSurface.value).toBeNull();
  });

  // Fails on: opening a second note before the first editor is torn down, then the first's teardown closing the second's surface.
  it("is not taken away by an older editor going after a newer one registered", () => {
    const older = effectScope();
    const newer = effectScope();
    older.run(() => provideNoteSurface(surface("n1")));
    const second = surface("n2");
    newer.run(() => provideNoteSurface(second));
    older.stop();
    expect(currentNoteSurface.value).toMatchObject(second);
    newer.stop();
  });
});
