<template>
  <div class="space-y-6">
    <div class="rounded-lg border border-border bg-card p-4 space-y-1">
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">AI Providers</h2>
      <p class="text-caption text-muted-foreground italic">
        Platform key, model selection, credit multipliers, and API cost rates — all per provider.
        Keys are encrypted at rest. Multipliers are relative to the OpenAI 1× baseline.
        Save model costs to mark them verified; compare estimated totals to provider invoices monthly.
      </p>
    </div>

    <!-- Multi-vendor embedding warning: vectors from different embedding models are
         not comparable (different dimensions/semantics), so exactly one vendor may
         be enabled at a time. The Embedding Vendor control below makes this
         unreachable through normal use; this stays as a last-resort surface for a
         config edited outside this UI (e.g. directly in the DB) -- the backend
         resolver and the DB's unique index both still enforce it independently. -->
    <div
      v-if="embeddingEnabledLabels.length > 1"
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 space-y-1"
    >
      <p class="text-label-lg font-semibold text-destructive">Multiple embedding providers enabled</p>
      <p class="text-caption text-destructive/90">
        {{ embeddingEnabledLabels.join(', ') }} all have embedding search enabled. Only one may be active --
        cosine distance between vectors from different models is meaningless, and a mixed index returns
        near-random results with no error anywhere. Use the Embedding Vendor control below to set exactly one
        vendor, which re-embeds every monster automatically.
      </p>
    </div>

    <SimulacrumConfig />
    <GithubIntegrationConfig />
    <!--
      The vendor control keeps its own inline backfill, because re-embedding is
      part of the switch rather than a separate chore to remember. The
      standalone "Re-embed all content" card lives in the Content tab instead:
      running it is a maintenance action on monsters/NPCs/factions/locations,
      not a change to provider configuration. Both drive the same run —
      useEmbeddingBackfill is module-level singleton state — so progress shown
      here and there is one operation, not two that can disagree.
    -->
    <EmbeddingVendorControl :known-embedding-models="KNOWN_EMBEDDING_MODELS" />

    <div v-if="providersQuery.isPending.value" class="text-muted-foreground text-body">Loading…</div>
    <div v-else-if="providersQuery.isError.value" class="text-destructive text-body">Failed to load provider config.</div>
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
          <AppButton
            variant="primary"
            size="sm"
            :disabled="providerSaving[row.provider]"
            :label="providerSaving[row.provider] ? 'Saving…' : 'Save config'"
            @click="saveProvider(row.provider)"
          />
        </div>

        <!-- Save error -- e.g. the DB's "at most one embedding vendor" unique index
             (provider_config_single_embedding_vendor) rejecting a save that would
             leave two providers enabled. The banner above should already have
             warned before this is reachable, but a rejected save must never be
             silent. -->
        <p v-if="providerSaveError[row.provider]" class="text-caption text-destructive">
          {{ providerSaveError[row.provider] }}
        </p>

        <!-- Platform API Key -->
        <PlatformKeyField
          :provider="row.provider as KeyProvider"
          :hint="PROVIDERS.find(p => p.id === row.provider)?.hint ?? '…'"
        />

        <!-- Model config + pricing: only shown once a key is set -->
        <template v-if="isKeySet(row.provider as KeyProvider)">

        <!-- Model config: text / image / audio. Embedding is deliberately absent
             here -- it moved to the single-choice EmbeddingVendorControl above,
             which is what makes the "at most one embedding vendor" invariant
             unrepresentable in the UI instead of merely rejected on save. -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <!-- Text generation -->
          <ProviderCapabilityCell
            v-model:model="draftProviders[row.provider].text_model"
            v-model:enabled="draftProviders[row.provider].text_enabled"
            v-model:multiplier="draftProviders[row.provider].text_multiplier"
            label="Text"
            :provider="row.provider"
            capability="text"
            :known-models="providerModelOptions[row.provider]"
            placeholder="e.g. gpt-5.6-luna"
          />

          <!-- Image generation -->
          <ProviderCapabilityCell
            v-model:model="draftProviders[row.provider].image_model"
            v-model:enabled="draftProviders[row.provider].image_enabled"
            v-model:multiplier="draftProviders[row.provider].image_multiplier"
            label="Image"
            :provider="row.provider"
            capability="image"
            :known-models="providerModelOptions[row.provider]"
            placeholder="e.g. gpt-image-2"
          >
            <template #extra>
              <div v-if="IMAGE_QUALITY_OPTIONS[row.provider]" class="space-y-1">
                <label class="block text-label text-muted-foreground">Quality</label>
                <div class="flex gap-1">
                  <AppButton
                    v-for="opt in IMAGE_QUALITY_OPTIONS[row.provider]"
                    :key="opt.value"
                    variant="subtle"
                    size="xs"
                    class="flex-1"
                    :active="draftProviders[row.provider]?.image_quality === opt.value"
                    :label="opt.label"
                    @click="draftProviders[row.provider].image_quality = opt.value"
                  />
                </div>
                <p class="text-caption-sm text-muted-foreground/60 italic">Higher = more output tokens = higher real cost.</p>
              </div>
            </template>
          </ProviderCapabilityCell>

          <!-- Audio generation -->
          <ProviderCapabilityCell
            v-model:model="draftProviders[row.provider].audio_model"
            v-model:enabled="draftProviders[row.provider].audio_enabled"
            v-model:multiplier="draftProviders[row.provider].audio_multiplier"
            label="Audio"
            :provider="row.provider"
            capability="audio"
            :known-models="KNOWN_AUDIO_MODELS[row.provider] ?? []"
            curated
            placeholder="e.g. lyria-3-clip-preview"
          />
        </div>

        <!-- Model API Costs -->
        <div v-if="modelsByProvider[row.provider]?.length" class="border-t border-border pt-4 space-y-2">
          <span class="text-eyebrow font-semibold text-muted-foreground">Model API Costs</span>
          <div class="space-y-1.5">
            <div
              v-for="m in modelsByProvider[row.provider]"
              :key="m.model"
              class="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-2 rounded bg-muted/30"
            >
              <!-- Model name + type badge -->
              <span class="font-mono text-xs text-foreground truncate w-36 shrink-0">{{ m.model }}</span>
              <span
                class="text-label px-1.5 py-0.5 rounded shrink-0"
                :class="{
                  'text-sky-400 bg-sky-400/10':    m.model_type === 'text',
                  'text-violet-400 bg-violet-400/10': m.model_type === 'image',
                  'text-amber-400 bg-amber-400/10':  m.model_type === 'audio',
                  'text-slate-400 bg-slate-400/10':  m.model_type === 'embedding',
                }"
              >{{ m.model_type.toUpperCase() }}</span>

              <!-- Cost fields -->
              <template v-if="m.model_type === 'text'">
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">TXT-IN $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].input_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-16 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'input_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">OUT $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].output_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-16 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'output_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
              </template>
              <template v-else-if="m.model_type === 'image'">
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">TXT-IN $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].input_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-14 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'input_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">IMG-IN $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].image_input_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-14 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'image_input_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">IMG-OUT $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].image_output_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-14 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'image_output_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
              </template>
              <template v-else-if="m.model_type === 'audio'">
                <!-- audio: flat per-generation cost -->
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">PER GEN $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].cost_per_image_usd"
                    align="right" size="caption" :block="false"
                    class="w-20 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'cost_per_image_usd', e)"
                  />
                </div>
                <span class="font-cinzel text-2xs text-amber-400/60 shrink-0">est.</span>
              </template>
              <template v-else>
                <!-- embedding: input-token-only, no completion -- see the migration's
                     note on why output cost is left null rather than zero. -->
                <div class="flex items-center gap-1 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">IN $</span>
                  <AppInput
                    type="text" inputmode="decimal"
                    :model-value="draftModelPricing[m.model].input_cost_per_million_tokens"
                    align="right" size="caption" :block="false"
                    class="w-16 font-mono"
                    @change="(e: Event) => setDecimal(draftModelPricing[m.model], 'input_cost_per_million_tokens', e)"
                  />
                  <span class="font-cinzel text-2xs text-muted-foreground">/M</span>
                </div>
              </template>

              <!-- Usage (all-time) -->
              <span class="flex-1 text-right text-caption-sm text-muted-foreground/50 whitespace-nowrap min-w-24">
                <template v-if="modelStatsByModel[m.model]">
                  {{ modelStatsByModel[m.model].count }} gen · ~${{ modelStatsByModel[m.model].estimated_cost_usd.toFixed(2) }}
                </template>
                <template v-else>no usage yet</template>
              </span>

              <!-- Last verified -->
              <span class="font-cinzel text-2xs text-muted-foreground/40 shrink-0 text-right w-16">
                {{ draftModelPricing[m.model]?.last_verified_at ? new Date(draftModelPricing[m.model].last_verified_at!).toLocaleDateString() : 'never' }}
              </span>

              <!-- Save (marks verified) -->
              <AppButton
                variant="primary"
                size="xs"
                class="shrink-0"
                :disabled="modelPricingSaving[m.model]"
                :label="modelPricingSaving[m.model] ? '…' : 'Save'"
                @click="saveModelPricing(m.model, row.provider, m.model_type)"
              />
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useAdminKeys, PROVIDERS } from "@/composables/useAdminKeys";
import type { KeyProvider } from "@/composables/useAdminKeys";
import { useAdminProviders, PROVIDER_LABELS } from "@/composables/useAdminProviders";
import type { ProviderConfig } from "@/composables/useAdminProviders";
import { useAdminModelPricing } from "@/composables/useAdminModelPricing";
import { useProviderModels } from "@/composables/useProviderModels";
import { useAiUsageStats } from "@/composables/useAiUsageStats";
import type { ModelStat } from "@/composables/useAiUsageStats";
import SimulacrumConfig from "@/components/admin/SimulacrumConfig.vue";
import GithubIntegrationConfig from "@/components/admin/GithubIntegrationConfig.vue";
import EmbeddingVendorControl from "@/components/admin/EmbeddingVendorControl.vue";
import PlatformKeyField from "@/components/admin/PlatformKeyField.vue";
import ProviderCapabilityCell from "@/components/admin/ProviderCapabilityCell.vue";

