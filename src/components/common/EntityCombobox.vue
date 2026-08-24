<template>
  <div class="relative min-w-0 flex-1" ref="rootEl">
    <div class="relative">
      <input
        v-no-pwm
        ref="inputEl"
        v-model="query"
        type="text"
        :placeholder="selectedLabel || placeholder"
        :class="cn(
          fieldVariants({ tone: 'card', size: 'body', control: 'input' }),
          // pr-14 clears the overlaid clear button and chevron; w-full is the
          // caller's layout. Everything else is the shared field recipe.
          'w-full pr-14',
          selectedLabel && !query ? 'placeholder:text-foreground' : '',
        )"
        @focus="onFocus"
        @click="onFocus"
        @input="open = true"
        @blur="onBlur"
        @keydown.escape="close"
        @keydown.enter.prevent="selectFirst"
        @keydown.arrow-down.prevent="open = true"
      />
      <button
        v-if="selectedId"
        type="button"
        class="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-base leading-none px-0.5"
        @mousedown.prevent="clear"
      >×</button>
      <IconChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    </div>

    <Teleport to="body">
      <ul
        v-if="open && filtered.length"
        :style="dropdownStyle"
        :class="[
          'fixed z-9999 overflow-y-auto rounded-md border border-border bg-card shadow-lg',
          DROPDOWN_HEIGHTS[dropdownHeight].class,
        ]"
      >
        <li
          v-for="opt in filtered"
          :key="opt.id"
          class="px-3 py-1.5 text-body text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex items-center gap-2"
          @mousedown.prevent="select(opt)"
        >
          <slot name="option" :opt="opt">{{ opt.name }}</slot>
        </li>
      </ul>
      <div
        v-else-if="open && query && !filtered.length"
        :style="dropdownStyle"
        class="fixed z-9999 rounded-md border border-border bg-card shadow-lg px-3 py-2"
      >
        <span class="text-caption text-muted-foreground italic">No matches</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string; name: string }">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { cn } from "@/lib/utils";
import { fieldVariants } from "./fieldVariants";
import { IconChevronDown } from '@/lib/icons';

const selectedId = defineModel<string>({ required: true });
const { options, placeholder = "Search…", dropdownHeight = "sm" } = defineProps<{
  options: T[];
  placeholder?: string;
  /**
   * How tall the dropdown may grow.
   *
   * `sm` (the default, and what every existing call site gets) suits picking a
   * thing you can already name — an NPC, an item — where you type three
   * letters and hit it. `lg` is for the case where the reader does not know
   * what is in the list and is *browsing*: the dashboard shelf offers 20-odd
   * widgets whose options are three lines each, and at `sm` you can see two of
   * them at a time.
   */
  dropdownHeight?: keyof typeof DROPDOWN_HEIGHTS;
}>();

/**
 * The class and the pixel figure must agree: `updatePosition` compares the
 * space below the input against this number to decide whether to open upward,
 * and a dropdown that is taller than the number thinks it fits when it does
 * not. They live in one map so they cannot drift — which they could when the
 * height was a bare class and a bare `const` twenty lines apart.
 */
const DROPDOWN_HEIGHTS = {
  sm: { class: "max-h-52", px: 212 },
  lg: { class: "max-h-96", px: 396 },
} as const;

const inputEl = ref<HTMLInputElement | null>(null);
const query   = ref("");
const open    = ref(false);
const dropdownStyle = ref<Record<string, string>>({});

const selectedLabel = computed(() =>
  selectedId.value ? (options.find(o => o.id === selectedId.value)?.name ?? "") : ""
);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return options.slice(0, 50);
  return options.filter(o => o.name.toLowerCase().includes(q)).slice(0, 50);
});



function updatePosition() {
  const el = inputEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const maxHeight = DROPDOWN_HEIGHTS[dropdownHeight].px;
  const openUpward = spaceBelow < maxHeight && rect.top > spaceBelow;
  dropdownStyle.value = openUpward
    ? { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${rect.left}px`, width: `${rect.width}px` }
    : { top: `${rect.bottom + 4}px`,                      left: `${rect.left}px`, width: `${rect.width}px` };
}

function onFocus() {
  open.value = true;
  nextTick(updatePosition);
}

onUnmounted(() => window.removeEventListener("scroll", updatePosition, true));

function select(opt: T) {
  selectedId.value = opt.id;
  query.value = "";
  open.value  = false;
}

function selectFirst() {
  if (filtered.value.length) select(filtered.value[0]);
}

function clear() {
  selectedId.value = "";
  query.value = "";
}

function close() {
  open.value  = false;
  query.value = "";
}

// Use blur + timeout — lets mousedown on dropdown items fire first
function onBlur() {
  setTimeout(close, 150);
}

watch(open, (val) => {
  if (val) {
    nextTick(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
  } else {
    window.removeEventListener("scroll", updatePosition, true);
  }
});

watch(selectedId, (val) => {
  if (!val) query.value = "";
});
</script>
