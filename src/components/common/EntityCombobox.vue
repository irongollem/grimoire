<template>
  <div class="relative flex-1" ref="rootEl">
    <div class="relative">
      <input
        v-no-pwm
        ref="inputEl"
        v-model="query"
        type="text"
        :placeholder="selectedLabel || placeholder"
        class="w-full bg-card border border-border rounded-md px-3 py-1.5 pr-14 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        :class="selectedLabel && !query ? 'placeholder:text-foreground' : ''"
        @focus="onFocus"
        @input="open = true"
        @blur="onBlur"
        @keydown.escape="close"
        @keydown.enter.prevent="selectFirst"
        @keydown.arrow-down.prevent="open = true"
      />
      <button
        v-if="modelValue"
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
        class="fixed z-9999 max-h-52 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
      >
        <li
          v-for="opt in filtered"
          :key="opt.id"
          class="px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex items-center gap-2"
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
        <span class="font-fell text-xs text-muted-foreground italic">No matches</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string; name: string }">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { IconChevronDown } from '@/lib/icons';

const { modelValue, options, placeholder = "Search…" } = defineProps<{
  modelValue: string;
  options: T[];
  placeholder?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const inputEl = ref<HTMLInputElement | null>(null);
const query   = ref("");
const open    = ref(false);
const dropdownStyle = ref<Record<string, string>>({});

const selectedLabel = computed(() =>
  modelValue ? (options.find(o => o.id === modelValue)?.name ?? "") : ""
);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return options.slice(0, 50);
  return options.filter(o => o.name.toLowerCase().includes(q)).slice(0, 50);
});

const DROPDOWN_MAX_H = 212; // matches max-h-52

function updatePosition() {
  const el = inputEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < DROPDOWN_MAX_H && rect.top > spaceBelow;
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
  emit("update:modelValue", opt.id);
  query.value = "";
  open.value  = false;
}

function selectFirst() {
  if (filtered.value.length) select(filtered.value[0]);
}

function clear() {
  emit("update:modelValue", "");
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

watch(() => modelValue, (val) => {
  if (!val) query.value = "";
});
</script>