// ── Keys ───────────────────────────────────────────────────────────────────
const { keysQuery } = useAdminKeys();

function isKeySet(provider: KeyProvider): boolean {
  return !!(keysQuery.data.value ?? []).find((r) => r.provider === provider);
}

// ── Provider config ────────────────────────────────────────────────────────
const { query: providersQuery, update: updateProvider } = useAdminProviders();

type ProviderDraft = Omit<ProviderConfig, "updated_at">;
const draftProviders = reactive<Record<string, ProviderDraft>>({});
const providerSaving = reactive<Record<string, boolean>>({});
const providerSaveError = reactive<Record<string, string>>({});

watch(
  () => providersQuery.data.value,
  (rows) => {
    if (!rows) return;
    for (const r of rows) {
      if (!(r.provider in draftProviders)) {
        draftProviders[r.provider] = {
          provider:          r.provider,
          text_model:        r.text_model,
          image_model:       r.image_model,
          image_quality:     r.image_quality,
          audio_model:       r.audio_model,
          embedding_model:   r.embedding_model,
          text_multiplier:   r.text_multiplier,
          image_multiplier:  r.image_multiplier,
          audio_multiplier:  r.audio_multiplier,
          text_enabled:      r.text_enabled,
          image_enabled:     r.image_enabled,
          audio_enabled:     r.audio_enabled,
          embedding_enabled: r.embedding_enabled,
        };
      }
    }
  },
  { immediate: true },
);

