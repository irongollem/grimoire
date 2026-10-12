import { describe, it, expect, beforeEach, vi } from "vitest";
import { useListLayout } from "./useListLayout";

const KEY = "grimoire:list-layouts";

describe("useListLayout", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("starts at the default", () => {
    expect(useListLayout("a", "grid").value).toBe("grid");
    expect(useListLayout("b", "rows").value).toBe("rows");
  });

  it("stores a choice and shares it between callers with the same key", () => {
    const header = useListLayout("npcs", "grid");
    const body = useListLayout("npcs", "grid");
    header.value = "rows";
    expect(body.value).toBe("rows");
  });

  it("keeps lists independent", () => {
    useListLayout("npcs", "grid").value = "rows";
    expect(useListLayout("monsters", "grid").value).toBe("grid");
  });

  it("falls back to the default for an unknown stored value", async () => {
    localStorage.setItem(KEY, JSON.stringify({ npcs: "gallery" }));
    // The shared ref reads storage once, like a reload does, so use a fresh module.
    vi.resetModules();
    const fresh = await import("./useListLayout");
    expect(fresh.useListLayout("npcs", "grid").value).toBe("grid");
  });
});
