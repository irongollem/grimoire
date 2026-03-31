<template>
  <form class="max-w-md flex flex-col gap-6" @submit.prevent="save">

    <!-- API Key -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">OpenAI API Key</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Your key is stored in your campaign and protected by your account.
          It is never shared with other players.
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
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Campaign Setting Prompt</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <p class="font-fell text-xs text-muted-foreground italic">
          Describe your world's tone, aesthetic, and feel. This is included in every AI generation request to keep all content consistent with your campaign.
        </p>
        <textarea
          v-model="form.ai_setting_prompt"
          rows="6"
          placeholder="e.g. Dark gothic fantasy set in a crumbling empire. Think corrupted nobility, ancient undead, and flickering candlelight. Visuals should feel like 19th century European oil paintings with a brooding, melancholic atmosphere…"
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
import { ref, watch } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";

const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const form = ref({
  openai_api_key: campaign.activeCampaign?.openai_api_key ?? "",
  ai_setting_prompt: campaign.activeCampaign?.ai_setting_prompt ?? "",
});

const showKey = ref(false);
const isSaving = ref(false);

// Sync if the active campaign switches
watch(
  () => campaign.activeCampaign,
  (c) => {
    if (c) {
      form.value.openai_api_key = c.openai_api_key ?? "";
      form.value.ai_setting_prompt = c.ai_setting_prompt ?? "";
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
        openai_api_key: form.value.openai_api_key.trim() || null,
        ai_setting_prompt: form.value.ai_setting_prompt.trim() || null,
      },
    });
    // Re-sync the store with a fresh writable object so computed props
    // that read openai_api_key (e.g. the NPC Generate button) update immediately.
    campaign.switchToCampaign(updated);
  } finally {
    isSaving.value = false;
  }
}
</script>
