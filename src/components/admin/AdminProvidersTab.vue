<template>
  <div class="space-y-6">
    <div class="rounded-lg border border-border bg-card p-4 space-y-1">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">AI Providers</h2>
      <p class="font-fell text-xs text-muted-foreground italic">
        Platform key, model selection, credit multipliers, and API cost rates — all per provider.
        Keys are encrypted at rest. Multipliers are relative to the OpenAI 1× baseline.
        Save model costs to mark them verified; compare estimated totals to provider invoices monthly.
      </p>
    </div>

    <div v-if="providersQuery.isPending.value" class="text-muted-foreground font-fell text-sm">Loading…</div>
    <div v-else-if="providersQuery.isError.value" class="text-destructive font-fell text-sm">Failed to load provider config.</div>
    <div v-else class="space-y-4">
      <div
        v-for="row in providersQuery.data.value"
        :key="row.provider"
        class="rounded-lg border border-border bg-card p-4 space-y-4"
      >
        <!-- Header -->
        <div class="flex items-center justify-between">
          <h3 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
            {{ PROVIDER_LABELS[row.provider] ?? row.provider }}
          </h3>
          <button
            class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            :disabled="providerSaving[row.provider]"
            @click="saveProvider(row.provider)"
          >
            {{ providerSaving[row.provider] ? 'Saving…' : 'Save config' }}
          </button>
        </div>

        <!-- Platform API Key -->
        <div class="p-3 rounded-md bg-muted/40 border border-border space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Platform API Key</span>
            <div class="flex items-center gap-2">
              <span v-if="isKeySet(row.provider as KeyProvider)" class="font-cinzel text-[10px] tracking-widest text-emerald-500 uppercase">
                Set · {{ new Date(keyUpdatedAt(row.provider as KeyProvider)!).toLocaleDateString() }}
              </span>
              <span v-else class="font-cinzel text-[10px] tracking-widest text-muted-foreground/60 uppercase">Not configured</span>
              <button
                v-if="isKeySet(row.provider as KeyProvider)"
                class="px-2 py-0.5 font-cinzel text-[9px] font-semibold tracking-wider text-destructive border border-destructive/40 rounded hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                :disabled="keyClearing[row.provider as KeyProvider]"
                @click="doClrKey(row.provider as KeyProvider)"
              >
                {{ keyClearing[row.provider as KeyProvider] ? '…' : 'Clear' }}
              </button>
            </div>
          </div>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <input
                v-model="keyDrafts[row.provider as KeyProvider]"
                :type="keyVisible[row.provider as KeyProvider] ? 'text' : 'password'"
                :placeholder="isKeySet(row.provider as KeyProvider) ? '•••••••• (leave blank to keep current)' : (PROVIDERS.find(p => p.id === row.provider)?.hint ?? '…')"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring pr-9"
                autocomplete="off"
              />
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                @click="keyVisible[row.provider as KeyProvider] = !keyVisible[row.provider as KeyProvider]"
              >
                <component :is="keyVisible[row.provider as KeyProvider] ? IconHide : IconReveal" class="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              class="shrink-0 px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              :disabled="keySaving[row.provider as KeyProvider] || !keyDrafts[row.provider as KeyProvider]?.trim()"
              @click="saveKey(row.provider as KeyProvider)"
            >
              {{ keySaving[row.provider as KeyProvider] ? 'Saving…' : 'Set Key' }}
            </button>
          </div>
        </div>

        <!-- Model config + pricing: only shown once a key is set -->
        <template v-if="isKeySet(row.provider as KeyProvider)">

        <!-- Model config: text / image / audio -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Text generation -->
          <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
            <div class="flex items-center justify-between">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Text</span>
              <template v-if="draftProviders[row.provider]?.text_model !== null">
                <button
                  type="button"
                  class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                  :class="draftProviders[row.provider]?.text_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                  @click="draftProviders[row.provider].text_enabled = !draftProviders[row.provider].text_enabled"
                >
                  <span
                    class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                    :class="draftProviders[row.provider]?.text_enabled ? 'translate-x-3' : 'translate-x-0'"
                  />
                </button>
              </template>
              <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
            </div>
            <template v-if="draftProviders[row.provider]?.text_model !== null">
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Model</label>
                <input
                  v-model="draftProviders[row.provider].text_model"
                  :list="`text-models-${row.provider}`"
                  type="text"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. gpt-4o-mini"
                />
                <datalist :id="`text-models-${row.provider}`">
                  <option v-for="m in providerModelOptions[row.provider]" :key="m" :value="m" />
                </datalist>
              </div>
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                <input
                  v-model.number="draftProviders[row.provider].text_multiplier"
                  type="number" step="0.1" min="0.1"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="1.0"
                />
              </div>
            </template>
          </div>

          <!-- Image generation -->
          <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
            <div class="flex items-center justify-between">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Image</span>
              <template v-if="draftProviders[row.provider]?.image_model !== null">
                <button
                  type="button"
                  class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                  :class="draftProviders[row.provider]?.image_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                  @click="draftProviders[row.provider].image_enabled = !draftProviders[row.provider].image_enabled"
                >
                  <span
                    class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                    :class="draftProviders[row.provider]?.image_enabled ? 'translate-x-3' : 'translate-x-0'"
                  />
                </button>
              </template>
              <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
            </div>
            <template v-if="draftProviders[row.provider]?.image_model !== null">
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Model</label>
                <input
                  v-model="draftProviders[row.provider].image_model"
                  :list="`image-models-${row.provider}`"
                  type="text"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. gpt-image-1.5"
                />
                <datalist :id="`image-models-${row.provider}`">
                  <option v-for="m in providerModelOptions[row.provider]" :key="m" :value="m" />
                </datalist>
              </div>
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                <input
                  v-model.number="draftProviders[row.provider].image_multiplier"
                  type="number" step="0.1" min="0.1"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="1.0"
                />
              </div>
            </template>
          </div>

          <!-- Audio generation -->
          <div class="space-y-2 p-3 rounded-md bg-muted/40 border border-border">
            <div class="flex items-center justify-between">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Audio</span>
              <template v-if="draftProviders[row.provider]?.audio_model !== null && draftProviders[row.provider]?.audio_model !== undefined">
                <button
                  type="button"
                  class="relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors"
                  :class="draftProviders[row.provider]?.audio_enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                  @click="draftProviders[row.provider].audio_enabled = !draftProviders[row.provider].audio_enabled"
                >
                  <span
                    class="pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                    :class="draftProviders[row.provider]?.audio_enabled ? 'translate-x-3' : 'translate-x-0'"
                  />
                </button>
              </template>
              <span v-else class="font-cinzel text-[10px] tracking-wider text-muted-foreground/50 uppercase">N/A</span>
            </div>
            <template v-if="draftProviders[row.provider]?.audio_model !== null && draftProviders[row.provider]?.audio_model !== undefined">
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Models</label>
                <!-- Multiple known models: show as static list; user selects in the app UI -->
                <template v-if="(KNOWN_AUDIO_MODELS[row.provider] ?? []).length > 1">
                  <div class="space-y-0.5">
                    <div
                      v-for="m in KNOWN_AUDIO_MODELS[row.provider]"
                      :key="m"
                      class="font-mono text-[10px] text-muted-foreground px-2 py-1 rounded bg-muted/30"
                    >{{ m }}</div>
                  </div>
                </template>
                <!-- Single configurable model -->
                <template v-else>
                  <input
                    v-model="draftProviders[row.provider].audio_model"
                    :list="`audio-models-${row.provider}`"
                    type="text"
                    class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="e.g. lyria-3-clip-preview"
                  />
                  <datalist :id="`audio-models-${row.provider}`">
                    <option v-for="m in KNOWN_AUDIO_MODELS[row.provider] ?? []" :key="m" :value="m" />
                  </datalist>
                </template>
              </div>
              <div class="space-y-1">
                <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground">Multiplier</label>
                <input
                  v-model.number="draftProviders[row.provider].audio_multiplier"
                  type="number" step="0.1" min="0.1"
                  class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="1.0"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- Model API Costs -->
        <div v-if="modelsByProvider[row.provider]?.length" class="border-t border-border pt-4 space-y-2">
          <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Model API Costs</span>
          <div class="space-y-1.5">
            <div
              v-for="m in modelsByProvider[row.provider]"
              :key="m.model"
              class="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2 rounded bg-muted/30"
            >
              <!-- Model name + type badge -->
              <span class="font-mono text-xs text-foreground truncate w-36 shrink-0">{{ m.model }}</span>
              <span
                class="font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded shrink-0"
                :class="{
                  'text-sky-400 bg-sky-400/10':    m.model_type === 'text',
                  'text-violet-400 bg-violet-400/10': m.model_type === 'image',
                  'text-amber-400 bg-amber-400/10':  m.model_type === 'audio',
                }"
              >{{ m.model_type.toUpperCase() }}</span>

              <!-- Cost fields -->
              <template v-if="m.model_type === 'text'">
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">TXT-IN $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].input_cost_per_million_tokens ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'input_cost_per_million_tokens', e)"
                    class="w-16 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">OUT $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].output_cost_per_million_tokens ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'output_cost_per_million_tokens', e)"
                    class="w-16 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                </div>
              </template>
              <template v-else-if="m.model_type === 'image'">
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">TXT-IN $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].input_cost_per_million_tokens ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'input_cost_per_million_tokens', e)"
                    class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">IMG-IN $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].image_input_cost_per_million_tokens ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'image_input_cost_per_million_tokens', e)"
                    class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">IMG-OUT $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].image_output_cost_per_million_tokens ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'image_output_cost_per_million_tokens', e)"
                    class="w-14 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-cinzel text-[9px] text-muted-foreground">/M</span>
                </div>
              </template>
              <template v-else>
                <!-- audio: flat per-generation cost -->
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-[9px] text-muted-foreground">PER GEN $</span>
                  <input
                    type="text" inputmode="decimal"
                    :value="draftModelPricing[m.model].cost_per_image_usd ?? ''"
                    @blur="(e) => setDecimal(draftModelPricing[m.model], 'cost_per_image_usd', e)"
                    class="w-20 bg-background border border-border rounded px-1.5 py-0.5 font-mono text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <span class="font-cinzel text-[9px] text-amber-400/60 shrink-0">est.</span>
              </template>

              <!-- Usage (all-time) -->
              <span class="flex-1 text-right font-fell text-[10px] text-muted-foreground/50 whitespace-nowrap min-w-24">
                <template v-if="modelStatsByModel[m.model]">
                  {{ modelStatsByModel[m.model].count }} gen · ~${{ modelStatsByModel[m.model].estimated_cost_usd.toFixed(2) }}
                </template>
                <template v-else>no usage yet</template>
              </span>

              <!-- Last verified -->
              <span class="font-cinzel text-[9px] text-muted-foreground/40 shrink-0 text-right w-16">
                {{ draftModelPricing[m.model]?.last_verified_at ? new Date(draftModelPricing[m.model].last_verified_at!).toLocaleDateString() : 'never' }}
              </span>

              <!-- Save (marks verified) -->
              <button
                class="px-2 py-0.5 font-cinzel text-[9px] font-semibold tracking-wider bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                :disabled="modelPricingSaving[m.model]"
                @click="saveModelPricing(m.model, row.provider, m.model_type)"
              >
                {{ modelPricingSaving[m.model] ? '…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>

        </template><!-- /isKeySet -->

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { IconHide, IconReveal } from "@/lib/icons";
import { useAdminKeys, PROVIDERS } from "@/composables/useAdminKeys";
import type { KeyProvider } from "@/composables/useAdminKeys";
import { useAdminProviders, PROVIDER_LABELS } from "@/composables/useAdminProviders";
import type { ProviderConfig } from "@/composables/useAdminProviders";
import { useAdminModelPricing } from "@/composables/useAdminModelPricing";
import { useProviderModels } from "@/composables/useProviderModels";
import { useAiUsageStats } from "@/composables/useAiUsageStats";
import type { ModelStat } from "@/composables/useAiUsageStats";

// ── Keys ───────────────────────────────────────────────────────────────────
const { keysQuery, setKey, clearKey } = useAdminKeys();
const keyDrafts = reactive<Record<KeyProvider, string>>({} as Record<KeyProvider, string>);
const keyVisible = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);
const keySaving = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);
const keyClearing = reactive<Record<KeyProvider, boolean>>({} as Record<KeyProvider, boolean>);

