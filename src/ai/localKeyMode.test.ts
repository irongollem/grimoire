// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { LOCAL_MODE_KEY } from "@/lib/localKeyVault";
import { imagesRunOnLocalKey, textRunsOnLocalKey } from "./localKeyMode";

describe("localKeyMode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("takes the server path when local mode was never chosen", async () => {
    useCampaignStore().decryptedAnthropicKey = "sk-ant";
    expect(await textRunsOnLocalKey()).toBe(false);
  });

  it("runs locally when local mode is chosen and a key decrypted", async () => {
    window.localStorage.setItem(LOCAL_MODE_KEY, "local");
    useCampaignStore().decryptedAnthropicKey = "sk-ant";
    expect(await textRunsOnLocalKey()).toBe(true);
  });

  it("falls back to the server when local mode is chosen but no key could be read", async () => {
    window.localStorage.setItem(LOCAL_MODE_KEY, "local");
    expect(await textRunsOnLocalKey()).toBe(false);
    expect(await imagesRunOnLocalKey()).toBe(false);
  });

  it.each(["decryptedOpenAiKey", "decryptedAnthropicKey", "decryptedGeminiKey"] as const)(
    "any one text key is enough to run locally (%s)",
    async (field) => {
      window.localStorage.setItem(LOCAL_MODE_KEY, "local");
      useCampaignStore()[field] = "key";
      expect(await textRunsOnLocalKey()).toBe(true);
    },
  );

  it("waits out a key still decrypting at boot instead of taking the server path (#1043)", async () => {
    // providerKeysLoading is a computed on the real store, so drive a stand-in for it.
    const pendingStore = reactive({
      providerKeysLoading: true,
      decryptedOpenAiKey: null as string | null,
      decryptedAnthropicKey: null as string | null,
      decryptedGeminiKey: null as string | null,
    });
    vi.resetModules();
    vi.doMock("@/stores/campaign", () => ({ useCampaignStore: () => pendingStore }));
    const fresh = await import("./localKeyMode");
    window.localStorage.setItem(LOCAL_MODE_KEY, "local");

    const pending = fresh.textRunsOnLocalKey();
    await new Promise((resolve) => setTimeout(resolve, 0));
    pendingStore.decryptedAnthropicKey = "sk-ant";
    pendingStore.providerKeysLoading = false;

    expect(await pending).toBe(true);
    vi.doUnmock("@/stores/campaign");
  });

  it("needs an image-capable key for images", async () => {
    window.localStorage.setItem(LOCAL_MODE_KEY, "local");
    const store = useCampaignStore();
    store.decryptedAnthropicKey = "sk-ant";
    expect(await imagesRunOnLocalKey()).toBe(false);
    store.decryptedGeminiKey = "gm";
    expect(await imagesRunOnLocalKey()).toBe(true);
  });
});
