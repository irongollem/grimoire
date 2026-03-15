<template>
  <!-- Floating toggle button -->
  <div class="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">

    <!-- Chat panel -->
    <Transition name="chat-panel">
      <div
        v-if="open"
        class="w-80 sm:w-96 flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        style="height: 460px"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 shrink-0">
          <div class="flex items-center gap-2">
            <MessageCircle class="h-4 w-4 text-primary" />
            <span class="font-cinzel text-xs font-semibold text-foreground tracking-wider">Campaign Chat</span>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors" @click="open = false">
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Message list -->
        <div ref="scrollEl" class="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          <div v-if="loading" class="text-center py-4">
            <LoadingSpinner />
          </div>
          <div v-else-if="!messages.length" class="text-center py-8">
            <p class="font-fell text-xs text-muted-foreground italic">No messages yet. Say hello!</p>
          </div>
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex gap-2"
              :class="msg.user_id === myUserId ? 'flex-row-reverse' : 'flex-row'"
            >
              <!-- Roll message -->
              <template v-if="msg.type === 'roll'">
                <div
                  class="max-w-[85%] rounded-lg px-3 py-2 text-center"
                  :class="msg.user_id === myUserId
                    ? 'bg-primary/15 border border-primary/20'
                    : 'bg-muted/60 border border-border'"
                >
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5">
                    {{ msg.user_id === myUserId ? 'You' : msg.sender_name }} rolled
                  </p>
                  <p
                    class="font-cinzel text-2xl font-bold"
                    :class="msg.metadata?.isCrit ? 'text-amber-400' : msg.metadata?.isFumble ? 'text-destructive' : 'text-foreground'"
                  >
                    {{ msg.metadata?.total ?? '?' }}
                  </p>
                  <p class="font-fell text-xs text-muted-foreground">{{ msg.metadata?.label }}</p>
                  <!-- Breakdown -->
                  <div v-if="msg.metadata?.breakdown?.length" class="flex flex-wrap justify-center gap-1 mt-1">
                    <span
                      v-for="(d, i) in msg.metadata.breakdown"
                      :key="i"
                      class="font-cinzel text-[10px] px-1 rounded"
                      :class="d.dropped ? 'line-through text-muted-foreground/40 bg-transparent' : 'bg-muted text-foreground'"
                    >{{ d.val }}</span>
                    <span v-if="msg.metadata.modifier !== 0" class="font-cinzel text-[10px] text-primary">
                      {{ msg.metadata.modifier > 0 ? `+${msg.metadata.modifier}` : msg.metadata.modifier }}
                    </span>
                  </div>
                  <p
                    v-if="msg.metadata?.isCrit"
                    class="font-cinzel text-[10px] text-amber-400 tracking-wider mt-0.5"
                  >CRITICAL!</p>
                  <p
                    v-else-if="msg.metadata?.isFumble"
                    class="font-cinzel text-[10px] text-destructive tracking-wider mt-0.5"
                  >FUMBLE</p>
                  <p class="font-fell text-[10px] text-muted-foreground/50 mt-1">{{ timeLabel(msg.created_at) }}</p>
                </div>
              </template>

              <!-- Chat message -->
              <template v-else>
                <div
                  class="max-w-[80%] rounded-lg px-3 py-2"
                  :class="msg.user_id === myUserId
                    ? 'bg-primary/15 border border-primary/20'
                    : 'bg-muted/60 border border-border'"
                >
                  <p
                    v-if="msg.user_id !== myUserId"
                    class="font-cinzel text-[10px] font-semibold tracking-wider mb-0.5"
                    :class="msg.user_id !== myUserId ? 'text-primary' : 'text-muted-foreground'"
                  >{{ msg.sender_name }}</p>
                  <p class="font-fell text-sm text-foreground leading-snug">{{ msg.message }}</p>
                  <p class="font-fell text-[10px] text-muted-foreground/50 mt-0.5 text-right">{{ timeLabel(msg.created_at) }}</p>
                </div>
              </template>
            </div>
          </template>
        </div>

        <!-- Dice panel (shown above input when open) -->
        <Transition name="dice-expand">
          <div v-if="diceOpen" class="shrink-0 border-t border-border bg-muted/20 px-3 py-2">
            <!-- Quick dice buttons -->
            <div class="flex flex-wrap gap-1 mb-2">
              <button
                v-for="d in ALL_DICE"
                :key="d"
                type="button"
                class="h-7 w-9 rounded border font-cinzel text-[10px] font-bold transition-colors"
                :class="(diceCounts[d] ?? 0) > 0
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'"
                @click="toggleDie(d)"
              >
                d{{ d }}
              </button>
            </div>
            <!-- Count row for active dice -->
            <div v-if="totalDice > 0" class="flex flex-wrap gap-2 mb-2">
              <div v-for="d in ALL_DICE" :key="d" class="flex items-center gap-1">
                <template v-if="(diceCounts[d] ?? 0) > 0">
                  <span class="font-cinzel text-[10px] text-muted-foreground">d{{ d }}:</span>
                  <button type="button" class="count-btn" @click="decrement(d)">−</button>
                  <span class="font-cinzel text-xs font-bold text-foreground w-4 text-center">{{ diceCounts[d] }}</span>
                  <button type="button" class="count-btn" @click="increment(d)">+</button>
                </template>
              </div>
            </div>
            <!-- Modifier + mode -->
            <div class="flex items-center gap-2 mb-2">
              <span class="font-cinzel text-[10px] text-muted-foreground">Mod:</span>
              <button type="button" class="count-btn" @click="diceModifier--">−</button>
              <input
                v-model.number="diceModifier"
                type="number"
                class="w-10 text-center bg-background border border-border rounded px-1 py-0.5 font-cinzel text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="button" class="count-btn" @click="diceModifier++">+</button>
              <div class="flex rounded border border-border overflow-hidden ml-auto">
                <button
                  v-for="m in MODES"
                  :key="m.value"
                  type="button"
                  class="px-2 py-0.5 font-cinzel text-[9px] font-bold tracking-wider transition-colors"
                  :class="diceMode === m.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                  @click="diceMode = m.value"
                >{{ m.label }}</button>
              </div>
            </div>
            <!-- Roll + post button -->
            <button
              type="button"
              :disabled="totalDice === 0"
              class="w-full py-1.5 font-cinzel text-xs font-bold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
              @click="rollAndPost"
            >
              🎲 Roll &amp; Post to Chat
            </button>
          </div>
        </Transition>

        <!-- Input bar -->
        <div class="shrink-0 border-t border-border bg-card px-2 py-2 flex items-end gap-1.5">
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors shrink-0"
            :class="diceOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
            title="Dice roller"
            @click="diceOpen = !diceOpen"
          >
            <Dices class="h-4 w-4" />
          </button>
          <textarea
            ref="inputEl"
            v-model="inputText"
            rows="1"
            placeholder="Type a message…"
            class="flex-1 resize-none bg-muted/40 border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring leading-snug"
            style="max-height: 80px"
            @keydown.enter.exact.prevent="send"
            @keydown.shift.enter="() => {}"
            @input="autoResize"
          />
          <button
            type="button"
            :disabled="!inputText.trim()"
            class="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
            @click="send"
          >
            <Send class="h-4 w-4" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- Toggle button -->
    <button
      type="button"
      class="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center relative"
      :title="open ? 'Close chat' : 'Open chat'"
      @click="toggleChat"
    >
      <MessageCircle class="h-5 w-5" />
      <!-- Unread badge -->
      <span
        v-if="unread > 0 && !open"
        class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground font-cinzel text-[10px] font-bold flex items-center justify-center"
      >{{ unread > 9 ? '9+' : unread }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import { MessageCircle, X, Send, Dices } from "lucide-vue-next";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { rollDice, ALL_DICE } from "@/lib/dice";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { DieSize, RollMode } from "@/lib/dice";

const { messages, loading, sendMessage, sendRoll, myUserId } = useCampaignMessages();

// ── Panel state ────────────────────────────────────────────────────────────────
const open     = ref(false);
const unread   = ref(0);
const scrollEl = ref<HTMLElement | null>(null);
const inputEl  = ref<HTMLTextAreaElement | null>(null);

watch(messages, async (msgs, prev) => {
  if (!open.value && msgs.length > (prev?.length ?? 0)) {
    const newest = msgs[msgs.length - 1];
    if (newest?.user_id !== myUserId.value) unread.value++;
  }
  await nextTick();
  scrollEl.value?.scrollTo({ top: scrollEl.value.scrollHeight, behavior: "smooth" });
});

function toggleChat() {
  open.value = !open.value;
  if (open.value) {
    unread.value = 0;
    nextTick(() => {
      scrollEl.value?.scrollTo({ top: scrollEl.value.scrollHeight });
      inputEl.value?.focus();
    });
  }
}

// ── Chat input ─────────────────────────────────────────────────────────────────
const inputText = ref("");

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 80) + "px";
}

