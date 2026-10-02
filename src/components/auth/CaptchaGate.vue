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

function rejectWaiters() {
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
  const waiter = waiters.shift();
  if (waiter) handOut(fresh, waiter.resolve);
  else token = fresh;
}

function onError(code: string): boolean {
  token = null;
  rejectWaiters();
  // 110xxx is Turnstile's configuration family: a wrong site key, or a
  // hostname missing from the widget's list. That fails for every visitor and
  // only we can fix it. The rest are one browser's trouble, which Turnstile
  // retries on its own.
  if (code.startsWith("110")) reportHandledError(new Error(`Turnstile configuration error ${code}`), "CaptchaGate");
  return true;
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