async function saveProvider(provider: string) {
  providerSaving[provider] = true;
  providerSaveError[provider] = "";
  try {
    await updateProvider.mutateAsync(draftProviders[provider]);
  } catch (err) {
    providerSaveError[provider] = err instanceof Error ? err.message : "Save failed.";
  } finally {
    providerSaving[provider] = false;
  }
}

// ── Provider model options (datalists) ────────────────────────────────────
// Gated on the key actually being set — querying before that always 422s
// ("no_key"), which is expected but noisy in the network/console.
const openaiKeySet    = computed(() => isKeySet("openai"));
const anthropicKeySet = computed(() => isKeySet("anthropic"));
const geminiKeySet    = computed(() => isKeySet("gemini"));
const openaiModelList    = useProviderModels("openai",    openaiKeySet);
const anthropicModelList = useProviderModels("anthropic", anthropicKeySet);
const geminiModelList    = useProviderModels("gemini",    geminiKeySet);

const providerModelOptions = computed<Record<string, string[]>>(() => ({
  openai:    openaiModelList.data.value    ?? [],
  anthropic: anthropicModelList.data.value ?? [],
  gemini:    geminiModelList.data.value    ?? [],
}));

// ── Image quality options per provider ───────────────────────────────────
// Vocabulary is provider-specific (see _shared/imageGen.ts): OpenAI sends these
// as `quality`; Gemini sends them as imageConfig.imageSize. Higher = more output
// tokens = higher real cost.
const IMAGE_QUALITY_OPTIONS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: "auto",   label: "Auto" },
    { value: "low",    label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high",   label: "High" },
  ],
  gemini: [
    { value: "1K", label: "1K" },
    { value: "2K", label: "2K" },
    { value: "4K", label: "4K" },
  ],
};

