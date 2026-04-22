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

    <!-- Provider Keys -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">API Keys</span>
      </div>
      <div class="p-4 flex flex-col gap-4">
        <p class="font-fell text-xs text-muted-foreground italic">
          Store keys for every provider you want to use. Choose which provider is active for text and image generation below.
        </p>

        <div v-for="p in providerDefs" :key="p.id" class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <label class="font-cinzel text-xs text-muted-foreground tracking-wide">{{ p.label }}</label>
            <a :href="p.link" target="_blank" rel="noopener noreferrer" class="font-fell text-xs text-primary hover:underline">Get key →</a>
          </div>
          <div class="relative">
            <input
              v-model="form.keys[p.id]"
              :type="showKeys[p.id] ? 'text' : 'password'"
              :placeholder="p.placeholder"
              class="field-input pr-10 w-full"
              autocomplete="off"
              spellcheck="false"
            />
            <button
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="showKeys[p.id] = !showKeys[p.id]"
            >
              <Eye v-if="!showKeys[p.id]" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider Selection -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Active Providers</span>
      </div>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Text generation</label>
          <p class="font-fell text-xs text-muted-foreground italic">Used for NPCs, monsters, items, spells, and puzzles.</p>
          <select
            v-if="availableTextProviders.length > 0"
            v-model="form.text_provider"
            class="field-input text-sm"
          >
            <option v-for="o in availableTextProviders" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <div v-else class="field-input text-sm opacity-50 cursor-not-allowed select-none text-muted-foreground">
            No provider selected
          </div>
          <p v-if="availableTextProviders.length === 0" class="font-fell text-xs text-yellow-600 dark:text-yellow-500 font-semibold">
            ⚠ Enter an API key above to enable text generation.
          </p>
          <p v-else class="font-fell text-xs text-muted-foreground">
            {{ activeTextCost.hint }}
            <span class="opacity-60">· prices approximate</span>
          </p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-cinzel text-xs text-muted-foreground tracking-wide">Image generation</label>
          <p class="font-fell text-xs text-muted-foreground italic">
            Used for portrait and artwork generation.
            <span v-if="form.image_provider === 'falai'" class="text-yellow-600 dark:text-yellow-500">
              fal.ai does not support alter-ego disguise portraits — that requires OpenAI.
            </span>
            <span v-if="form.image_provider === 'openai-mini'" class="text-muted-foreground">
              Draft mode: lower cost, same sizes and features as gpt-image-2, but lower output quality.
            </span>
          </p>
          <select
            v-if="availableImageProviders.length > 0"
            v-model="form.image_provider"
            class="field-input text-sm"
          >
            <option v-for="o in availableImageProviders" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <div v-else class="field-input text-sm opacity-50 cursor-not-allowed select-none text-muted-foreground">
            No provider selected
          </div>
          <p v-if="availableImageProviders.length === 0" class="font-fell text-xs text-yellow-600 dark:text-yellow-500 font-semibold">
            ⚠ Enter an API key above to enable image generation.
          </p>
          <p v-else class="font-fell text-xs text-muted-foreground">
            {{ activeImageCost.hint }}
            <span class="opacity-60">· prices approximate</span>
          </p>
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

    <!-- Promotional consent -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Chronicler Promotion</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            v-model="form.allow_chronicle_promotion"
            type="checkbox"
            class="h-4 w-4 mt-0.5 rounded border-border bg-background shrink-0"
          />
          <span class="text-sm">Allow Grimoire to use my campaign's Chronicler scene illustrations for promotional purposes</span>
        </label>
        <p class="font-fell text-xs text-muted-foreground italic">
          Opt-in only. If enabled, AI-generated scene images from your notes may be featured in Grimoire's gallery or marketing materials. Your campaign name, notes, and player data are never shared.
        </p>
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
import { ref, computed, reactive, watch } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { encryptApiKey, primeDecryptCache } from "@/lib/apiKeyVault";
import { getSetting } from "@/settings/index";

const LOCAL_MODE_KEY = "grimoire_key_local_mode";

interface ProviderDef {
  id:          string;
  label:       string;
  placeholder: string;
  link:        string;
  dbField:     string;
  localKey:    string;
}