function isKeySet(provider: KeyProvider): boolean {
  return !!(keysQuery.data.value ?? []).find((r) => r.provider === provider);
}
function keyUpdatedAt(provider: KeyProvider): string | null {
  const row = (keysQuery.data.value ?? []).find((r) => r.provider === provider);
  return row?.updated_at ?? null;
}

async function saveKey(provider: KeyProvider) {
  const val = keyDrafts[provider]?.trim();
  if (!val) return;
  keySaving[provider] = true;
  try {
    await setKey.mutateAsync({ provider, plaintext: val });
    keyDrafts[provider] = "";
  } finally {
    keySaving[provider] = false;
  }
}

async function doClrKey(provider: KeyProvider) {
  keyClearing[provider] = true;
  try {
    await clearKey.mutateAsync(provider);
  } finally {
    keyClearing[provider] = false;
  }
}

// ── Provider config ────────────────────────────────────────────────────────
const { query: providersQuery, update: updateProvider } = useAdminProviders();

type ProviderDraft = Omit<ProviderConfig, "updated_at">;
const draftProviders = reactive<Record<string, ProviderDraft>>({});
const providerSaving = reactive<Record<string, boolean>>({});

watch(
  () => providersQuery.data.value,
  (rows) => {
    if (!rows) return;
    for (const r of rows) {
      if (!(r.provider in draftProviders)) {
        draftProviders[r.provider] = {
          provider:         r.provider,
          text_model:       r.text_model,
          image_model:      r.image_model,
          audio_model:      r.audio_model,
          text_multiplier:  r.text_multiplier,
          image_multiplier: r.image_multiplier,
          audio_multiplier: r.audio_multiplier,
          text_enabled:     r.text_enabled,
          image_enabled:    r.image_enabled,
          audio_enabled:    r.audio_enabled,
        };
      }
    }
  },
  { immediate: true },
);

