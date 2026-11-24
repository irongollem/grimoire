<template>
  <p v-if="item.state === 'cancelled'" class="text-caption text-muted-foreground" data-testid="ask-cancelled">Cancelled. Nothing was spent.</p>

  <section
    v-else-if="generator && (item.state === 'quote' || item.state === 'running')"
    class="flex flex-col gap-2.5 border border-border bg-card px-3 py-2.5"
    :aria-label="generator.action"
    data-testid="ask-quote"
  >
    <h3 class="text-label-lg font-semibold text-gold-500">{{ generator.action }}</h3>
    <p v-if="item.proposal.concept" class="text-caption text-muted-foreground">{{ item.proposal.concept }}</p>

    <!-- A generator that works in its own screen has nothing to quote: Ask opens it with the request filled in. -->
    <template v-if="screen">
      <p class="text-body">This one works in its own screen.</p>
      <AppButton variant="primary" size="sm" class="self-start" :label="`Open ${generator.noun}`" @click="router.push(screen.route(item.proposal))" />
    </template>

    <template v-else-if="!adapter">
      <p class="text-body">I can't run that one from here yet.</p>
      <AppButton v-if="pageRoute" variant="link" size="inline-body" class="self-start" label="Open its page" :to="pageRoute" />
    </template>

    <template v-else-if="quote">
      <!-- The ledger: what Ask understood, and what each part costs. -->
      <dl class="flex flex-col gap-1 text-body">
        <div v-for="line in quote.lines" :key="line.choice?.key ?? line.label" class="flex items-baseline gap-2">
          <!-- A line that changes a record that already exists is the DM's yes or no; it is written only while ticked. -->
          <template v-if="line.choice">
            <dt class="min-w-0 flex-1">
              <AppCheckbox
                :model-value="line.choice.on"
                size="sm"
                data-testid="ask-line-choice"
                @update:model-value="emit('decide', line.choice.key, $event === true)"
              >
                <span class="text-muted-foreground">{{ line.label }}</span>
                <span :class="['ml-2', line.choice.on ? '' : 'text-muted-foreground line-through']">{{ line.value }}</span>
              </AppCheckbox>
            </dt>
          </template>
          <template v-else>
            <dt class="text-muted-foreground">{{ line.label }}</dt>
            <dd class="min-w-0 flex-1 truncate">{{ line.value }}</dd>
            <dd v-if="line.credits !== null" class="shrink-0 tabular-nums">{{ line.credits }}</dd>
          </template>
        </div>
      </dl>
      <div class="flex items-baseline justify-between border-t border-foreground/60 pt-1 text-body font-semibold" data-testid="ask-total">
        <span>Total</span>
        <span class="tabular-nums">{{ totalText }}</span>
      </div>

      <AskAdjust v-if="adjusting && item.state === 'quote'" :generator="generator" :inputs="item.proposal.inputs" @update="emit('adjust', $event)" />

      <!-- A gate that says no replaces the gilt button with its reason, and the way past it. -->
      <div v-if="quote.block" class="flex flex-col gap-1.5" role="alert" data-testid="ask-block">
        <p class="text-body">{{ quote.block.message }}</p>
        <div v-if="quote.block.reason === 'credits'" class="flex gap-2">
          <AppButton variant="primary" size="sm" label="Get credits" @click="emit('credits', quote.total ?? 1)" />
        </div>
        <div v-else-if="quote.block.reason === 'quota'" class="flex gap-2">
          <AppButton variant="primary" size="sm" label="Upgrade to Pro" @click="emit('upgrade')" />
        </div>
      </div>
      <div v-else class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="primary"
          size="sm"
          :loading="working || waitingForPrice"
          :disabled="working || waitingForPrice"
          data-testid="ask-confirm"
          @click="emit('confirm')"
        >
          {{ working ? "Working…" : buttonText(generator) }}
        </AppButton>
        <AppButton v-if="!working" variant="subtle" size="sm" label="Adjust" :active="adjusting" @click="adjusting = !adjusting" />
        <AppButton v-if="!working" variant="ghost" size="sm" label="Cancel" data-testid="ask-cancel" @click="emit('cancel')" />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * What a proposed generator will cost, drawn from the generator's own adapter (so the price and the gates are the
 * page's). Nothing has run: only the gilt button does, and the conversation runs it once per proposal.
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { creditsText } from "@/lib/ask/askCredits";
import { askGenerator, type AskGenerator } from "@edge-shared/agent/askContract";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import { askGeneratorPage } from "@/composables/ask/askRecordRoute";
import type { AskItem } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskAdjust from "@/components/ask/AskAdjust.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";

const { item, adapters } = defineProps<{
  item: Extract<AskItem, { kind: "proposal" }>;
  adapters: AskAdapters;
}>();
const emit = defineEmits<{
  confirm: [];
  cancel: [];
  adjust: [inputs: Record<string, unknown>];
  decide: [key: string, on: boolean];
  credits: [needed: number];
  upgrade: [];
}>();

const router = useRouter();
const adjusting = ref(false);

const generator = computed(() => askGenerator(item.proposal.generator));
const adapter = computed(() => adapters.adapterFor(item.proposal.generator));
const screen = computed(() => adapters.screenFor(item.proposal.generator));
const pageRoute = computed(() => askGeneratorPage(item.proposal.generator));
// Re-read whenever the proposal's inputs change: Adjust re-quotes by being the thing this reads.
const quote = computed(() => adapter.value?.quote(item.proposal, item.choices) ?? null);

const working = computed(() => item.state === "running");
/** The provider, and so the price, is not known yet: the button waits and never guesses. */
const waitingForPrice = computed(() => quote.value !== null && quote.value.total === null);
const totalText = computed(() => {
  if (quote.value === null) return "";
  return quote.value.total === null ? "…" : creditsText(quote.value.total);
});
/** The gilt button: drawn only inside the branch where the generator is known. */
function buttonText(known: AskGenerator): string {
  if (quote.value === null || quote.value.total === null) return known.action;
  return `${known.action} · ${creditsText(quote.value.total)}`;
}
</script>
