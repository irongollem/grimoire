<template>
  <div ref="scroller" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3" data-testid="ask-thread">
    <p v-if="items.length === 0" class="py-6 text-center text-body text-muted-foreground">
      Ask what your campaign already says, ask for ideas, or ask for something to be made.
    </p>
    <div v-for="item in items" :key="item.id" :data-ask-item="item.id" class="flex flex-col">
      <!-- The DM's words, right-aligned and in the hand. -->
      <div v-if="item.kind === 'user'" class="flex justify-end">
        <span data-hand="text" class="max-w-[85%] whitespace-pre-line bg-muted/50 px-3 py-1.5 text-right text-base leading-6" data-testid="ask-user-message">{{ item.text }}</span>
      </div>
      <AskReply
        v-else-if="item.kind === 'reply'"
        :text="item.text"
        :who="item.who"
        :replayable="replayable && !(running && item === items.at(-1))"
        @replay="emit('replay', item.text)"
      />
      <AskReply
        v-else-if="item.kind === 'ask'"
        :text="item.question"
        :choices="item.choices"
        :answered="item.answered"
        @choose="emit('choose', item.id, $event)"
      />
      <AskRead v-else-if="item.kind === 'read'" :records="item.records" />
      <AskIdeas v-else-if="item.kind === 'ideas'" :ideas="item.ideas" :handed-off="item.handedOff" @hand-off="emit('hand-off', item.id, $event)" />
      <AskPending
        v-else-if="item.kind === 'proposal' && item.state !== 'quote' && item.state !== 'cancelled' && generatorAction(item)"
        :state="item.state"
        :action="generatorAction(item) ?? ''"
        :asked="item.proposal.concept"
        :credits="item.credits"
        :editable="isHeldKind(item.proposal.generator)"
        :kept="item.kept"
        :noun="askGenerator(item.proposal.generator)?.noun"
        :landed-at="item.landedAt"
        :landed-name="landedName(item.landedAt)"
        @jump="jumpTo"
      >
        <!-- Opened again from the fold: change an option, then "Again" below runs with it. -->
        <template v-if="item.state === 'previewing'" #options>
          <div class="flex flex-col gap-2.5">
            <AskConceptBox
              v-if="item.origin === 'button' && askGenerator(item.proposal.generator)?.concept"
              :field="askGenerator(item.proposal.generator)!.concept!"
              :model-value="item.proposal.concept"
              :noun="askGenerator(item.proposal.generator)?.noun ?? ''"
              @update:model-value="emit('concept', item.id, $event)"
            />
            <AskForm
              v-if="askGenerator(item.proposal.generator)"
              :generator="askGenerator(item.proposal.generator)!"
              :inputs="item.proposal.inputs"
              :boxed="item.origin === 'button' && !!askGenerator(item.proposal.generator)?.concept"
              @update="emit('adjust', item.id, $event)"
            />
          </div>
        </template>
      </AskPending>
      <AskQuoteCard
        v-else-if="item.kind === 'proposal'"
        :item="item"
        :adapters="adapters"
        @confirm="emit('confirm', item.id)"
        @cancel="emit('cancel', item.id)"
        @adjust="emit('adjust', item.id, $event)"
        @concept="emit('concept', item.id, $event)"
        @quick="emit('quick', item.id)"
        @decide="(key, on) => emit('decide', item.id, key, on)"
        @credits="emit('credits', $event)"
        @upgrade="emit('upgrade')"
      />
      <AskPreviewCard
        v-else-if="item.kind === 'preview'"
        :item="item"
        :action="proposalAction(item.proposalItemId)"
        :noun="proposalNoun(item.proposalItemId)"
        :again="againFor(item.proposalItemId)"
        @create="emit('create', item.id)"
        @again="emit('again', item.id)"
        @act="(section, row) => emit('act', item.id, section, row)"
        @discard="emit('discard', item.id)"
        @pick="(key, value) => emit('pick', item.id, key, value)"
      />
      <AskReportCard v-else-if="item.kind === 'report'" :report="item.report" @review="emit('review', item.report)" />
      <p v-else-if="item.kind === 'confirmed'" class="text-caption text-muted-foreground">{{ item.text }}</p>
      <AskResultCard
        v-else-if="item.kind === 'result'"
        :item="item"
        @retry="emit('retry', item.id, $event)"
        @leave="emit('leave', item.id, $event)"
      />
      <AskUpsell v-else-if="item.kind === 'upsell'" @credits="emit('credits', 1)" @upgrade="emit('upgrade')" />
      <p v-else-if="item.kind === 'error'" class="text-body text-destructive" role="alert">{{ item.message }}</p>
    </div>
    <div v-if="running" class="flex items-center gap-2 text-caption text-muted-foreground" data-testid="ask-running">
      <BannerLoader class="h-3.5" />
      Thinking…
    </div>
  </div>
</template>

