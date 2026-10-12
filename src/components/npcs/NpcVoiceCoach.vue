<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground">
      Stuck for a reply? Describe what's happening and get a few in-character lines you can read straight off the screen. Only the lines you mark as said are remembered.
    </p>

    <!-- Results -->
    <template v-if="lines.length">
      <div class="flex items-center justify-between">
        <p class="text-label-lg font-semibold text-muted-foreground">SUGGESTED LINES</p>
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="underline underline-offset-2"
          :icon="IconRefresh"
          icon-size="xs"
          label="Ask again"
          @click="askAgain"
        />
      </div>

      <ul class="flex flex-col gap-3">
        <li
          v-for="(line, i) in lines"
          :key="i"
          class="flex items-start gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3.5"
        >
          <IconQuote class="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
          <p class="flex-1 text-body leading-relaxed text-foreground">{{ line }}</p>
          <AppButton
            variant="ghost"
            size="inline-caption"
            class="shrink-0"
            :icon="isRemembered(i) ? IconCheck : IconBookmark"
            icon-size="xs"
            :label="isRemembered(i) ? 'Remembered' : 'Said it'"
            :title="isRemembered(i) ? 'Filed in the Memory tab' : 'Remember that they said this'"
            :disabled="isRemembered(i) || createMemory.isPending.value"
            @click="rememberLine(i, line)"
          />
        </li>
      </ul>
    </template>

    <!-- Form -->
    <template v-else>
      <div>
        <textarea
          v-model="situation"
          rows="3"
          :maxlength="SITUATION_LIMIT"
          placeholder="A player asks the guard captain why the gate is closed early…"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <div class="flex justify-end mt-1">
          <span
            class="text-caption"
            :class="situation.length >= SITUATION_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ situation.length }} / {{ SITUATION_LIMIT }}</span>
        </div>
      </div>

      <!-- Error state -->
      <div
        v-if="error"
        class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
      >
        <p class="text-caption text-destructive">{{ error }}</p>
      </div>

      <!-- Loading state -->
      <div v-if="isGenerating" class="flex items-center justify-center gap-2 py-2">
        <IconGenerate class="h-5 w-5 text-primary animate-pulse" />
        <p class="text-body text-muted-foreground italic">Finding the words…</p>
      </div>

      <!-- Generate controls -->
      <div v-else class="flex flex-col gap-2">
        <GenerationCostBadge
          v-if="isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <AppButton
          v-if="isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isGenerating || !situation.trim()"
          label="Suggest lines"
          @click="runSuggest"
        />
        <AiOffNotice v-else />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { IconBookmark, IconCheck, IconGenerate, IconQuote, IconRefresh } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useNpcVoiceCoach } from "@/ai/useNpcVoiceCoach";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useCreateNpcMemory } from "@/composables/npcs/useNpcMemories";
import { useToast } from "@/composables/useToast";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { defaultMemorySessionId } from "@/lib/npcs/npcMemories";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import type { Npc } from "@/types/npc.types";

const { npc } = defineProps<{ npc: Npc }>();

const SITUATION_LIMIT = AI_PROMPT_LIMIT_SHORT;
const MEMORY_BODY_LIMIT = 1000;

const campaign = useCampaignStore();
const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textCredits, textIsByok } = useCampaignProviders();

const situation = ref("");

const { isGenerating, error, lines, provenance, suggest, clear } = useNpcVoiceCoach();

const toast = useToast();
const { session: openSession, isRunning } = useCampaignSession();
const { data: sessionLog } = useCampaignSessions();
const createMemory = useCreateNpcMemory();
// Indexes of the current lines already filed; reset whenever the lines change.
const remembered = ref<ReadonlySet<number>>(new Set());
watch(lines, () => {
  remembered.value = new Set();
});

function isRemembered(i: number): boolean {
  return remembered.value.has(i);
}

/** The running session, else the last one played; the log may still be loading, and then only the running one is known. */
function filingSessionId(): string | null {
  const running = isRunning.value ? openSession.value : null;
  return sessionLog.value ? defaultMemorySessionId(running, sessionLog.value) : (running?.id ?? null);
}

/** Files a suggested line as something the NPC said. DM-only until shared from the Memory tab. */
async function rememberLine(i: number, line: string) {
  try {
    await createMemory.mutateAsync({
      memory: {
        npc_id: npc.id,
        kind: "revealed",
        body: line.trim().slice(0, MEMORY_BODY_LIMIT),
        session_id: filingSessionId(),
        party_member_ids: [],
        player_visible_to: [],
        ai_provenance: provenance.value,
      },
      npcLabel: getNpcDisplayName(npc) ?? npc.name,
    });
    remembered.value = new Set([...remembered.value, i]);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not remember that line."));
  }
}

const isAiEnabled = computed(() => campaign.isAiEnabled);
const textCreditCost = computed(
  () => textCredits(costOf("npc_voice_generation")),
);

async function runSuggest() {
  const trimmed = situation.value.trim();
  if (!trimmed) return;
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;
  await suggest(npc, trimmed);
}

function askAgain() {
  clear();
  situation.value = "";
}
</script>
