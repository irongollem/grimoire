/**
 * The bot check in front of sign-in, sign-up and password reset: Cloudflare
 * Turnstile, verified by Supabase Auth.
 *
 * Supabase Auth, once its CAPTCHA protection is on, refuses those three calls
 * unless each carries a token the browser earned from Turnstile. The setting
 * is project-wide, so every form that makes one of the calls needs a
 * `CaptchaGate` and the store actions take a `CaptchaSource` as a required
 * argument: a new auth form without one does not compile.
 *
 * Nothing here runs without `VITE_TURNSTILE_SITE_KEY`. That is every local
 * run, where the auth server has no CAPTCHA configured and ignores the token.
 */
import { isAuthApiError } from "@supabase/supabase-js";
import type { ShallowRef } from "vue";

/**
 * Hands out one token for one auth call, waiting for the check to finish if it
 * has not yet. Resolves `undefined` only where no site key is configured.
 */
export type CaptchaSource = () => Promise<string | undefined>;

const CAPTCHA_COPY =
  "The security check didn't go through. Turn off any content blocker for this page, then try again.";

/** The check could not produce a token: script blocked, widget errored, or the form went away. */
export class CaptchaUnavailableError extends Error {
  constructor() {
    super(CAPTCHA_COPY);
    this.name = "CaptchaUnavailableError";
  }
}

/**
 * True when the check itself failed, on either side: no token could be made
 * here, or the auth server could not verify the one it was sent. Neither
 * depends on the account, so saying so tells a visitor nothing about who is
 * signed up.
 */
export function isCaptchaFailure(err: unknown): boolean {
  return err instanceof CaptchaUnavailableError || (isAuthApiError(err) && err.code === "captcha_failed");
}

/** What an auth form shows for a failed call. The server's own captcha wording is not written for users. */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (isCaptchaFailure(err)) return CAPTCHA_COPY;
  return err instanceof Error ? err.message : fallback;
}

/**
 * The `CaptchaSource` for a form's `<CaptchaGate ref="captchaGate">`.
 *
 * The ref's name must not be the name of the variable this returns. Vue binds
 * a template ref to a same-named setup variable, finds a function there
 * instead of a ref, and in a production build the gate is never reached: the
 * form then fails on every submit while tests and the dev server stay green.
 */
export function captchaSource(gate: Readonly<ShallowRef<{ take: CaptchaSource } | null>>): CaptchaSource {
  return () => (gate.value ? gate.value.take() : Promise.reject(new CaptchaUnavailableError()));
}

export interface TurnstileOptions {
  sitekey: string;
  theme: "light" | "dark" | "auto";
  size: "normal" | "flexible" | "compact";
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "expired-callback": () => void;
  /** Returning true tells Turnstile the error was handled, so it does not also log it. */
  "error-callback": (code: string) => boolean;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | null = null;

/**
 * Loads Turnstile's script once per page. A failed load is not remembered, so
 * a visitor who switches a content blocker off can retry without reloading.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    const fail = () => {
      script.remove();
      loading = null;
      reject(new CaptchaUnavailableError());
    };
    script.addEventListener("load", () => (window.turnstile ? resolve(window.turnstile) : fail()));
    script.addEventListener("error", fail);
    document.head.append(script);
  });
  return loading;
}
