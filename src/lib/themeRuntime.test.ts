// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { THEMES } from "@/lib/themes";
import { activeThemeId, darkTwinId, darkTwinStyle, setOverride, setTheme, themeInMode } from "./themeRuntime";

describe("theme families", () => {
  it("pairs every theme with a member of the other mode", () => {
    for (const theme of THEMES) {
      const other = theme.mode === "light" ? "dark" : "light";
      const partner = THEMES.find((t) => t.id === themeInMode(theme.id, other));
      expect(partner?.family, theme.id).toBe(theme.family);
      expect(partner?.mode, theme.id).toBe(other);
    }
  });

  it("keeps a Vellum campaign in Vellum when the player prefers dark", () => {
    expect(themeInMode("vellum", "dark")).toBe("vellum-dark");
    expect(themeInMode("vellum-dark", "light")).toBe("vellum");
    expect(themeInMode("tome", "dark")).toBe("grimoire");
  });

  it("falls back to the classic pair for an unknown id", () => {
    expect(themeInMode("no-such-theme", "dark")).toBe("grimoire");
    expect(themeInMode("no-such-theme", "light")).toBe("tome");
  });
});

describe("dark twin", () => {
  const varsOf = (id: string) => THEMES.find((t) => t.id === id)?.vars;

  it("resolves vellum to vellum-dark's vars", () => {
    expect(darkTwinId("vellum")).toBe("vellum-dark");
    expect(darkTwinStyle("vellum")).toEqual(varsOf("vellum-dark"));
  });

  it("resolves tome to grimoire's vars", () => {
    expect(darkTwinId("tome")).toBe("grimoire");
    expect(darkTwinStyle("tome")).toEqual(varsOf("grimoire"));
  });

  it("returns an already-dark theme itself", () => {
    expect(darkTwinId("vellum-dark")).toBe("vellum-dark");
    expect(darkTwinStyle("grimoire")).toEqual(varsOf("grimoire"));
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  // Vellum sets the tones and entity ramps inline; tome leaves them to the
  // :root stylesheet. Without clearing, switching back would keep Vellum's
  // pigments painted over tome.
  it("clears properties the next theme does not set", () => {
    setOverride("campaign");
    const root = document.documentElement;

    setTheme("vellum");
    expect(root.style.getPropertyValue("--tone-success")).not.toBe("");
    expect(root.getAttribute("data-theme")).toBe("vellum");

    setTheme("tome");
    expect(root.style.getPropertyValue("--tone-success")).toBe("");
    expect(root.style.getPropertyValue("--primary-fill")).toBe("");
    expect(root.getAttribute("data-theme")).toBe("tome");
  });

  it("resolves overrides from the campaign theme, not the last applied one", () => {
    setOverride("campaign");
    setTheme("vellum");
    setOverride("dark");
    expect(activeThemeId.value).toBe("vellum-dark");
    setOverride("light");
    expect(activeThemeId.value).toBe("vellum");
    setOverride("campaign");
    expect(activeThemeId.value).toBe("vellum");
  });
});
