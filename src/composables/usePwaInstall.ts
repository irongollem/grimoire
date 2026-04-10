import { ref, computed } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);

// Called from main.ts before Vue mounts so we never miss the early-fire event.
export function captureInstallPrompt(e: Event) {
  e.preventDefault();
  deferredPrompt.value = e as BeforeInstallPromptEvent;
}

export function usePwaInstall() {
  // True when already running as an installed PWA (standalone/fullscreen).
  const isInstalled = computed(() =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );

  // Native prompt is available — Chrome/Edge fired beforeinstallprompt.
  const hasNativePrompt = computed(() => deferredPrompt.value !== null);

  // Show install UI whenever not already installed.
  const canInstall = computed(() => !isInstalled.value);

  async function install() {
    if (deferredPrompt.value) {
      await deferredPrompt.value.prompt();
      await deferredPrompt.value.userChoice;
      deferredPrompt.value = null;
    }
  }

  return { canInstall, hasNativePrompt, install };
}
