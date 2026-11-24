import { effectScope } from "vue";
import { describe, expect, it } from "vitest";
import { currentDescribeSurface, provideDescribeSurface, type DescribeSurface } from "./useDescribeSurface";

const surface = (): DescribeSurface => ({ campaignId: () => "c1", shapes: () => [], hasTarget: () => true, start: () => undefined });

describe("provideDescribeSurface", () => {
  // Fails on: the card painting for a book whose panel is gone, where nothing can land the picture.
  it("is the open panel while it lives, and nothing once it goes", () => {
    const scope = effectScope();
    const mine = surface();
    scope.run(() => provideDescribeSurface(mine));
    expect(currentDescribeSurface.value).toBe(mine);
    scope.stop();
    expect(currentDescribeSurface.value).toBeNull();
  });

  // Fails on: a book opened over another taking the new panel's surface away when the old panel goes.
  it("is not taken away by an older panel going after a newer one registered", () => {
    const older = effectScope();
    const newer = effectScope();
    older.run(() => provideDescribeSurface(surface()));
    const second = surface();
    newer.run(() => provideDescribeSurface(second));
    older.stop();
    expect(currentDescribeSurface.value).toBe(second);
    newer.stop();
  });
});
