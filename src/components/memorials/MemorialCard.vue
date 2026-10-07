<template>
  <article
    class="mcard"
    :class="fallen ? 'mcard-fallen' : 'mcard-retired'"
    :data-kind="memorial.kind"
    :data-side="side"
    :aria-label="`${memorial.character_name}, ${fallen ? 'in memoriam' : 'in honour'}`"
  >
    <span v-if="fallen" class="mcard-sash" aria-hidden="true" />
    <div class="mcard-paper">
      <i class="mcard-diamond mcard-diamond-tl" aria-hidden="true" />
      <i class="mcard-diamond mcard-diamond-tr" aria-hidden="true" />
      <i class="mcard-diamond mcard-diamond-bl" aria-hidden="true" />
      <i class="mcard-diamond mcard-diamond-br" aria-hidden="true" />

      <!-- Front -->
      <div v-if="side === 'front'" class="mcard-front">
        <div class="mcard-eyebrow">
          <span class="mcard-eyebrow-rule" />{{ fallen ? "IN MEMORIAM" : "IN HONOUR" }}<span class="mcard-eyebrow-rule" />
        </div>
        <MemorialCameo
          :kind="memorial.kind"
          :name="memorial.character_name"
          :portrait-url="memorial.portrait_url"
          :focal-point="memorial.portrait_focal_point"
          class="mcard-cameo"
        />
        <h3 class="mcard-name">{{ memorial.character_name }}</h3>
        <div v-if="lineage" class="mcard-lineage">{{ lineage }}</div>
        <div class="mcard-gilt-rule mcard-gilt-rule-wide" aria-hidden="true">
          <span /><i /><span />
        </div>
        <div v-if="!fallen" class="mcard-smallcaps mcard-laid-down">Laid down arms</div>
        <div class="mcard-date">
          <span v-if="fallen" class="mcard-dagger">&dagger;</span>{{ gameDate }}
        </div>
        <div class="mcard-smallcaps mcard-campaign">{{ memorial.campaign_name }}</div>
        <div class="mcard-footer">
          <span class="mcard-remembered">
            <template v-if="memorial.player_name">Remembered by {{ memorial.player_name }}<br /></template>{{ fallen ? "Laid to rest" : "Retired" }} {{ realDate }}
          </span>
          <AppButton
            variant="ghost"
            size="xs"
            :icon="IconUndo"
            label="Turn over"
            class="mcard-quiet-button"
            data-testid="turn-over"
            @click="emit('flip')"
          />
        </div>
      </div>

      <!-- Back: the obituary -->
      <div v-else class="mcard-back">
        <div class="mcard-masthead">
          <div class="mcard-masthead-title">{{ fallen ? "OBITUARY" : "IN HONOUR" }}</div>
        </div>
        <div class="mcard-masthead-underline" />
        <p class="mcard-lead">
          <!-- The name stands on its own line; the sentence that follows it is the obituary's lead. -->
          <b>{{ memorial.character_name }}</b>
          <span class="mcard-lead-line">{{ lineage ? `${lineage}, ` : "" }}{{ fallen ? "fell" : "laid down arms" }}{{ gameDate ? ` on ${gameDate}` : "" }}.</span>
        </p>

        <div class="mcard-scroll">
          <div class="mcard-section-head">
            <span class="mcard-smallcaps mcard-oxblood">{{ fallen ? "How it happened" : "How they left" }}</span>
            <AppButton
              v-if="viewer === 'dm'"
              variant="outline"
              size="icon-xs"
              :icon="IconEdit"
              aria-label="Edit your account"
              class="mcard-quill"
              data-testid="edit-account"
              @click="emit('edit-account')"
            />
          </div>
          <RichTextViewer v-if="account" :content="account" class="mcard-account" data-testid="account" />
          <p v-else class="mcard-pending">No account has been written.</p>

          <p v-if="memorial.last_blow && fallen" class="mcard-aside" data-testid="last-blow">
            Struck down by {{ memorial.last_blow }}.
          </p>
          <p v-if="fallen && memorial.survived_by.length > 0" class="mcard-aside" data-testid="survived-by">
            Survived by {{ joinNames(memorial.survived_by) }}.
          </p>

          <template v-if="showWordsSection">
            <div class="mcard-gilt-rule mcard-gilt-rule-narrow" aria-hidden="true">
              <span /><i /><span />
            </div>
            <div class="mcard-section-head">
              <span class="mcard-smallcaps mcard-oxblood">{{ fallen ? "Last words" : "Farewell" }}</span>
              <AppButton
                v-if="viewer === 'owner' && words"
                variant="outline"
                size="icon-xs"
                :icon="IconEdit"
                aria-label="Edit their last words"
                class="mcard-quill"
                data-testid="edit-words"
                @click="emit('edit-words')"
              />
            </div>
            <div v-if="words" class="mcard-words">
              <span class="mcard-quote-mark" aria-hidden="true">&ldquo;</span>
              <RichTextViewer :content="words" class="mcard-words-text" data-testid="words" />
              <div class="mcard-smallcaps mcard-signed">{{ memorial.player_name }}</div>
            </div>
            <div v-else class="mcard-invite" data-testid="words-invite">
              <p>Their last words are yours to write.</p>
              <AppButton
                variant="outline"
                size="sm"
                :icon="IconEdit"
                label="Write their last words"
                class="mcard-write"
                data-testid="write-words"
                @click="emit('edit-words')"
              />
            </div>
          </template>
        </div>

        <div class="mcard-footer">
          <AppButton
            v-if="fallen"
            variant="ghost"
            size="xs"
            :aria-label="candleLabel"
            :aria-pressed="litByMe"
            :disabled="litByMe"
            class="mcard-quiet-button mcard-candles"
            data-testid="light-candle"
            @click="emit('light-candle')"
          >
            <span class="mcard-candle-row" aria-hidden="true">
              <MemorialCandle
                v-for="n in Math.min(candleCount, 5)"
                :key="n"
                :lit="true"
                :phase="PHASES[n % 3]"
                class="mcard-candle-icon"
              />
            </span>
            <span>{{ candleLabel }}</span>
          </AppButton>
          <span v-else />
          <AppButton
            variant="ghost"
            size="xs"
            :icon="IconUndo"
            label="Turn over"
            class="mcard-quiet-button"
            data-testid="turn-over"
            @click="emit('flip')"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import MemorialCameo from "@/components/memorials/MemorialCameo.vue";