async function saveProvider(provider: string) {
  providerSaving[provider] = true;
  try {
    await updateProvider.mutateAsync(draftProviders[provider]);
  } finally {
    providerSaving[provider] = false;
  }
}

// ── Provider model options (datalists) ────────────────────────────────────
const isActive = computed(() => true);
const openaiModelList    = useProviderModels("openai",    isActive);
const anthropicModelList = useProviderModels("anthropic", isActive);
const geminiModelList    = useProviderModels("gemini",    isActive);

const providerModelOptions = computed<Record<string, string[]>>(() => ({
  openai:    openaiModelList.data.value    ?? [],
  anthropic: anthropicModelList.data.value ?? [],
  gemini:    geminiModelList.data.value    ?? [],
  falai:     [],
}));

// ── Known audio models per provider ──────────────────────────────────────
const KNOWN_AUDIO_MODELS: Record<string, string[]> = {
  gemini: ["lyria-3-clip-preview", "lyria-3-pro-preview"],
  openai: ["tts-1", "tts-1-hd", "gpt-4o-audio-preview"],
};

// ── Model pricing ──────────────────────────────────────────────────────────
const modelPricingQuery = useAdminModelPricing();

type ModelPricingDraft = {
  input_cost_per_million_tokens: number | null;
  output_cost_per_million_tokens: number | null;
  image_input_cost_per_million_tokens: number | null;
  image_output_cost_per_million_tokens: number | null;
  cost_per_image_usd: number | null;
  last_verified_at: string | null;
};
const draftModelPricing = reactive<Record<string, ModelPricingDraft>>({});
const modelPricingSaving = reactive<Record<string, boolean>>({});

