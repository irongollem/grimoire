import { ref } from "vue";

export function useScreenShake() {
  const isShaking = ref(false);

  function triggerShake(durationMs = 600) {
    isShaking.value = true;
    setTimeout(() => { isShaking.value = false; }, durationMs);
  }

  return { isShaking, triggerShake };
}