import MemorialCandle from "@/components/memorials/MemorialCandle.vue";
import { IconEdit, IconUndo } from "@/lib/icons";
import { memorialLineage } from "@/lib/memorials/lineage";
import { writtenOrNull } from "@/lib/memorials/writing";
import type { CharacterMemorial } from "@/types/memorial.types";

/**
 * One memorial card, one face at a time (Hall of the Fallen, #982). The wall wraps it in
 * `CardFlip`; this component draws the face it is told to and says "flip" when asked.
 *
 * The approved design is `FallenCard` on the Hall of the Fallen canvas: a black mourning
 * frame with a gilt hairline and a sash for the fallen, a gilt frame and a laurel for
 * those who retired; the back is a newspaper obituary.
 *
 * It is an artefact (black, gilt, cream paper), not app chrome, so its palette is a set of
 * fixed custom properties on the card root rather than theme tokens. The wall around it is
 * always the dark twin of the viewer's theme; the card must not follow it, or a
 * cream-paper card would turn dark-on-dark.
 *
 * What each viewer sees on the back: the owner gets a quill on their last words, or an
 * invitation to write them when there are none; the DM gets a quill on the account;
 * everyone else sees no last-words section at all when it is empty, because an empty
 * heading over nothing reads as neglect.
 */
const props = defineProps<{
  memorial: CharacterMemorial;
  side: "front" | "back";
  viewer: "owner" | "dm" | "other";
  candleCount: number;
  litByMe: boolean;
}>();

const emit = defineEmits<{
  flip: [];
  "light-candle": [];
  "edit-words": [];
  "edit-account": [];
}>();

const PHASES = ["a", "b", "c"] as const;

const fallen = computed(() => props.memorial.kind === "fallen");
const lineage = computed(() => memorialLineage(props.memorial));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 May 2026" from a date or timestamp; the raw text when it is not one. */
function formatRealDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  if (!m || !month) return value;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

const realDate = computed(() => formatRealDate(props.memorial.real_date));
/** The in-world date; the real one stands in when the DM left it blank. */
const gameDate = computed(() => props.memorial.game_date ?? realDate.value);

// Both are Tiptap documents from RichTextEditor; an emptied one counts as unwritten.
const account = computed(() => writtenOrNull(props.memorial.account));
const words = computed(() => writtenOrNull(props.memorial.last_words));
const showWordsSection = computed(() => words.value !== null || props.viewer === "owner");

const candleLabel = computed(() => {
  if (props.candleCount === 0) return "Light a candle";
  return props.candleCount === 1 ? "1 candle" : `${props.candleCount} candles`;
});

