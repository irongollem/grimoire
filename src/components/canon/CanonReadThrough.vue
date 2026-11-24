<template>
  <div class="flex flex-col gap-2" data-testid="canon-read-through">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <GenerationCostBadge :credits="cost" :byok="textIsByok" />
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconGenerate"
        icon-size="xs"
        :loading="isGenerating"
        :disabled="isAnyAiGenerating"
        :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
        label="Read it through"
        @click="run"
      />
    </div>

    <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    <div v-if="isGenerating" class="space-y-2" role="status" aria-live="polite">
      <p class="flex items-center gap-2 text-caption italic text-muted-foreground">
        <BannerLoader class="h-4" />
        Reading the whole canon for what does not hold together. This takes a little while.
      </p>
      <ListSkeleton variant="text" :count="3" />
    </div>

    <div v-if="hasResult" class="flex flex-col gap-2 border border-border bg-muted/30 p-3" data-testid="read-through-findings">
      <div class="flex items-center justify-between">
        <div class="text-label-lg font-semibold text-muted-foreground">What the read found</div>
        <AppButton variant="subtle" size="sm" label="Clear" @click="dismissAll" />
      </div>
      <p class="text-caption text-muted-foreground">Nothing is saved or changed. Open an entry to fix what you agree with.</p>
      <p v-if="findings.length === 0" class="text-body italic text-muted-foreground" data-testid="read-through-clear">
        Nothing contradicts and nothing is loose.
      </p>
      <div v-for="(f, i) in findings" :key="`${i}:${f.text}`" class="flex flex-col gap-1.5 border border-border bg-card p-3" data-testid="read-through-finding">
        <span class="text-eyebrow text-muted-foreground">{{ KIND_TAG[f.kind] }}</span>
        <p class="text-body text-foreground">{{ f.text }}</p>
        <ul class="flex flex-wrap gap-1.5">
          <li v-for="id in f.entry_ids" :key="id">
            <RouterLink
              :to="`/canon?entry=${id}`"
              class="inline-flex items-center border border-border bg-muted/40 px-2 py-px text-label text-foreground hover:underline"
            >{{ titleOf(id) }}</RouterLink>
          </li>
        </ul>
      </div>
      <p v-for="a in setAside" :key="`aside:${a.claim}`" class="text-caption italic text-muted-foreground">
        Set aside: "{{ a.claim }}". {{ capitalised(a.reason) }}.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Read it through" (#1255 item 7): one run over the whole canon that lists contradictions between entries and loose
 * ends (a secret with no clue, a force with no next step, a question nothing is tied to), each linking to its entries.
 * It writes nothing: the findings are a list to read, never to accept. The loose ends are computed on the server in code;
 * only the contradictions come from the model.
 */
import { computed } from "vue";
import { IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCanonSuggestions } from "@/ai/useCanonSuggestions";

const KIND_TAG = { contradiction: "Contradiction", loose_end: "Loose end" } as const;

const { suggest, suggestions: findings, setAside, isGenerating, hasResult, error, dismissAll } = useCanonSuggestions("read");
const { canSpend } = useGenerationGate();
const quoteFor = useCanonSuggestionsQuote();
const { textIsByok } = useCampaignProviders();
const cost = computed(() => quoteFor("read").total);

const { data: entries } = useCanonEntries();
const titles = computed(() => new Map((entries.value ?? []).map((e) => [e.id, e.title.trim()])));
const titleOf = (id: string) => {
  const title = titles.value.get(id);
  return title === undefined || title === "" ? "An entry" : title;
};

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

async function run() {
  if (!canSpend(cost.value, textIsByok.value)) return;
  await suggest("");
}
</script>
