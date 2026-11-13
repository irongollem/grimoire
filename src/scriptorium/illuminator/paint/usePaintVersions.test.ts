import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { PaintLayerRecord, PaintStep, PaintVersion } from "../lib/treatment";
import { FREE_VERSIONS, PRO_VERSIONS, freedUrls, nextVersionName, usePaintVersions, type PaintVersionsDeps } from "./usePaintVersions";

const rec = (id: string, url: string): PaintLayerRecord => ({ id, name: id, blend: "source-over", opacity: 1, visible: true, lockAlpha: false, chunks: { "0,0": url } });
const version = (n: number, url = `u/ill-paint-v${n}.webp`): PaintVersion => ({ id: `v${n}`, name: `Version ${n}`, savedAt: "2026-11-12T10:00:00.000Z", layers: [rec("a", url)] });
const stepWith = (versions: PaintVersion[], url = "u/ill-paint-now.webp"): PaintStep => ({ type: "paint", width: 100, height: 100, paper: null, layers: [rec("a", url)], ...(versions.length ? { versions } : {}) });

function setup(over: { versions?: PaintVersion[]; isPro?: boolean; changes?: boolean; confirm?: boolean } = {}) {
  const step = ref<PaintStep | null>(stepWith(over.versions ?? []));
  let saved = 0;
  const deps = {
    step,
    ready: () => true,
    hasPainting: () => true,
    isPro: () => over.isPro === true,
    hasChanges: () => over.changes === true,
    // Done's save: new chunk files, versions carried along.
    save: vi.fn(async () => {
      saved++;
      const cur = step.value;
      if (cur) step.value = { ...cur, layers: [rec("a", `u/ill-paint-save${saved}.webp`)] };
    }),
    restore: vi.fn(async (_layers: PaintLayerRecord[]) => undefined),
    confirm: vi.fn(async () => over.confirm !== false),
    release: vi.fn(),
    fail: vi.fn(),
    now: () => new Date("2026-11-12T12:00:00.000Z"),
    newId: () => `id${saved}`,
  } satisfies PaintVersionsDeps;
  return { deps, step, api: usePaintVersions(deps) };
}

describe("saving a version", () => {
  // Fails if a version is not appended after a save, so the painter has nothing to go back to; or is named wrongly.
  it("saves the painting first, then appends a named, timed version of those layers", async () => {
    const { deps, step, api } = setup();
    await api.save();
    expect(deps.save).toHaveBeenCalledOnce();
    expect(deps.confirm).not.toHaveBeenCalled();
    const v = step.value?.versions;
    expect(v).toHaveLength(1);
    expect(v?.[0]).toMatchObject({ name: "Version 1", savedAt: "2026-11-12T12:00:00.000Z" });
    expect(v?.[0]?.layers[0]?.chunks["0,0"]).toBe("u/ill-paint-save1.webp");
  });

  // Fails if a version shares its records with the live painting, so the next save rewrites the version's file list.
  it("keeps its own copy of the layer records", async () => {
    const { step, api } = setup();
    await api.save();
    const v = step.value?.versions?.[0];
    expect(v?.layers[0]).not.toBe(step.value?.layers[0]);
    expect(v?.layers[0]?.chunks).not.toBe(step.value?.layers[0]?.chunks);
  });

  // Fails if the number repeats after a delete or follows renames ("Version 2" given twice), so two rows look the same.
  it("numbers one more than the highest so far", () => {
    expect(nextVersionName([])).toBe("Version 1");
    expect(nextVersionName([version(1), { ...version(5), name: "Before the sky" }, version(3)])).toBe("Version 4");
  });

  // Fails if Free keeps more than 3 or Pro fewer than 10, or if the cap is read once instead of per account.
  it("holds three on Free and ten on Pro", () => {
    expect(FREE_VERSIONS).toBe(3);
    expect(PRO_VERSIONS).toBe(10);
    expect(setup({ isPro: false }).api.cap.value).toBe(3);
    expect(setup({ isPro: true }).api.cap.value).toBe(10);
  });

  // Fails if a Free painter at three versions silently loses the oldest without being asked, or is asked below the cap.
  it("asks before the oldest makes room on Free, and not before", async () => {
    const two = setup({ versions: [version(1), version(2)] });
    await two.api.save();
    expect(two.deps.confirm).not.toHaveBeenCalled();
    const three = setup({ versions: [version(1), version(2), version(3)] });
    await three.api.save();
    expect(three.deps.confirm).toHaveBeenCalledWith("Keep this version? Your oldest, Version 1, makes room.", expect.anything());
    expect(three.step.value?.versions?.map((v) => v.name)).toEqual(["Version 2", "Version 3", "Version 4"]);
  });

  // Fails if Pro is capped at the Free number, or kept to ten but asked at nine.
  it("lets Pro keep ten, asking only at the eleventh", async () => {
    const nine = setup({ isPro: true, versions: Array.from({ length: 9 }, (_, i) => version(i + 1)) });
    await nine.api.save();
    expect(nine.deps.confirm).not.toHaveBeenCalled();
    expect(nine.step.value?.versions).toHaveLength(10);
    await nine.api.save();
    expect(nine.deps.confirm).toHaveBeenCalledOnce();
    expect(nine.step.value?.versions).toHaveLength(10);
  });

  // Fails if saying no still uploads the painting or drops the oldest.
  it("does nothing when the painter declines", async () => {
    const { deps, step, api } = setup({ versions: [version(1), version(2), version(3)], confirm: false });
    await api.save();
    expect(deps.save).not.toHaveBeenCalled();
    expect(step.value?.versions).toHaveLength(3);
    expect(deps.release).not.toHaveBeenCalled();
  });

  // Fails if a dropped version's files are offered for deletion while the painting or another version still uses them (the painting would lose its pixels).
  it("frees only the files the dropped version alone used", async () => {
    const shared = "u/ill-paint-shared.webp";
    const oldest = { ...version(1, "u/ill-paint-only1.webp"), layers: [rec("a", "u/ill-paint-only1.webp"), rec("b", shared)] };
    const next = version(2, shared);
    const { deps, api } = setup({ versions: [oldest, next, version(3)] });
    await api.save();
    expect(deps.release).toHaveBeenCalledWith(["u/ill-paint-only1.webp"]);
  });

  // Fails if nothing is freed after a failed save (leaving the old version alone is right) or if a failed save still drops the oldest.
  it("drops nothing and says so when the save fails", async () => {
    const { deps, step, api } = setup({ versions: [version(1), version(2), version(3)] });
    deps.save.mockRejectedValueOnce(new Error("offline"));
    await api.save();
    expect(deps.fail).toHaveBeenCalled();
    expect(step.value?.versions).toHaveLength(3);
    expect(deps.release).not.toHaveBeenCalled();
  });

  // Fails if a Free painter who was Pro (more versions than the cap) is left over the cap after saving.
  it("trims down to the cap when an account holds more than it keeps", async () => {
    const { step, api } = setup({ versions: [1, 2, 3, 4, 5].map((n) => version(n)) });
    await api.save();
    expect(step.value?.versions?.map((v) => v.name)).toEqual(["Version 4", "Version 5", "Version 6"]);
  });
});