const providerDefs: ProviderDef[] = [
  { id: "openai",    label: "OpenAI",          placeholder: "sk-…",     dbField: "openai_api_key",    localKey: "grimoire_openai_key",    link: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic",        placeholder: "sk-ant-…", dbField: "anthropic_api_key", localKey: "grimoire_anthropic_key", link: "https://console.anthropic.com/settings/keys" },
  { id: "gemini",    label: "Google Gemini",    placeholder: "AIza…",    dbField: "gemini_api_key",    localKey: "grimoire_gemini_key",    link: "https://aistudio.google.com/app/apikey" },
  { id: "falai",     label: "fal.ai",           placeholder: "…",        dbField: "falai_api_key",     localKey: "grimoire_falai_key",     link: "https://fal.ai/dashboard/keys" },
];

const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

function initialKeys(): Record<string, string> {
  const c = campaign.activeCampaign;
  return Object.fromEntries(
    providerDefs.map((p) => [p.id, (c?.[p.dbField as keyof typeof c] as string | null) ?? ""])
  );
}

const form = ref({
  text_provider:    campaign.activeCampaign?.text_provider  ?? "openai",
  image_provider:   campaign.activeCampaign?.image_provider ?? "openai",
  ai_setting_prompt: campaign.activeCampaign?.ai_setting_prompt ?? "",
  allow_chronicle_promotion: campaign.activeCampaign?.allow_chronicle_promotion ?? false,
  keys: initialKeys(),
});

const showKeys     = reactive<Record<string, boolean>>(Object.fromEntries(providerDefs.map((p) => [p.id, false])));
const isSaving     = ref(false);
const localModeEnabled = ref(localStorage.getItem(LOCAL_MODE_KEY) === "local");

const activeSetting       = computed(() => getSetting(campaign.activeCampaign?.calendar_id ?? ""));
const settingDefaultPrompt = computed(() => activeSetting.value?.defaultAiPrompt ?? "");
const settingLabel         = computed(() => activeSetting.value?.label ?? "Setting");

// Provider option definitions for the dropdowns
const TEXT_PROVIDER_OPTIONS = [
  { value: "openai",    label: "OpenAI — GPT-4o mini" },
  { value: "anthropic", label: "Claude — Sonnet 4.6" },
  { value: "gemini",    label: "Google Gemini — 3.1 Flash" },
] as const;

const IMAGE_PROVIDER_OPTIONS = [
  { value: "openai",       label: "OpenAI — gpt-image-2",             keyProvider: "openai" },
  { value: "openai-mini",  label: "OpenAI — gpt-image-1-mini (draft)", keyProvider: "openai" },
  { value: "falai",        label: "fal.ai — FLUX 2 Flex",             keyProvider: "falai"  },
] as const;

function providerHasKey(providerId: string): boolean {
  if (form.value.keys[providerId].trim()) return true;
  if (localModeEnabled.value) {
    const p = providerDefs.find((d) => d.id === providerId);
    return p ? !!localStorage.getItem(p.localKey) : false;
  }
  return false;
}

const availableTextProviders  = computed(() => TEXT_PROVIDER_OPTIONS.filter((o) => providerHasKey(o.value)));
const availableImageProviders = computed(() => IMAGE_PROVIDER_OPTIONS.filter((o) => providerHasKey(o.keyProvider)));

// Auto-correct selection if the chosen provider loses its key
watch(availableTextProviders, (options) => {
  if (options.length > 0 && !options.some((o) => o.value === form.value.text_provider)) {
    form.value.text_provider = options[0].value;
  }
});
watch(availableImageProviders, (options) => {
  if (options.length > 0 && !options.some((o) => o.value === form.value.image_provider)) {
    form.value.image_provider = options[0].value;
  }
});

// Cost hints — based on ~2 000 input + ~800 output tokens per text generation
const TEXT_COSTS: Record<string, string> = {
  openai:    "~$0.001 per generation  (GPT-4o mini: $0.15 / $0.60 per M tokens)",
  anthropic: "~$0.02 per generation   (Sonnet 4.6: $3 / $15 per M tokens)",
  gemini:    "~$0.0004 per generation (Gemini Flash: $0.075 / $0.30 per M tokens)",
};
// Cost hints — gpt-image-2 at high quality 1024×1024 is the main cost driver
const IMAGE_COSTS: Record<string, string> = {
  openai:        "~$0.05–0.20 per portrait · ~$0.10–0.40 with alter-ego (gpt-image-2, high quality)",
  "openai-mini": "~$0.005–0.036 per portrait · alter-ego supported (gpt-image-1-mini)",
  falai:         "~$0.025 per portrait (FLUX 2 Flex)",
};
const activeTextCost  = computed(() => ({ hint: TEXT_COSTS[form.value.text_provider]  ?? TEXT_COSTS.openai }));
const activeImageCost = computed(() => ({ hint: IMAGE_COSTS[form.value.image_provider] ?? IMAGE_COSTS.openai }));

watch(
  () => campaign.activeCampaign,
  (c) => {
    if (c) {
      form.value.text_provider    = c.text_provider  ?? "openai";
      form.value.image_provider   = c.image_provider ?? "openai";
      form.value.ai_setting_prompt = c.ai_setting_prompt ?? "";
      form.value.allow_chronicle_promotion = c.allow_chronicle_promotion ?? false;
      for (const p of providerDefs) {
        form.value.keys[p.id] = (c[p.dbField as keyof typeof c] as string | null) ?? "";
      }
    }
  },
);

async function save() {
  if (!campaign.activeCampaignId || !campaign.activeCampaign) return;
  isSaving.value = true;
  try {
    const encryptedKeys: Record<string, string | null> = {};

    if (localModeEnabled.value) {
      for (const p of providerDefs) {
        const trimmed = form.value.keys[p.id].trim();
        if (trimmed) localStorage.setItem(p.localKey, trimmed);
        else         localStorage.removeItem(p.localKey);
        encryptedKeys[p.dbField] = null;
      }
      localStorage.setItem(LOCAL_MODE_KEY, "local");
    } else {
      for (const p of providerDefs) {
        const trimmed = form.value.keys[p.id].trim();
        if (trimmed) {
          const enc = await encryptApiKey(trimmed);
          primeDecryptCache(enc, trimmed);
          encryptedKeys[p.dbField] = enc;
        } else {
          encryptedKeys[p.dbField] = null;
        }
        localStorage.removeItem(p.localKey);
      }
      localStorage.removeItem(LOCAL_MODE_KEY);
    }

    const updated = await updateCampaign({
      id: campaign.activeCampaignId,
      update: {
        openai_api_key:    encryptedKeys["openai_api_key"],
        anthropic_api_key: encryptedKeys["anthropic_api_key"],
        gemini_api_key:    encryptedKeys["gemini_api_key"],
        falai_api_key:     encryptedKeys["falai_api_key"],
        text_provider:     form.value.text_provider  || null,
        image_provider:    form.value.image_provider || null,
        ai_setting_prompt: form.value.ai_setting_prompt.trim() || null,
        allow_chronicle_promotion: form.value.allow_chronicle_promotion,
      },
    });
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}
</script>
