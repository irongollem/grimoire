import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { AuthApiError } from "@supabase/supabase-js";
import {
  authErrorMessage,
  captchaSource,
  CaptchaUnavailableError,
  isCaptchaFailure,
  loadTurnstile,
  type TurnstileApi,
} from "./captcha";

const CAPTCHA_FAILED = new AuthApiError("captcha verification process failed", 400, "captcha_failed");
const WRONG_PASSWORD = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");

describe("isCaptchaFailure", () => {
  it("is true for a token that could not be made and one the server could not verify", () => {
    expect(isCaptchaFailure(new CaptchaUnavailableError())).toBe(true);
    expect(isCaptchaFailure(CAPTCHA_FAILED)).toBe(true);
  });

  it("is false for every other failure", () => {
    expect(isCaptchaFailure(WRONG_PASSWORD)).toBe(false);
    expect(isCaptchaFailure(new TypeError("Failed to fetch"))).toBe(false);
    expect(isCaptchaFailure("nope")).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("replaces the server's captcha wording with copy a visitor can act on", () => {
    const message = authErrorMessage(CAPTCHA_FAILED, "fallback");
    expect(message).toContain("security check");
    expect(message).not.toContain("verification process");
    expect(authErrorMessage(new CaptchaUnavailableError(), "fallback")).toBe(message);
  });

  it("passes any other error's message through, and falls back for a non-error", () => {
    expect(authErrorMessage(WRONG_PASSWORD, "fallback")).toBe("Invalid login credentials");
    expect(authErrorMessage({ nope: true }, "fallback")).toBe("fallback");
  });
});

describe("captchaSource", () => {
  it("takes from the mounted gate", async () => {
    const gate = shallowRef({ take: async () => "tok" });
    await expect(captchaSource(gate)()).resolves.toBe("tok");
  });

  it("rejects when the form has no gate, so a missing one is never a silent no-token call", async () => {
    await expect(captchaSource(shallowRef(null))()).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });
});

/**
 * Looking at the running app found this, not a test: every form had
 * `ref="captcha"` beside `const captcha = captchaSource(…)`, signed in fine on
 * the dev server, and would have failed on every submit once built.
 */
describe("the forms that mount a CaptchaGate", () => {
  const sources = import.meta.glob<string>("/src/**/*.vue", { query: "?raw", import: "default", eager: true });
  const forms = Object.entries(sources).filter(([, source]) => source.includes("<CaptchaGate "));

  it("covers the four auth forms", () => {
    expect(forms.map(([path]) => path).sort()).toEqual([
      "/src/views/auth/ForgotPasswordView.vue",
      "/src/views/auth/JoinCampaignView.vue",
      "/src/views/auth/LoginView.vue",
      "/src/views/auth/SignupView.vue",
    ]);
  });

  it.each(forms)("%s names its template ref differently from every setup variable", (_path, source) => {
    const refs = [...source.matchAll(/<CaptchaGate ref="(\w+)"/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const name of new Set(refs)) {
      expect(source).not.toMatch(new RegExp(`(const|let|function)\\s+${name}\\b`));
    }
  });
});

describe("loadTurnstile", () => {
  const api: TurnstileApi = { render: () => "w1", reset: () => {}, remove: () => {} };
  let scripts: HTMLScriptElement[];

  beforeEach(() => {
    scripts = [];
    // Capture the tag without connecting it: happy-dom would otherwise answer
    // for the network itself.
    vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
      scripts.push(...(nodes as HTMLScriptElement[]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.turnstile;
  });

  it("rejects when the script is blocked, tries again on the next call, then loads only once", async () => {
    const blocked = loadTurnstile();
    scripts[0].dispatchEvent(new Event("error"));
    await expect(blocked).rejects.toBeInstanceOf(CaptchaUnavailableError);

    const retried = loadTurnstile();
    expect(scripts).toHaveLength(2);
    window.turnstile = api;
    scripts[1].dispatchEvent(new Event("load"));
    await expect(retried).resolves.toBe(api);

    // A load that worked is remembered for the life of the page, however many
    // forms ask for it.
    await expect(loadTurnstile()).resolves.toBe(api);
    expect(scripts).toHaveLength(2);
  });
});