/** "Fresco, Rosie and Vellum". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
</script>

<style scoped>
.mcard {
  /* Fixed mourning palette: see the component note. Not theme tokens, on purpose. */
  --mc-frame: #14100c;
  --mc-hairline: #a8822e;
  --mc-eyebrow: #14100c;
  --mc-mark: #6e1f1a;
  --mc-paper: #f6f0e3;
  --mc-ink: #231a14;
  --mc-ink-soft: #4a3f35;
  --mc-ink-quiet: #5f5347;
  --mc-gilt: #a8822e;
  --mc-oxblood: #6e1f1a;
  --mc-rule: #b8ab93;

  position: relative;
  width: 16.5rem;
  height: 31.25rem;
  box-sizing: border-box;
  padding: 0.5rem;
  overflow: hidden;
  background: var(--mc-frame);
  box-shadow: 0 1px 0 rgb(0 0 0 / 0.35), 0 10px 24px rgb(0 0 0 / 0.28);
  color: var(--mc-ink);
  font-family: var(--font-fell);
  text-align: left;
}
.mcard-retired {
  --mc-frame: #b48a32;
  --mc-hairline: #7a5a14;
  --mc-eyebrow: #7a5a14;
  --mc-mark: #7a5a14;
}
.mcard-sash {
  position: absolute;
  z-index: 3;
  top: 1.375rem;
  left: -2.625rem;
  width: 9.375rem;
  height: 0.9375rem;
  background: #14100c;
  rotate: -45deg;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
}
.mcard-paper {
  position: relative;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--mc-paper) url("/assets/vellum/paper.webp") 0 0 / 25rem 25rem;
  outline: 1px solid var(--mc-hairline);
  outline-offset: -6px;
}
.mcard-diamond {
  position: absolute;
  width: 0.375rem;
  height: 0.375rem;
  rotate: 45deg;
  background: var(--mc-hairline);
}
.mcard-diamond-tl { top: 0.1875rem; left: 0.1875rem; }
.mcard-diamond-tr { top: 0.1875rem; right: 0.1875rem; }
.mcard-diamond-bl { bottom: 0.1875rem; left: 0.1875rem; }
.mcard-diamond-br { bottom: 0.1875rem; right: 0.1875rem; }

.mcard-smallcaps {
  font-family: var(--font-stat);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mc-ink-quiet);
}
.mcard-oxblood { color: var(--mc-oxblood); }

