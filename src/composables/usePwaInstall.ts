import { ref, computed, onMounted, onUnmounted } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const dismissed = ref(false);

export function usePwaInstall() {
  function onBeforeInstallPrompt(e: Event) {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
  }

  onMounted(() => window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt));
  onUnmounted(() => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt));

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