async function send() {
  if (!inputText.value.trim()) return;
  await sendMessage(inputText.value);
  inputText.value = "";
  if (inputEl.value) { inputEl.value.style.height = "auto"; }
}

// ── Dice roller ────────────────────────────────────────────────────────────────
const diceOpen = ref(false);
const diceCounts = reactive<Partial<Record<DieSize, number>>>({});
const diceModifier = ref(0);
const diceMode = ref<RollMode>("normal");

const MODES: { value: RollMode; label: string }[] = [
  { value: "disadvantage", label: "DIS" },
  { value: "normal",       label: "NRM" },
  { value: "advantage",    label: "ADV" },
];

const totalDice = computed(() =>
  ALL_DICE.reduce((s, d) => s + (diceCounts[d] ?? 0), 0),
);

function toggleDie(d: DieSize) {
  diceCounts[d] = (diceCounts[d] ?? 0) > 0 ? 0 : 1;
}
function increment(d: DieSize) { diceCounts[d] = Math.min((diceCounts[d] ?? 0) + 1, 9); }
function decrement(d: DieSize) { diceCounts[d] = Math.max((diceCounts[d] ?? 0) - 1, 0); }

async function rollAndPost() {
  if (totalDice.value === 0) return;
  const result = rollDice(diceCounts, diceModifier.value, diceMode.value);
  await sendRoll(result);
}

// ── Time formatting ────────────────────────────────────────────────────────────
function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.count-btn {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
}

.chat-panel-enter-active,
.chat-panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.chat-panel-enter-from,
.chat-panel-leave-to {
  transform: translateY(12px) scale(0.97);
  opacity: 0;
}

.dice-expand-enter-active,
.dice-expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.15s ease;
  overflow: hidden;
  max-height: 200px;
}
.dice-expand-enter-from,
.dice-expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
