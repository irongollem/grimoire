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
          <AppButton
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            :icon="IconClose"
            class="shrink-0"
            aria-label="Close"
            @click="cancel"
          />
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
            v-if="kind === 'ai_use' && mode !== 'choose'"
            :to="{ name: 'campaign-settings', query: { tab: 'ai' } }"
            class="inline-flex items-center gap-1 text-caption text-primary hover:underline self-start"
            @click="cancel"
          >
            Review this campaign's AI settings
            <IconExternalLink class="h-3 w-3" />
          </RouterLink>
          <p
            v-if="saveError"
            role="alert"
            class="text-caption text-destructive"
          >
            {{ saveError }}
          </p>
        </div>

        <div class="flex justify-end gap-2 px-5 pb-5 pt-2">
          <AppButton variant="subtle" size="sm" :label="cancelLabel" @click="cancel" />
          <AppButton variant="primary" size="sm" :disabled="isSaving" :label="confirmLabel" @click="confirm" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconInfo, IconClose, IconExternalLink } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import { useAiAcknowledgements, type AiAcknowledgementKind } from "@/composables/useAiAcknowledgements";
import { AI_USE_NOTICE_VERSION, AI_LIKENESS_NOTICE_VERSION, AI_PRO_REOFFER_NOTICE_VERSION } from "@/lib/legal";

/**
 * Reusable EU AI Act Art 50(1) consent dialog for both acknowledgement kinds.
 * See context/compliance/provenance-architecture.md §3. Recording happens
 * here (not in callers) so every gate that opens this dialog gets identical
 * "confirm records, cancel doesn't" behaviour for free.
 *
 * `mode: 'choose'` swaps the plain "AI is about to turn on" notice for the
 * inviting-but-honest opt-in chooser — used by `AiUseNoticeGate` both when a
 * campaign's `ai_enabled` has never been chosen (kind 'ai_use') and for the
 * one-time free->Pro re-ask on a campaign the owner previously declined
 * (kind 'ai_pro_reoffer', `proReoffer: true` — see
 * context/compliance/ai-act.md §4). Confirm always records the acknowledgement
 * for whichever `kind` was passed; what confirm/cancel additionally *do* to
 * the campaign's `ai_enabled` column, and any second acknowledgement kind
 * that also needs recording, is the caller's job (see AiUseNoticeGate.vue) —
 * this dialog stays a pure single-kind acknowledgement-recorder either way.
 */
const { kind, mode = "notice", proReoffer = false } = defineProps<{
  kind: AiAcknowledgementKind;
  mode?: "notice" | "choose";
  /** Swaps the chooser's lead line for the Pro re-offer copy. Copy only — behavior differences live in AiUseNoticeGate.vue. */
  proReoffer?: boolean;
}>();

const open = defineModel<boolean>({ required: true });

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const { acknowledge } = useAiAcknowledgements();
const isSaving = ref(false);
const saveError = ref("");
let saveAttempt = 0;

const version = computed(() => {
  if (kind === "ai_use") return AI_USE_NOTICE_VERSION;
  if (kind === "likeness") return AI_LIKENESS_NOTICE_VERSION;
  return AI_PRO_REOFFER_NOTICE_VERSION;
});

const BASE_COPY: Record<"ai_use" | "likeness", { title: string; intro: string; bullets: string[] }> = {
  ai_use: {
    title: "Before you turn on AI",
    intro: "This campaign is about to start using AI-generated content. A few things worth knowing:",
    bullets: [
      "Drafts can be inaccurate, generic, or resemble existing published works — always review before using them.",
      "Your prompts and relevant campaign context are sent to a third-party AI provider (OpenAI, Anthropic, or Google — whichever this campaign is set to use).",
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

// Inviting first, honest second — the copy this app's owner signed off on
// 4 Aug 2026 for the first-open chooser (context/compliance/ai-act.md §4).
// Deliberately not folded into BASE_COPY['ai_use'] above: the plain notice
// and the chooser are shown at different moments (mid-toggle vs. first
// campaign open) and read very differently on purpose.
const CHOOSE_COPY = {
  title: "Bring AI to this campaign?",
  intro: "Grimoire can help fill the world faster — NPCs, monsters, encounters, quests, traps, session recaps, artwork and soundscapes, drafted in seconds and grounded in this campaign's own content.",
  bullets: [
    "Drafts can be inaccurate or resemble existing works — review before using.",
    "Prompts and relevant campaign context are processed by the third-party AI provider this campaign uses (OpenAI, Anthropic, or Google).",
    "Generated content carries an invisible AI marker, as EU law requires.",
    "You can change this anytime in campaign settings.",
  ],
};

// The free->Pro re-ask (context/compliance/ai-act.md §4, 4 Aug 2026) reuses
// the chooser's honest bullets and both buttons verbatim — only the lead
// (title + intro) changes, to acknowledge this account already declined AI
// once rather than repeating the first-open pitch as if nothing happened.
// No guilt phrasing on decline.
const PRO_REOFFER_LEAD = {
  title: "Your Pro plan includes AI assistance",
  intro:
    "You turned AI off on this campaign a while back. Pro includes AI generation — NPCs, encounters, recaps, artwork and more, grounded in your own campaign — so here's a fresh choice.",
};

// Full per-kind copy table, including a defensive 'ai_pro_reoffer' entry —
// in practice this kind is only ever paired with mode="choose" (handled
// below), so this entry is a fallback, not the primary path.
const COPY: Record<AiAcknowledgementKind, { title: string; intro: string; bullets: string[] }> = {
  ...BASE_COPY,
  ai_pro_reoffer: { ...CHOOSE_COPY, ...PRO_REOFFER_LEAD },
};

const copy = computed(() => {
  if (mode !== "choose") return COPY[kind];
  return proReoffer ? { ...CHOOSE_COPY, ...PRO_REOFFER_LEAD } : CHOOSE_COPY;
});

const confirmLabel = computed(() => {
  if (mode !== "choose") return isSaving.value ? "Saving…" : "I understand";
  return isSaving.value ? "Enabling…" : "Enable AI assistance";
});
const cancelLabel = computed(() => (mode === "choose" ? "Not now" : "Cancel"));

async function confirm() {
  const attempt = ++saveAttempt;
  saveError.value = "";
  isSaving.value = true;
  try {
    await acknowledge(kind, version.value);
    // The user may close the dialog while a slow request is in flight. Do not
    // apply the confirmed action after they have cancelled it.
    if (attempt !== saveAttempt || !open.value) return;
    open.value = false;
    emit("confirm");
  } catch {
    if (attempt === saveAttempt && open.value) {
      saveError.value = mode === "choose"
        ? "We couldn't save this choice. Check your connection, then try again or choose Not now."
        : "We couldn't save this acknowledgement. Check your connection, then try again or close this notice.";
    }
  } finally {
    if (attempt === saveAttempt) isSaving.value = false;
  }
}

function cancel() {
  saveAttempt += 1;
  isSaving.value = false;
  saveError.value = "";
  open.value = false;
  emit("cancel");
}
</script>
