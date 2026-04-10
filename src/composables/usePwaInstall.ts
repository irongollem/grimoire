import { ref, computed } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const dismissed = ref(false);

// Called from main.ts before Vue mounts so we never miss the early-fire event.
export function captureInstallPrompt(e: Event) {
  e.preventDefault();
  deferredPrompt.value = e as BeforeInstallPromptEvent;
}

export function usePwaInstall() {
  const canInstall = computed(() => deferredPrompt.value !== null && !dismissed.value);

  async function install() {
    if (!deferredPrompt.value) return;
    await deferredPrompt.value.prompt();
    await deferredPrompt.value.userChoice;
    deferredPrompt.value = null;
  }

  function dismiss() {
    dismissed.value = true;
  }

  return { canInstall, install, dismiss };
}
