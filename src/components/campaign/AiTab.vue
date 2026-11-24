<template>
  <!-- A young DM's campaign (#919): no controls to show at all, rather than a
       toggle that would flip a DB field the store's own `isAiEnabled` then
       overrides anyway — that reads as broken, not as a boundary. -->
  <div v-if="isChild" class="max-w-md rounded-lg border border-border bg-card p-4">
    <p class="text-body text-muted-foreground">AI features aren't available on young players' accounts.</p>
  </div>

  <form v-else class="max-w-md flex flex-col gap-6" @submit.prevent="save">

    <!-- AI enabled toggle — free users can turn this on/off; everything else
         in this tab (the image choice) is Pro. -->
    <div class="rounded-lg border border-border bg-card p-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-caption font-semibold text-foreground">AI Assistant</p>
          <p class="text-caption text-muted-foreground italic mt-0.5">
            When disabled, every AI generation control across the campaign is replaced with an "AI is off" notice. Players who prefer a fully hand-crafted experience won't see any AI UI to generate with.
          </p>
        </div>
        <ToggleSwitch
          :model-value="form.ai_enabled"
          size="lg"
          aria-label="AI Assistant"
          class="shrink-0"
          @update:model-value="toggleAi"
        />
      </div>
    </div>

    <!-- EU AI Act Art 50(1) consent gate — shown before AI is switched on for
         this account for the first time. Cancel leaves the toggle off. -->
    <AiNoticeDialog v-model="showAiNoticeDialog" kind="ai_use" @confirm="form.ai_enabled = true" />

    <ProFeatureGate
      v-if="!isPro"
      class="max-w-md"
      message="Choosing how images are made is a Pro feature. Free campaigns still generate with AI once the toggle above is on, paid in credits."
    />

    <template v-else-if="form.ai_enabled">

    <!-- Generation. Which model writes or draws is the platform's decision and
         is never shown: text runs on whatever the admin enabled, and the DM is
         asked only whether images should be quick or detailed. -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Generation</span>
      </div>
      <div class="p-4 flex flex-col gap-4">

        <div class="flex flex-col gap-1">
          <label class="text-label-lg text-muted-foreground">Images</label>
          <SegmentedControl
            v-if="imageOptions.length > 1"
            v-model="form.image_provider"
            :options="imageOptions"
            size="sm"
            block
          />
          <template v-if="configLoaded">
            <p v-if="imageOptions.length === 0" class="text-caption text-muted-foreground italic">
              Image generation isn't available right now.
            </p>
            <p v-else class="text-caption text-muted-foreground">≈ {{ selectedImageCredits }} credits / image</p>
          </template>
        </div>

      </div>
    </div>

    <!-- The campaign's world block (#1226) replaced the setting prompt. -->
    <p class="text-caption text-muted-foreground italic">
      What the AI writes and paints follows your campaign's Premise and tone, in
      <RouterLink to="/canon" class="underline">Canon</RouterLink>.
    </p>

    <AiUsageStatsPanel
      title="Your AI Usage"
      currency="credits"
      subtitle="Credits spent on generations."
    />

    <!-- Promotional consent -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Chronicler Promotion</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <AppCheckbox
          v-model="form.allow_chronicle_promotion"
          align="start"
          label="Allow Grimoire to use my campaign's Chronicler scene illustrations for promotional purposes"
        />
        <p class="text-caption text-muted-foreground italic">
          Opt-in only. If enabled, AI-generated scene images from your notes may be featured in Grimoire's gallery or marketing materials. Your campaign name, notes, and player data are never shared.
        </p>
      </div>
    </div>

    </template><!-- end v-if="form.ai_enabled" -->

    <div class="flex justify-end">
      <AppButton
        type="submit"
        variant="primary"
        size="sm"
        class="px-4"
        :disabled="isSaving"
        :label="isSaving ? 'Saving…' : 'Save'"
      />
    </div>

  </form>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { IMAGE_SPEED_LABEL } from "@/composables/ai/useCampaignProviders";