/* Front */
.mcard-front {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  box-sizing: border-box;
  padding: 1rem 0.875rem 0;
  text-align: center;
}
.mcard-eyebrow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-cinzel);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: var(--mc-eyebrow);
}
.mcard-eyebrow-rule {
  width: 1.125rem;
  height: 1px;
  background: currentColor;
}
.mcard-cameo { margin-top: 0.25rem; }
.mcard-name {
  margin: 0.125rem 0 0;
  font-family: var(--font-cinzel);
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  line-height: 1.18;
  color: var(--mc-ink);
}
.mcard-lineage {
  margin-top: 0.1875rem;
  font-size: 0.84rem;
  font-style: italic;
  color: var(--mc-ink-soft);
}
.mcard-gilt-rule {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
}
.mcard-gilt-rule span {
  flex-grow: 1;
  height: 1px;
  background: var(--mc-gilt);
}
.mcard-gilt-rule i {
  width: 0.3125rem;
  height: 0.3125rem;
  rotate: 45deg;
  background: var(--mc-gilt);
}
.mcard-gilt-rule-wide { margin: 0.5rem 0 0.375rem; width: 70%; }
.mcard-gilt-rule-narrow { margin: 0.5625rem auto 0.25rem; width: 60%; }
.mcard-laid-down { margin-bottom: 0.125rem; color: #7a5a14; }
.mcard-date {
  font-size: 0.97rem;
  line-height: 1.2;
}
.mcard-dagger {
  margin-right: 0.3125rem;
  font-family: var(--font-cinzel);
  font-weight: 700;
  color: var(--mc-mark);
}
.mcard-campaign { margin-top: 0.1875rem; }
.mcard-footer {
  margin-top: auto;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0 0.625rem;
  border-top: 1px dotted var(--mc-rule);
}
.mcard-back .mcard-footer { padding-inline: 0; }
.mcard-remembered {
  font-size: 0.72rem;
  font-style: italic;
  line-height: 1.25;
  color: var(--mc-ink-quiet);
  text-align: left;
}

/* The two "quiet" controls sit on paper, so they name their own ink: the dark twin's
   muted-foreground (what a ghost button reads) is a light grey on cream. */
.mcard :deep(.mcard-quiet-button) {
  min-height: 1.875rem;
  color: var(--mc-ink-quiet);
  font-family: var(--font-stat);
  font-size: 0.59rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.mcard :deep(.mcard-quiet-button:hover:not(:disabled)) { color: var(--mc-ink); }
.mcard :deep(.mcard-quill),
.mcard :deep(.mcard-write) {
  background: #faf6ee;
  border-color: #8a7d6c;
  color: var(--mc-ink);
}
.mcard :deep(.mcard-quill:hover),
.mcard :deep(.mcard-write:hover) {
  background: #f1e9d8;
  color: var(--mc-ink);
}
.mcard :deep(.mcard-quill) { border-color: rgb(35 26 20 / 0.35); }
.mcard :deep(.mcard-write) { font-family: var(--font-stat); border-radius: 2px; }
.mcard :deep(.mcard-candles:disabled) { opacity: 1; cursor: default; }

/* Back */
.mcard-back {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  padding: 1rem 1rem 0;
}
.mcard-masthead {
  margin-top: 1px;
  padding: 0.1875rem 0 0.125rem;
  border-top: 2.5px solid var(--mc-ink);
  border-bottom: 1px solid var(--mc-ink);
  box-shadow: 0 -4px 0 -3px var(--mc-ink);
}
.mcard-masthead-title {
  padding: 0.125rem 0;
  text-align: center;
  font-family: var(--font-cinzel);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.34em;
}
.mcard-masthead-underline {
  height: 0;
  margin-top: 0.125rem;
  border-top: 1px solid var(--mc-ink);
}
.mcard-lead {
  margin: 0.5625rem 0 0;
  font-size: 0.78rem;
  line-height: 1.32;
  text-align: center;
}
.mcard-lead b {
  display: block;
  margin-bottom: 0.1875rem;
  font-family: var(--font-cinzel);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.mcard-lead-line {
  display: block;
  font-style: italic;
  color: var(--mc-ink-soft);
}
.mcard-lead-line::first-letter { text-transform: uppercase; }
.mcard-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.mcard-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.625rem;
  margin-top: 0.375rem;
}
.mcard-account,
.mcard-words-text {
  font-size: 0.78rem;
  line-height: 1.36;
}
/* The card is paper with a fixed palette, but RichTextViewer paints in the theme's foreground at
   body size, and the Hall is always dark: its text came out near-white on the card. Take the
   card's own ink and size instead. */
.mcard .mcard-account :deep(.ProseMirror),
.mcard .mcard-words-text :deep(.ProseMirror) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}
.mcard-account {
  /* A short account must not leave the drop cap hanging into the lines below it. */
  display: flow-root;
  /* Ragged right: a column this narrow justified opens rivers of space between words. */
  text-align: left;
  hyphens: auto;
}
.mcard-account :deep(.ProseMirror p),
.mcard-words-text :deep(.ProseMirror p) { margin: 0 0 0.25rem; }
/* The one drop cap on the card, deliberately: the first letter of the DM's account. */
.mcard-account :deep(.ProseMirror > :first-child)::first-letter {
  float: left;
  padding: 0.1875rem 0.25rem 0 0;
  font-family: var(--font-cinzel);
  font-size: 2.125rem;
  font-weight: 700;
  line-height: 0.86;
  color: var(--mc-oxblood);
}
.mcard-pending,
.mcard-aside {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  font-style: italic;
  color: var(--mc-ink-soft);
}
.mcard-aside { margin-top: 0.1875rem; }
.mcard-words {
  position: relative;
  padding: 0.125rem 0.25rem 0 1.375rem;
}
.mcard-quote-mark {
  position: absolute;
  left: 0;
  top: -0.375rem;
  font-family: var(--font-cinzel);
  font-size: 2.125rem;
  line-height: 1;
  color: var(--mc-gilt);
}
.mcard-words-text {
  font-size: 0.875rem;
  font-style: italic;
}
.mcard-signed {
  margin-top: 0.1875rem;
  text-align: right;
}
.mcard-invite p {
  margin: 0 0 0.375rem;
  font-size: 0.81rem;
  font-style: italic;
  color: var(--mc-ink-soft);
}
.mcard-candle-row {
  display: inline-flex;
  align-items: flex-end;
  gap: 0.125rem;
  margin-right: 0.3125rem;
}
.mcard-candle-icon {
  --candle-h: 1rem;
}
</style>
