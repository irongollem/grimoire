import { ref } from "vue";

interface WakeLockState {
  enabled: boolean;
  lock: WakeLockSentinel | null;
}

const state: WakeLockState = { enabled: false, lock: null };
export const wakeLockEnabled = ref(false);

async function acquire() {
  if (!("wakeLock" in navigator) || state.lock) return;
  try {
    state.lock = await navigator.wakeLock.request("screen");
    state.enabled = true;
    wakeLockEnabled.value = true;
    state.lock.addEventListener("release", () => {
      state.lock = null;
      // Only clear the ref if the user didn't explicitly keep it enabled —
      // the visibilitychange handler will re-acquire when the page is visible again.
      if (!state.enabled) wakeLockEnabled.value = false;
    }, { once: true });
  } catch {
    // Browser denied (e.g. battery saver, permissions policy) — fail silently.
  }
}

async function release() {
  state.enabled = false;
  wakeLockEnabled.value = false;
  await state.lock?.release();
  state.lock = null;
}

// Registered once at the app level (main.ts) — survives component navigation.
export async function onWakeLockVisibilityChange() {
  if (document.visibilityState !== "visible" || !state.enabled) return;
  // Small delay: lets the browser finish its wake/dim cycle before we
  // request the lock again, reducing rendering glitches on mobile.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await acquire();
}

export function useWakeLock() {
  const isSupported = "wakeLock" in navigator;

  async function toggle() {
    if (state.enabled) await release();
    else await acquire();
  }

  return { enabled: wakeLockEnabled, isSupported, toggle };
}