watch(
  [() => providersQuery.data.value, () => modelPricingQuery.query.data.value],
  ([providers, pricingRows]) => {
    // Wait until both data sources are loaded before initialising drafts.
    // Without this guard, the watch fires immediately (providers loaded, pricing
    // still undefined), seeds every model with all-null values, and then when
    // pricing data arrives the "already in map" guard prevents re-initialisation.
    if (!providers || pricingRows === undefined) return;

    const pricingByModel = new Map((pricingRows ?? []).map((r) => [r.model, r]));

    function initModel(model: string | null | undefined) {
      if (!model || model in draftModelPricing) return;
      const pricing = pricingByModel.get(model);
      draftModelPricing[model] = {
        input_cost_per_million_tokens:        pricing?.input_cost_per_million_tokens        ?? null,
        output_cost_per_million_tokens:       pricing?.output_cost_per_million_tokens       ?? null,
        image_input_cost_per_million_tokens:  pricing?.image_input_cost_per_million_tokens  ?? null,
        image_output_cost_per_million_tokens: pricing?.image_output_cost_per_million_tokens ?? null,
        cost_per_image_usd:                   pricing?.cost_per_image_usd                   ?? null,
        last_verified_at:                     pricing?.last_verified_at                     ?? null,
      };
    }

    for (const p of providers ?? []) {
      initModel(p.text_model);
      initModel(p.image_model);
      // For audio: initialize all known models for the provider, not just the DB-configured one.
      const knownAudio = KNOWN_AUDIO_MODELS[p.provider];
      if (knownAudio?.length && p.audio_model) {
        knownAudio.forEach(initModel);
      } else {
        initModel(p.audio_model);
      }
    }
  },
  { immediate: true },
);

