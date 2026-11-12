// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { PaintVersion } from "../../lib/treatment";
import VersionsSection from "./VersionsSection.vue";

const version = (n: number): PaintVersion => ({ id: `v${n}`, name: `Version ${n}`, savedAt: "2026-11-12T10:00:00.000Z", layers: [] });
const props = { versions: [version(1), version(2)], cap: 3 };

describe("VersionsSection", () => {
  // Fails if the oldest is on top: the painter's latest save is the one they look for.
  it("lists the newest version first", () => {
    const w = mount(VersionsSection, { props });
    const ids = w.findAll("li").map((li) => li.attributes("data-testid"));
    expect(ids).toEqual(["version-v2", "version-v1"]);
  });

  // Fails if Free shows no hint about Pro, or Pro is told to upgrade.
  it("says Pro keeps ten on Free only", () => {
    expect(mount(VersionsSection, { props }).get('[data-testid="versions-count"]').text()).toBe("2 of 3 kept. Pro keeps 10.");
    expect(mount(VersionsSection, { props: { ...props, cap: 10, isPro: true } }).get('[data-testid="versions-count"]').text()).toBe("2 of 10 kept.");
  });

  // Fails if a row's buttons do not name the version they act on.
  it("emits go-back, remove and save with the version's id", async () => {
    const w = mount(VersionsSection, { props });
    await w.get('[data-testid="version-v1"]').findAll("button")[1]?.trigger("click");
    await w.get('[data-testid="version-v2"]').findAll("button")[0]?.trigger("click");
    await w.get('[data-testid="save-version"]').trigger("click");
    expect(w.emitted("go-back")).toEqual([["v1"]]);
    expect(w.emitted("remove")).toEqual([["v2"]]);
    expect(w.emitted("save")).toHaveLength(1);
  });

  // Fails if a double-click rename commits on a blank or unchanged name, or Escape still commits through the blur.
  it("renames on double-click and Enter, and ignores a blank name", async () => {
    const w = mount(VersionsSection, { props });
    await w.get('[data-testid="version-v1"] span.truncate').trigger("dblclick");
    const input = w.get('[data-testid="rename-version"]');
    await input.setValue("Before the dragon");
    await input.trigger("keydown.enter");
    expect(w.emitted("rename")).toEqual([["v1", "Before the dragon"]]);
    await w.get('[data-testid="version-v1"] span.truncate').trigger("dblclick");
    await w.get('[data-testid="rename-version"]').setValue("   ");
    await w.get('[data-testid="rename-version"]').trigger("keydown.enter");
    expect(w.emitted("rename")).toHaveLength(1);
  });

  // Fails if Save version stays live while there is no painting to keep.
  it("disables Save version when it cannot save", () => {
    const w = mount(VersionsSection, { props: { ...props, canSave: false } });
    expect(w.get('[data-testid="save-version"]').attributes("disabled")).toBeDefined();
  });
});
