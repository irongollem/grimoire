<template>
  <div ref="host" :class="interactive ? (compact ? 'flex justify-center' : undefined) : 'absolute'" />
</template>

<script setup lang="ts">
/**
 * The bot check for an auth form. Sits above the submit button, shows nothing
 * unless Turnstile asks for a click, and hands the form's store call a token
 * through `take()`. See `lib/auth/captcha.ts` for why every auth form has one.
 */
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { CaptchaUnavailableError, loadTurnstile, type TurnstileApi } from "@/lib/auth/captcha";
import { reportHandledError } from "@/lib/observability/sentry";
import { useTheme } from "@/composables/useTheme";

const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const host = useTemplateRef<HTMLElement>("host");
const { activeThemeId, themes } = useTheme();

// Turnstile draws nothing unless it wants a click from the visitor, which for
// most people is never. Until then the host is taken out of the flow, so an
// empty box does not add a gap to the form's `space-y`. It is not hidden with
// `display: none`: the check has to run in a rendered element.
const interactive = ref(false);
// Turnstile's full-width widget is never narrower than 300px, and the auth
// card's content box is narrower than that on a phone. Its compact widget is
// 150px wide and stands centred instead.
const MIN_FLEXIBLE_WIDTH = 300;
const compact = ref(false);

let api: TurnstileApi | null = null;
let widgetId: string | null = null;
let starting = false;
let unmounted = false;
let token: string | null = null;
let waiters: { resolve: (token: string) => void; reject: (err: Error) => void }[] = [];

// A submit can also wait on a check that never answers at all, neither token
// nor error, and the button sits on its loading label for good. That leaves no
// trace anywhere, so a submit still waiting after this long, while Turnstile is
// not asking the visitor for a click, is reported as a stall.
const STALL_MS = 20_000;
let stallTimer: ReturnType<typeof setTimeout> | undefined;

function watchForStall() {
  if (stallTimer !== undefined) return;
  stallTimer = setTimeout(() => {
    stallTimer = undefined;
    if (waiters.length === 0) return;
    // Waiting on the visitor's click is not a stall; look again later.
    if (interactive.value) watchForStall();
    else report("Turnstile gave no token", "stall", { waitedMs: STALL_MS, widgetRendered: widgetId !== null });
  }, STALL_MS);
}

function stopWatchingForStall() {
  clearTimeout(stallTimer);
  stallTimer = undefined;
}

function rejectWaiters() {
  stopWatchingForStall();
  const waiting = waiters;
  waiters = [];
  for (const waiter of waiting) waiter.reject(new CaptchaUnavailableError());
}

// A token is good for one auth call, so handing one out starts the next
// challenge straight away: a mistyped password is retried with a fresh token
// already waiting, not after another round trip.
function handOut(fresh: string, resolve: (token: string) => void) {
  token = null;
  resolve(fresh);
  if (api && widgetId !== null) api.reset(widgetId);
}

function onToken(fresh: string) {
  interactive.value = false;
  const waiter = waiters.shift();
  if (waiter) handOut(fresh, waiter.resolve);
  else token = fresh;
  if (waiters.length === 0) stopWatchingForStall();
}

function onError(code: string): boolean {
  token = null;
  // A failed check stays on screen ("Verification failed", with Turnstile's
  // Troubleshoot link) after the interaction that preceded it has ended, so
  // the host goes back into the flow; out of it, the failure box sat on top
  // of the submit button.
  interactive.value = true;
  rejectWaiters();
  report(code.startsWith("110") ? `Turnstile configuration error ${code}` : `Turnstile error ${code}`, code);
  return true;
}

// Every failure is reported, because this widget stands in front of sign-in:
// when it breaks, nobody gets past it, and a visitor stuck on it can tell us
// nothing. The 110xxx family is configuration (a wrong site key, a hostname
// missing from the widget's list), which fails every visitor and only we can
// fix; the rest are usually one browser's trouble (a blocker, a privacy mode)
// and are grouped per code, so a code that turns up everywhere stands out.
// Once per code per page: Turnstile retries on its own and would otherwise
// report the same failure every few seconds.
const reported = new Set<string>();

function report(message: string, code: string, extra?: Record<string, unknown>) {
  if (reported.has(code) || isUnlistedDeploymentHost(code)) return;
  reported.add(code);
  reportHandledError(new Error(message), "CaptchaGate", { code, ...extra });
}

// 110200 is "domain not allowed". Every Vercel deployment also answers on its
// own `<hash>.vercel.app` URL, which changes per deploy and so can never be on
// the widget's list, and Vercel's deployment check loads each one's /login:
// two reports per release, from no user, for a hostname nobody signs in on.
function isUnlistedDeploymentHost(code: string): boolean {
  return code === "110200" && window.location.hostname.endsWith(".vercel.app");
}

async function start() {
  if (!siteKey || !host.value || starting || widgetId !== null) return;
  starting = true;
  try {
    api = await loadTurnstile();
    if (unmounted) return;
    // Measured on the form: the host itself has no width while out of the flow.
    compact.value = (host.value.parentElement?.clientWidth ?? MIN_FLEXIBLE_WIDTH) < MIN_FLEXIBLE_WIDTH;
    widgetId = api.render(host.value, {
      sitekey: siteKey,
      theme: themes.find((t) => t.id === activeThemeId.value)?.mode ?? "auto",
      size: compact.value ? "compact" : "flexible",
      appearance: "interaction-only",
      callback: onToken,
      "expired-callback": () => (token = null),
      "error-callback": onError,
      "before-interactive-callback": () => (interactive.value = true),
      "after-interactive-callback": () => (interactive.value = false),
    });
  } catch {
    // Almost always a content blocker, which the form's message names; it is
    // still a visitor who cannot sign in.
    report("Turnstile script did not load", "script");
    rejectWaiters();
  } finally {
    starting = false;
  }
}

/** One token for one auth call. Waits for the check, including a click if Turnstile asks for one. */
function take(): Promise<string | undefined> {
  if (!siteKey) return Promise.resolve(undefined);
  const ready = token;
  if (ready) return new Promise((resolve) => handOut(ready, resolve));
  const waiting = new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }));
  watchForStall();
  // No widget means the script did not load; asking again is the retry.
  void start();
  return waiting;
}

onMounted(start);

onBeforeUnmount(() => {
  unmounted = true;
  // A store action still waiting here would otherwise never settle, and leave
  // `auth.loading` stuck on.
  rejectWaiters();
  if (api && widgetId !== null) api.remove(widgetId);
});

defineExpose({ take });
</script>