interface ModelConfigItem { model: string; model_type: "text" | "image" | "audio" }

const modelsByProvider = computed(() => {
  const map: Record<string, ModelConfigItem[]> = {};
  for (const [provider, draft] of Object.entries(draftProviders)) {
    if (!draft) continue;
    const items: ModelConfigItem[] = [];
    if (draft.text_model)  items.push({ model: draft.text_model,  model_type: "text" });
    if (draft.image_model) items.push({ model: draft.image_model, model_type: "image" });
    const knownAudio = KNOWN_AUDIO_MODELS[provider];
    if (knownAudio?.length && draft.audio_model) {
      knownAudio.forEach((m) => items.push({ model: m, model_type: "audio" }));
    } else if (draft.audio_model) {
      items.push({ model: draft.audio_model, model_type: "audio" });
    }
    // Only show pricing rows for models that have been persisted (initialized in draftModelPricing).
    // This prevents a crash when the user is mid-type in a model name input.
    const initialized = items.filter(item => item.model in draftModelPricing);
    if (initialized.length) map[provider] = initialized;
  }
  return map;
});

function setDecimal(obj: Record<string, unknown>, key: string, e: Event): void {
  const raw = (e.target as HTMLInputElement).value.replace(',', '.');
  const v = parseFloat(raw);
  obj[key] = isNaN(v) ? null : v;
}

async function saveModelPricing(model: string, provider: string, model_type: "text" | "image" | "audio") {
  modelPricingSaving[model] = true;
  try {
    await modelPricingQuery.upsert.mutateAsync({
      model,
      provider,
      model_type,
      ...draftModelPricing[model],
      last_verified_at: new Date().toISOString(),
    });
    draftModelPricing[model].last_verified_at = new Date().toISOString();
  } finally {
    modelPricingSaving[model] = false;
  }
}

// ── Usage stats (for model cost rows) ─────────────────────────────────────
const usageStats = useAiUsageStats();

const modelStatsByModel = computed(() => {
  const map: Record<string, ModelStat> = {};
  for (const s of usageStats.modelStats.value) {
    map[s.model] = s;
  }
  return map;
});
</script>