// ── Known audio models per provider ──────────────────────────────────────
const KNOWN_AUDIO_MODELS: Record<string, string[]> = {
  gemini: ["lyria-3-clip-preview", "lyria-3-pro-preview"],
  openai: ["tts-1", "tts-1-hd", "gpt-4o-audio-preview"],
};

// ── Known embedding models per provider (issue #595) ─────────────────────
// Only OpenAI and Gemini can embed at all -- Anthropic has no embeddings
// endpoint -- so anthropic is absent here.
// Shared with EmbeddingVendorControl.vue (passed down as a prop) rather than
// redefined there, so the two never drift: this file still needs it for the
// Model API Costs section below, independent of the vendor-switch control.
const KNOWN_EMBEDDING_MODELS: Record<string, string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-3-large"],
  gemini: ["gemini-embedding-001"],
};

// ── Multi-vendor embedding guard ──────────────────────────────────────────
// Vectors from different embedding models are never comparable (different
// dimensions/semantics), so exactly one vendor may have embedding_enabled at
// a time. EmbeddingVendorControl.vue's single-choice control (above) makes
// this normally UNREACHABLE from this UI -- but the DB's unique index and the
// backend resolver both still enforce it independently, so this banner stays
// as a last-resort surface (e.g. a row edited directly in the DB) rather than
// being removed as "dead code". A warning that never fires costs nothing;
// one that was needed and absent is the #595 failure mode this whole feature
// exists to prevent.
const embeddingEnabledLabels = computed(() =>
  Object.values(draftProviders)
    .filter((d) => d.embedding_enabled)
    .map((d) => PROVIDER_LABELS[d.provider] ?? d.provider),
);

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
      // Same treatment for embedding: migration 20260803000001 seeds ai_model_pricing
      // rows for every known embedding model (including gemini's, which is recorded
      // but disabled) precisely so this panel can surface them for verification --
      // "recorded so a vendor flip has pricing ready" per that migration's comment.
      const knownEmbedding = KNOWN_EMBEDDING_MODELS[p.provider];
      if (knownEmbedding?.length && p.embedding_model) {
        knownEmbedding.forEach(initModel);
      } else {
        initModel(p.embedding_model);
      }
    }
  },
  { immediate: true },
);

// Embedding models ARE included here, unlike the multiplier (see ProviderCapabilityCell's
// showMultiplier prop, which embedding omits). The two are independent: #595 says
// embedding is never separately CHARGED to users, which is a credits/multiplier
// question -- it says nothing about hiding the real vendor spend from cost analytics.
// Migration 20260803000001 seeds real $ rates for all three known embedding models and
// widened useAdminModelPricing's ModelPricing.model_type to "embedding" specifically so
// this panel could surface them ("the admin pricing tab surfaces unverified rows so
// someone can check them" -- that tab is this one).
interface ModelConfigItem { model: string; model_type: "text" | "image" | "audio" | "embedding" }

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
    const knownEmbedding = KNOWN_EMBEDDING_MODELS[provider];
    if (knownEmbedding?.length && draft.embedding_model) {
      knownEmbedding.forEach((m) => items.push({ model: m, model_type: "embedding" }));
    } else if (draft.embedding_model) {
      items.push({ model: draft.embedding_model, model_type: "embedding" });
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

async function saveModelPricing(model: string, provider: string, model_type: "text" | "image" | "audio" | "embedding") {
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
