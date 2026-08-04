<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="cancel"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md shadow-xl">
        <div class="flex items-start gap-3 px-5 pt-5 pb-3">
          <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary">
            <IconInfo class="h-4.5 w-4.5" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
              {{ copy.title }}
            </h2>
          </div>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            @click="cancel"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <div class="px-5 pb-4 flex flex-col gap-3">
          <p class="text-body text-foreground">{{ copy.intro }}</p>
          <ul class="flex flex-col gap-2">
            <li
              v-for="bullet in copy.bullets"
              :key="bullet"
              class="flex items-start gap-2 text-body text-muted-foreground"
            >
              <span class="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
              <span>{{ bullet }}</span>
            </li>
          </ul>
          <RouterLink
            v-if="kind === 'ai_use'"
            :to="{ name: 'campaign-settings', query: { tab: 'ai' } }"
            class="inline-flex items-center gap-1 text-caption text-primary hover:underline self-start"
            @click="cancel"
          >
            Review this campaign's AI settings
            <IconExternalLink class="h-3 w-3" />
          </RouterLink>
        </div>

        <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
          <button
            type="button"
            class="px-4 py-1.5 rounded-md border border-border text-label-lg font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="isSaving"
            class="px-4 py-1.5 rounded-md text-label-lg font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="confirm"
          >
            {{ isSaving ? "Saving…" : "I understand" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconInfo, IconClose, IconExternalLink } from "@/lib/icons";
import { useAiAcknowledgements, type AiAcknowledgementKind } from "@/composables/useAiAcknowledgements";
import { AI_USE_NOTICE_VERSION, AI_LIKENESS_NOTICE_VERSION } from "@/lib/legal";

/**
 * Reusable EU AI Act Art 50(1) consent dialog for both acknowledgement kinds.
 * See context/compliance/provenance-architecture.md §3. Recording happens
 * here (not in callers) so every gate that opens this dialog gets identical
 * "confirm records, cancel doesn't" behaviour for free.
 */
const { kind } = defineProps<{ kind: AiAcknowledgementKind }>();

const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { acknowledge } = useAiAcknowledgements();
const isSaving = ref(false);

const version = computed(() =>
  kind === "ai_use" ? AI_USE_NOTICE_VERSION : AI_LIKENESS_NOTICE_VERSION,
);

const COPY: Record<AiAcknowledgementKind, { title: string; intro: string; bullets: string[] }> = {
  ai_use: {
    title: "Before you turn on AI",
    intro: "This campaign is about to start using AI-generated content. A few things worth knowing:",
    bullets: [
      "Drafts can be inaccurate, generic, or resemble existing published works — always review before using them.",
      "Your prompts and relevant campaign context are sent to a third-party AI provider (OpenAI, Anthropic, Google, or fal.ai — whichever this campaign is set to use).",
      "Generated content carries an invisible AI marker, as required by EU law.",
    ],
  },
  likeness: {
    title: "Before you use a portrait",
    intro: "This feature sends a portrait image to the AI provider — and for minis, to Meshy as well — to guide the generated artwork.",
    bullets: [
      "Only use images you have the right to use. A real person's likeness needs their permission.",
      "Minis inherit the portrait's visibility setting and can end up public.",
    ],
  },
};

const copy = computed(() => COPY[kind]);

async function confirm() {
  isSaving.value = true;
  try {
    await acknowledge(kind, version.value);
    open.value = false;
    emit("confirm");
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  open.value = false;
  emit("cancel");
}
</script>
