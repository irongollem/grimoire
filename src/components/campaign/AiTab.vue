<template>
  <form class="max-w-md flex flex-col gap-6" @submit.prevent="save">

    <!-- Local Mode Toggle -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Key Storage Mode</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="localModeEnabled"
            type="checkbox"
            class="h-4 w-4 rounded border-border bg-background"
          />
          <span class="text-sm">Store keys locally on this device only</span>
        </label>
        <p class="font-fell text-xs text-muted-foreground italic">
          <span v-if="localModeEnabled" class="block text-yellow-600 dark:text-yellow-500 font-semibold mb-1">
            ⚠️ Local storage only: Your keys are not saved to your account. Using Grimoire on a different browser or device will require re-entering them.
          </span>
          <span v-else class="block text-green-600 dark:text-green-500">
            ✓ Encrypted in your account: Your keys are encrypted and stored securely in your campaign.
          </span>
        </p>
      </div>
    </div>

    <!-- Text AI API Key -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Text AI API Key</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Used for generating NPC descriptions, monster stat blocks, items, spells, and puzzles.
          Accepts OpenAI keys (<code class="text-xs">sk-…</code>) or Google Gemini keys (<code class="text-xs">AIza…</code>) — the provider is detected automatically.
          Leave blank to use the image key as a fallback (OpenAI only).
        </p>
        <div class="relative">
          <input
            v-model="form.text_api_key"
            :type="showTextKey ? 'text' : 'password'"
            placeholder="sk-… or AIza…"
            class="field-input pr-10"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            @click="showTextKey = !showTextKey"
          >
            <Eye v-if="!showTextKey" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </button>
        </div>
        <div class="flex gap-3 text-xs text-muted-foreground font-fell">
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Get OpenAI key →</a>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Get Gemini key →</a>
        </div>
      </div>
    </div>

    <!-- Image AI API Key -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Image AI API Key</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Used for portrait and artwork generation (OpenAI only).
          <span v-if="localModeEnabled">Your key is stored on this device only.</span>
          <span v-else>Your key is encrypted and stored in your campaign, protected by your account. It is never shared with other players.</span>
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline"
          >Get a key →</a>
        </p>
        <div class="relative">
          <input
            v-model="form.openai_api_key"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-…"
            class="field-input pr-10"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            @click="showKey = !showKey"
          >
            <Eye v-if="!showKey" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Setting prompt -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Campaign Setting Prompt</span>
        <button
          v-if="settingDefaultPrompt"
          type="button"
          class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
          @click="form.ai_setting_prompt = settingDefaultPrompt"
        >
          Load {{ settingLabel }} Defaults
        </button>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Describe your world's tone, aesthetic, and feel. This is included in every AI generation request to keep all content consistent with your campaign.
        </p>
        <textarea
          v-model="form.ai_setting_prompt"
          rows="6"
          placeholder="Describe the visual tone of your world — palette, materials, lighting, atmosphere, and character style. e.g. Frozen northern survival fantasy. Favour cold blues, greys, bone tones, weathered leather and fur. Use blizzard haze, moonlit ice, and dim firelight to support the subject. Characters wear practical cold-weather gear with cultural details through scars, markings, and trophies. Keep the mood solemn, hardy, and world-consistent."
          class="field-input resize-none"
        />
      </div>
    </div>

    <div class="flex justify-end">
      <button
        type="submit"
        :disabled="isSaving"
        class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {{ isSaving ? "Saving…" : "Save" }}
      </button>
    </div>

  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { encryptApiKey, primeDecryptCache } from "@/lib/apiKeyVault";
import { getSetting } from "@/settings/index";

const LOCAL_MODE_KEY = "grimoire_openai_key_mode";
const LOCAL_KEY_STORAGE = "grimoire_openai_key";
const TEXT_LOCAL_MODE_KEY = "grimoire_text_key_mode";
const TEXT_LOCAL_KEY_STORAGE = "grimoire_text_key";

const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const form = ref({
  openai_api_key: campaign.activeCampaign?.openai_api_key ?? "",
  text_api_key: campaign.activeCampaign?.text_api_key ?? "",
  ai_setting_prompt: campaign.activeCampaign?.ai_setting_prompt ?? "",
});

const showKey = ref(false);
const showTextKey = ref(false);
const isSaving = ref(false);
// Single local mode toggle applies to both keys for simplicity
const localModeEnabled = ref(localStorage.getItem(LOCAL_MODE_KEY) === "local");

const activeSetting = computed(() => getSetting(campaign.activeCampaign?.calendar_id ?? ""));
const settingDefaultPrompt = computed(() => activeSetting.value?.defaultAiPrompt ?? "");
const settingLabel = computed(() => activeSetting.value?.label ?? "Setting");

watch(
  () => campaign.activeCampaign,
  (c) => {
    if (c) {
      form.value.openai_api_key = c.openai_api_key ?? "";
      form.value.text_api_key = c.text_api_key ?? "";
      form.value.ai_setting_prompt = c.ai_setting_prompt ?? "";
    }
  },
);

async function save() {
  if (!campaign.activeCampaignId || !campaign.activeCampaign) return;
  isSaving.value = true;
  try {
    let imageKeyValue: string | null = null;
    let textKeyValue: string | null = null;

    if (localModeEnabled.value) {
      // Local mode: save both to localStorage, clear from DB
      const trimmedImage = form.value.openai_api_key.trim();
      if (trimmedImage) localStorage.setItem(LOCAL_KEY_STORAGE, trimmedImage);
      else localStorage.removeItem(LOCAL_KEY_STORAGE);

      const trimmedText = form.value.text_api_key.trim();
      if (trimmedText) localStorage.setItem(TEXT_LOCAL_KEY_STORAGE, trimmedText);
      else localStorage.removeItem(TEXT_LOCAL_KEY_STORAGE);

      localStorage.setItem(LOCAL_MODE_KEY, "local");
      localStorage.setItem(TEXT_LOCAL_MODE_KEY, "local");
    } else {
      // DB mode: encrypt both, clear localStorage
      const trimmedImage = form.value.openai_api_key.trim();
      if (trimmedImage) {
        imageKeyValue = await encryptApiKey(trimmedImage);
        primeDecryptCache(imageKeyValue, trimmedImage);
      }

      const trimmedText = form.value.text_api_key.trim();
      if (trimmedText) {
        textKeyValue = await encryptApiKey(trimmedText);
        primeDecryptCache(textKeyValue, trimmedText);
      }

      localStorage.removeItem(LOCAL_KEY_STORAGE);
      localStorage.removeItem(LOCAL_MODE_KEY);
      localStorage.removeItem(TEXT_LOCAL_KEY_STORAGE);
      localStorage.removeItem(TEXT_LOCAL_MODE_KEY);
    }

    const updated = await updateCampaign({
      id: campaign.activeCampaignId,
      update: {
        openai_api_key: imageKeyValue,
        text_api_key: textKeyValue,
        ai_setting_prompt: form.value.ai_setting_prompt.trim() || null,
      },
    });
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}
</script>
