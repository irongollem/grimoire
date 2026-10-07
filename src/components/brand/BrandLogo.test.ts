import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import BrandLogo from "./BrandLogo.vue";
import { THEMES } from "@/lib/themes";

const route = { meta: {} as Record<string, unknown> };
const activeThemeId = ref("");

vi.mock("vue-router", () => ({ useRoute: () => route }));
vi.mock("@/composables/useTheme", () => ({ useTheme: () => ({ activeThemeId }) }));

const lightTheme = THEMES.find((t) => t.mode === "light");
const darkTheme = THEMES.find((t) => t.mode === "dark");
if (!lightTheme || !darkTheme) throw new Error("THEMES needs a light and a dark theme for this test");

const src = () => mount(BrandLogo).get("img").attributes("src");

describe("BrandLogo", () => {
  beforeEach(() => {
    route.meta = {};
  });

  it("follows the theme's mode", () => {
    activeThemeId.value = lightTheme.id;
    expect(src()).toBe("/brand/logo-light.webp");
    activeThemeId.value = darkTheme.id;
    expect(src()).toBe("/brand/logo-dark.webp");
  });

  it("is the dark lockup on a darkChrome route, whatever the viewer's mode", () => {
    activeThemeId.value = lightTheme.id;
    route.meta = { darkChrome: true };
    expect(src()).toBe("/brand/logo-dark.webp");
  });
});
