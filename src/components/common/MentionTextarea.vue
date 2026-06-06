<template>
  <div class="relative w-full">
    <textarea
      ref="textareaRef"
      :value="model"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="['w-full', inputClass]"
      @input="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />

    <!-- Mention dropdown — teleported to body with fixed positioning so it is
         never clipped by an ancestor's overflow (e.g. the Chronicler modal). -->
    <Teleport to="body">
    <div
      v-if="dropdownVisible"
      :style="dropdownStyle"
      class="z-9999 min-w-50 max-w-75 bg-card border border-border rounded-lg shadow-lg overflow-hidden flex flex-col"
    >
      <button
        v-for="(item, idx) in filteredItems"
        :key="item.id"
        type="button"
        class="flex items-center gap-2 px-3 py-[0.45rem] font-fell text-[0.8rem] text-foreground text-left w-full bg-transparent border-none cursor-pointer transition-colors hover:bg-muted"
        :class="idx === selectedIndex ? 'bg-muted' : ''"
        @mousedown.prevent="selectItem(item)"
        @mouseenter="selectedIndex = idx"
      >
        <span
          class="font-cinzel text-[0.55rem] font-bold tracking-[0.05em] px-[0.35rem] py-[0.1rem] rounded-full border shrink-0"
          :class="BADGE_CLASSES[item.entityType]"
        >
          {{ ENTITY_LABELS[item.entityType] }}
        </span>
        {{ item.label }}
      </button>
    </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { EntityMentionItem, EntityType } from "@/lib/tiptap/EntityMention";

const ENTITY_LABELS: Record<EntityType, string> = {
  player:   "PC",
  npc:      "NPC",
  monster:  "MON",
  location: "LOC",
  party:    "PARTY",
};

const BADGE_CLASSES: Record<EntityType, string> = {
  player:   "text-blue-400 border-blue-400/40 bg-blue-400/10",
  npc:      "text-violet-400 border-violet-400/40 bg-violet-400/10",
  monster:  "text-rose-400 border-rose-400/40 bg-rose-400/10",
  location: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
  party:    "text-amber-400 border-amber-400/40 bg-amber-400/10",
};

const model = defineModel<string>({ required: true });
const {
  items = [],
  rows = 4,
  placeholder = "",
  disabled = false,
  inputClass = "field-input resize-none text-sm",
} = defineProps<{
  items?: EntityMentionItem[];
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  inputClass?: string;
}>();

const textareaRef  = ref<HTMLTextAreaElement | null>(null);
const mentionQuery = ref<string | null>(null);  // null = no active mention
const mentionStart = ref(0);                     // index of the @ char in value
const selectedIndex = ref(0);

/** Walk back from `cursor` to find an active @word; null if none. */
function getMentionAt(text: string, cursor: number): { query: string; start: number } | null {
  let i = cursor - 1;
  while (i >= 0 && text[i] !== "@" && text[i] !== " " && text[i] !== "\n") i--;
  if (i < 0 || text[i] !== "@") return null;
  // @ must be at the start or preceded by whitespace
  if (i > 0 && text[i - 1] !== " " && text[i - 1] !== "\n") return null;
  return { query: text.slice(i + 1, cursor), start: i };
}

const filteredItems = computed(() => {
  if (mentionQuery.value === null) return [];
  const q = mentionQuery.value.toLowerCase().replace(/_/g, " ");
  return items
    .filter((item) => item.label.toLowerCase().includes(q))
    .slice(0, 8);
});

const dropdownVisible = computed(
  () => mentionQuery.value !== null && filteredItems.value.length > 0,
);

// Fixed-position style for the teleported dropdown, derived from the textarea's
// viewport rect. Opens upward when there's more room above than below.
const dropdownStyle = ref<Record<string, string>>({});

function positionDropdown() {
  const ta = textareaRef.value;
  if (!ta) return;
  const rect = ta.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 260 && rect.top > spaceBelow;
  dropdownStyle.value = openUp
    ? { position: "fixed", left: `${rect.left}px`, bottom: `${window.innerHeight - rect.top + 4}px` }
    : { position: "fixed", left: `${rect.left}px`, top: `${rect.bottom + 4}px` };
}

function onInput(e: Event) {
  const ta = e.target as HTMLTextAreaElement;
  model.value = ta.value;
  const result = getMentionAt(ta.value, ta.selectionStart);
  if (result) {
    mentionQuery.value  = result.query;
    mentionStart.value  = result.start;
    selectedIndex.value = 0;
    positionDropdown();
  } else {
    mentionQuery.value = null;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!dropdownVisible.value) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % filteredItems.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length;
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    selectItem(filteredItems.value[selectedIndex.value]);
  } else if (e.key === "Escape") {
    mentionQuery.value = null;
  }
}

function onBlur() {
  // Delay so mousedown on a dropdown item fires first
  setTimeout(() => { mentionQuery.value = null; }, 150);
}

function selectItem(item: EntityMentionItem) {
  const ta = textareaRef.value;
  if (!ta) return;
  const inserted  = `@${item.label.replace(/ /g, "_")} `;
  const before    = ta.value.slice(0, mentionStart.value);
  const after     = ta.value.slice(ta.selectionStart);
  const newValue  = before + inserted + after;
  model.value = newValue;
  mentionQuery.value = null;
  // Restore focus and place cursor after the inserted text
  ta.value = newValue;
  const pos = mentionStart.value + inserted.length;
  ta.setSelectionRange(pos, pos);
  ta.focus();
}
</script>