<script setup lang="ts">
/** The conversation: one block per thing said, drawn by kind. It holds no state; the conversation does. */
import { nextTick, ref, watch } from "vue";
import type { AskChoice, AskReportDraft } from "@edge-shared/agent/askContract";
import { isPreviewAdapter } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import type { AskItem } from "@/composables/ask/useAskConversation";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AskReply from "@/components/ask/AskReply.vue";
import AskRead from "@/components/ask/AskRead.vue";
import AskIdeas from "@/components/ask/AskIdeas.vue";
import AskQuoteCard from "@/components/ask/AskQuoteCard.vue";
import AskPending from "@/components/ask/AskPending.vue";
import AskPreviewCard from "@/components/ask/AskPreviewCard.vue";
import AskConceptBox from "@/components/ask/AskConceptBox.vue";
import AskForm from "@/components/ask/AskForm.vue";
import { askGenerator } from "@edge-shared/agent/askContract";
import { canAnimate } from "@/lib/motion";
import AskResultCard from "@/components/ask/AskResultCard.vue";
import AskReportCard from "@/components/ask/AskReportCard.vue";
import AskUpsell from "@/components/ask/AskUpsell.vue";

const { items, adapters, running = false, replayable = false } = defineProps<{
  items: AskItem[];
  adapters: AskAdapters;
  running?: boolean;
  /** Ooru's voice is on, so a finished reply may be read again. */
  replayable?: boolean;
}>();
const emit = defineEmits<{
  choose: [itemId: number, choice: AskChoice];
  replay: [text: string];
  "hand-off": [itemId: number, index: number];
  confirm: [itemId: number];
  cancel: [itemId: number];
  adjust: [itemId: number, inputs: Record<string, unknown>];
  concept: [itemId: number, text: string];
  quick: [itemId: number];
  create: [previewId: number];
  again: [previewId: number];
  act: [previewId: number, section: number, row: number];
  discard: [previewId: number];
  pick: [previewId: number, key: string, value: string];
  decide: [itemId: number, key: string, on: boolean];
  retry: [itemId: number, index: number];
  leave: [itemId: number, index: number];
  credits: [needed: number];
  upgrade: [];
  review: [report: AskReportDraft];
}>();

const scroller = ref<HTMLElement | null>(null);

/** The quote card's action ("Create NPC"), or null for a generator this build does not know. */
function generatorAction(item: Extract<AskItem, { kind: "proposal" }>): string | null {
  return askGenerator(item.proposal.generator)?.action ?? null;
}

/** A generator whose result is held for a yes: its folded line can be opened again to change an option. */
function isHeldKind(generator: string): boolean {
  const adapter = adapters.adapterFor(generator);
  return adapter !== undefined && isPreviewAdapter(adapter);
}

/** The proposal a held generation belongs to. */
function proposalOf(id: number): Extract<AskItem, { kind: "proposal" }> | undefined {
  return items.find((i): i is Extract<AskItem, { kind: "proposal" }> => i.id === id && i.kind === "proposal");
}

/** What the held generation's primary button says: the generator's own word for it, else its action ("Create encounter"). */
function proposalAction(id: number): string {
  const proposal = proposalOf(id);
  const generator = proposal ? askGenerator(proposal.proposal.generator) : undefined;
  return generator?.createAction ?? generator?.action ?? "Create";
}

/** What the held generation's generator calls one thing it makes ("quest"). */
function proposalNoun(id: number): string | undefined {
  const proposal = proposalOf(id);
  return proposal ? askGenerator(proposal.proposal.generator)?.noun : undefined;
}

/** What another generation would cost now, from the adapter's own quote of the inputs as they stand. */
function againFor(id: number): { price: number | null; blocked: boolean } {
  const proposal = proposalOf(id);
  const quote = proposal ? adapters.adapterFor(proposal.proposal.generator)?.quote(proposal.proposal, proposal.choices) : undefined;
  return { price: quote?.total ?? null, blocked: quote?.block != null };
}

/** The name a run landed under, for the link it leaves behind. */
function landedName(id: number | undefined): string | null {
  if (id === undefined) return null;
  const landed = items.find((i) => i.id === id);
  return landed?.kind === "result" ? landed.name : null;
}

/**
 * A card a button opened takes focus: its concept box, or its first field when it has none, so a keyboard user who
 * pressed Suggest (from inside a sheet, or anywhere) is in the card without hunting for the dock.
 */
function focusCard(id: number) {
  const card = scroller.value?.querySelector<HTMLElement>(`[data-ask-item="${id}"]`);
  card?.querySelector<HTMLElement>("textarea, input, select, [role=combobox], button:not([disabled])")?.focus({ preventScroll: true });
}

/** Down to where a run landed. */
function jumpTo(id: number) {
  const target = scroller.value?.querySelector<HTMLElement>(`[data-ask-item="${id}"]`);
  if (target) target.scrollIntoView({ block: "start", behavior: canAnimate(target) ? "smooth" : "auto" });
}

// Keep the newest line in view as it is written.
watch(
  () => [items.length, items.at(-1)?.kind === "reply" ? (items.at(-1) as Extract<AskItem, { kind: "reply" }>).text.length : 0],
  async () => {
    await nextTick();
    // A card a button opened is to be filled in from its first field, so it is shown from its top, not its foot.
    const last = items.at(-1);
    if (last?.kind === "proposal" && last.origin === "button") {
      jumpTo(last.id);
      focusCard(last.id);
    }
    else scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
  },
);
</script>