describe("going back", () => {
  // Fails if going back over unsaved work does not ask, which loses it with no warning.
  it("asks when there are changes since the last save, and not otherwise", async () => {
    const dirty = setup({ versions: [version(1)], changes: true });
    await dirty.api.goBack("v1");
    expect(dirty.deps.confirm).toHaveBeenCalledOnce();
    expect(dirty.deps.restore).toHaveBeenCalledOnce();
    const clean = setup({ versions: [version(1)], changes: false });
    await clean.api.goBack("v1");
    expect(clean.deps.confirm).not.toHaveBeenCalled();
    expect(clean.deps.restore).toHaveBeenCalledOnce();
  });

  // Fails if declining still replaces the layers.
  it("leaves the painting alone when declined", async () => {
    const { deps, api } = setup({ versions: [version(1)], changes: true, confirm: false });
    await api.goBack("v1");
    expect(deps.restore).not.toHaveBeenCalled();
  });

  // Fails if the session is handed the version's own records, so later edits would change the saved version.
  it("hands the session a copy of the version's layers", async () => {
    const v = version(1);
    const { deps, api } = setup({ versions: [v] });
    await api.goBack("v1");
    const given = deps.restore.mock.calls[0]?.[0];
    expect(given).toEqual(v.layers);
    expect(given?.[0]?.chunks).not.toBe(v.layers[0]?.chunks);
  });

  // Fails if a version whose files cannot be read breaks the panel silently.
  it("says so when a version cannot be loaded", async () => {
    const { deps, api } = setup({ versions: [version(1)] });
    deps.restore.mockRejectedValueOnce(new Error("404"));
    await api.goBack("v1");
    expect(deps.fail).toHaveBeenCalled();
  });
});

describe("renaming and deleting", () => {
  // Fails if a blank name wipes the label, or the rename is lost from the step Done writes.
  it("renames, ignoring a blank name", () => {
    const { step, api } = setup({ versions: [version(1)] });
    api.rename("v1", "  Before the dragon  ");
    expect(step.value?.versions?.[0]?.name).toBe("Before the dragon");
    api.rename("v1", "   ");
    expect(step.value?.versions?.[0]?.name).toBe("Before the dragon");
  });

  // Fails if delete does not ask, or frees a file the painting still uses.
  it("asks before deleting and frees only the files nothing else uses", async () => {
    const { deps, step, api } = setup({ versions: [version(1, "u/ill-paint-now.webp"), version(2)] });
    await api.remove("v1");
    expect(deps.confirm).toHaveBeenCalledOnce();
    expect(step.value?.versions?.map((v) => v.id)).toEqual(["v2"]);
    expect(deps.release).not.toHaveBeenCalled();
  });

  // Fails if declining still deletes, or if the last delete leaves an empty list in the recipe.
  it("keeps the version when declined, and leaves no empty list behind", async () => {
    const declined = setup({ versions: [version(1)], confirm: false });
    await declined.api.remove("v1");
    expect(declined.step.value?.versions).toHaveLength(1);
    const last = setup({ versions: [version(1)] });
    await last.api.remove("v1");
    expect(last.step.value).not.toHaveProperty("versions");
    expect(last.deps.release).toHaveBeenCalledWith(["u/ill-paint-v1.webp"]);
  });
});

describe("freedUrls", () => {
  // Fails if a file used by a remaining version is freed.
  it("keeps files the current painting or a kept version names", () => {
    const step = stepWith([version(2, "u/ill-paint-v1.webp")]);
    expect(freedUrls([version(1)], step)).toEqual([]);
    expect(freedUrls([version(9)], step)).toEqual(["u/ill-paint-v9.webp"]);
  });
});
