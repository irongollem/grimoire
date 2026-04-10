import { ref, onUnmounted } from "vue";

const enabled = ref(false);
let lock: WakeLockSentinel | null = null;

async function acquire() {
  if (!("wakeLock" in navigator)) return;
  try {
    lock = await navigator.wakeLock.request("screen");
    enabled.value = true;
    lock.addEventListener("release", () => { enabled.value = false; lock = null; }, { once: true });
  } catch {
    enabled.value = false;
  }
}

async function release() {
  await lock?.release();
  lock = null;
  enabled.value = false;
}

// Re-acquire after the page becomes visible again (tab switch, screen on).
async function onVisibilityChange() {
  if (document.visibilityState === "visible" && enabled.value && !lock) {
    await acquire();
  }
}

export function useWakeLock() {
  document.addEventListener("visibilitychange", onVisibilityChange);
  onUnmounted(() => document.removeEventListener("visibilitychange", onVisibilityChange));

  const isSupported = "wakeLock" in navigator;

  async function toggle() {
    if (enabled.value) await release();
    else await acquire();
  }

  return { enabled, isSupported, toggle };
}