import { imageOffered } from "@edge-shared/providerChoice.ts";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import { useAiAcknowledgements } from "@/composables/ai/useAiAcknowledgements";
import { AI_USE_NOTICE_VERSION } from "@/lib/legal";
import AiUsageStatsPanel from "@/components/common/ai/AiUsageStatsPanel.vue";
import AiNoticeDialog from "@/components/campaign/AiNoticeDialog.vue";
import ProFeatureGate from "@/components/billing/ProFeatureGate.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";

const { isPro } = useSubscription();
const { isChild } = useChildAccount();
const { hasAcknowledged } = useAiAcknowledgements();

const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const form = ref({
  // The toggle is binary; a campaign that hasn't chosen yet (null) starts it
  // off, same as an explicit false — see context/compliance/ai-act.md §4.
  ai_enabled:        campaign.activeCampaign?.ai_enabled === true,
  image_provider:   campaign.activeCampaign?.image_provider ?? "openai",
  allow_chronicle_promotion: campaign.activeCampaign?.allow_chronicle_promotion ?? false,
});

const showAiNoticeDialog = ref(false);

/**
 * Turning AI on is the opt-in moment (EU AI Act Art 50(1)) — see
 * context/compliance/provenance-architecture.md §3. Once per account: if
 * this account already acknowledged the current notice version, the toggle
 * flips immediately, same as turning it off.
 */
function toggleAi() {
  if (form.value.ai_enabled) {
    form.value.ai_enabled = false;
    return;
  }
  if (hasAcknowledged("ai_use", AI_USE_NOTICE_VERSION)) {
    form.value.ai_enabled = true;
    return;
  }
  showAiNoticeDialog.value = true;
}

const isSaving     = ref(false);

const { query: providerConfigQuery, rowFor, imageMultiplierFor } = useProviderConfig();
// Until provider_config arrives nothing is known about what the admin offers:
// no "unavailable" notice, no price, and no correcting the DM's pick against
// options that are not yet known.
// Off the data, not `isSuccess`: a failed background refetch keeps the rows.
const configLoaded = computed(() => providerConfigQuery.data.value !== undefined);
const { costOf } = useAiCredits();

// Representative price: one portrait-orientation image (entity_image × 1.5 × provider multiplier).
const selectedImageCredits = computed(
  () => wholeCredits(costOf("entity_image") * 1.5 * imageMultiplierFor(form.value.image_provider)),
);

// Quick first, then Detailed.
const IMAGE_CHOICE_ORDER = ["gemini", "openai"] as const;

// A choice is open when the admin offers it on platform credits:
// chooseImageProvider (_shared/providerChoice.ts) honours exactly that, by the
// same `imageOffered` rule.
const imageOptions = computed(() =>
  IMAGE_CHOICE_ORDER
    .filter((p) => imageOffered(rowFor(p)))
    .map((p) => ({ value: p, label: IMAGE_SPEED_LABEL[p] })),
);

// Keep the image pick on an option that exists, so the form shows and saves
// what chooseImageProvider will actually run.
watch(
  [imageOptions, () => form.value.image_provider, configLoaded],
  ([options, chosen, loaded]) => {
    if (loaded && options.length > 0 && !options.some((o) => o.value === chosen)) {
      form.value.image_provider = options[0].value;
    }
  },
  { immediate: true },
);

watch(
  () => campaign.activeCampaign,
  (c) => {
    if (c) {
      form.value.ai_enabled       = c.ai_enabled === true;
      form.value.image_provider   = c.image_provider ?? "openai";
      form.value.allow_chronicle_promotion = c.allow_chronicle_promotion ?? false;
    }
  },
);

async function save() {
  if (!campaign.activeCampaignId || !campaign.activeCampaign) return;
  isSaving.value = true;
  try {
    const updated = await updateCampaign({
      id: campaign.activeCampaignId,
      update: {
        ai_enabled:        form.value.ai_enabled,
        image_provider:    form.value.image_provider || null,
        allow_chronicle_promotion: form.value.allow_chronicle_promotion,
      },
    });
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}
</script>
