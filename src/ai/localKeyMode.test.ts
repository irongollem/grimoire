// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
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

  it("needs an image-capable key for images", async () => {
    window.localStorage.setItem(LOCAL_MODE_KEY, "local");
    const store = useCampaignStore();
    store.decryptedAnthropicKey = "sk-ant";
    expect(await imagesRunOnLocalKey()).toBe(false);
    store.decryptedGeminiKey = "gm";
    expect(await imagesRunOnLocalKey()).toBe(true);
  });
});
