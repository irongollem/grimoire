<template>
  <div ref="rootEl" class="relative">
    <div
      class="flex flex-wrap items-center gap-1 min-h-9.5 bg-card border border-border rounded-md px-2 py-1 cursor-text"
      @click="inputRef?.focus()"
    >
      <span
        v-for="tag in model"
        :key="tag"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] text-muted-foreground tracking-wider"
      >
        {{ tag }}
        <button
          type="button"
          class="hover:text-destructive transition-colors leading-none text-sm"
          @click.stop="remove(tag)"
        >
          ×
        </button>
      </span>
      <input
        ref="inputRef"
        v-model="inputVal"
        :placeholder="model.length ? '' : placeholder"
        class="bg-transparent border-none outline-none font-fell text-sm text-foreground placeholder:text-muted-foreground/60 min-w-24 flex-1"
        @keydown.enter.prevent="addFromInput"
        @keydown.comma.prevent="addFromInput"
        @focus="onFocus"
        @blur="onBlur"
      />
    </div>

    <!-- Suggestions dropdown — teleported to body to escape overflow:hidden parents -->
    <Teleport to="body">
      <div
        v-if="open && filteredSuggestions.length"
        :style="dropdownStyle"
        class="fixed z-9999 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
      >
        <button
          v-for="s in filteredSuggestions"
          :key="s"
          type="button"
          class="w-full text-left px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted/60 transition-colors capitalize"
          @mousedown.prevent="addTag(s)"
        >
          {{ s }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from "vue";

const { placeholder = "Add tag...", suggestions = [] } = defineProps<{
  placeholder?: string;
  suggestions?: string[];
}>();

const model = defineModel<string[]>({ required: true, default: [] });

const inputVal  = ref("");
const open      = ref(false);
const inputRef  = ref<HTMLInputElement | null>(null);
const rootEl    = ref<HTMLElement | null>(null);
const dropdownStyle = ref<Record<string, string>>({});

const DROPDOWN_MAX_H = 192; // matches max-h-48

const filteredSuggestions = computed(() => {
  if (!suggestions.length) return [];
  const q = inputVal.value.toLowerCase().trim();
  return suggestions.filter(
    (s) => !model.value.includes(s) && (q === "" || s.toLowerCase().includes(q)),
  );
});

function updatePosition() {
  const el = inputRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // Use the root wrapper width so dropdown matches the full tag-input width
  const rootRect = rootEl.value?.getBoundingClientRect() ?? rect;
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUpward = spaceBelow < DROPDOWN_MAX_H && rect.top > spaceBelow;
  dropdownStyle.value = openUpward
    ? { bottom: `${window.innerHeight - rootRect.top + 4}px`, left: `${rootRect.left}px`, width: `${rootRect.width}px` }
    : { top: `${rootRect.bottom + 4}px`,                       left: `${rootRect.left}px`, width: `${rootRect.width}px` };
}

function onFocus() {
  if (!suggestions.length) return;
  open.value = true;
  nextTick(updatePosition);
}

function onBlur() {
  setTimeout(() => { open.value = false; }, 150);
}

watch(open, (val) => {
  if (val) {
    nextTick(updatePosition);
    window.addEventListener("scroll", updatePosition, true);
  } else {
    window.removeEventListener("scroll", updatePosition, true);
  }
});

onUnmounted(() => window.removeEventListener("scroll", updatePosition, true));

function addTag(tag: string) {
  const clean = tag.trim();
  if (clean && !model.value.includes(clean)) {
    model.value = [...model.value, clean];
  }
  inputVal.value = "";
}

function addFromInput() {
  const tags = inputVal.value.split(",");
  for (const tag of tags) addTag(tag);
}

function remove(tag: string) {
  model.value = model.value.filter((t) => t !== tag);
}
</script>
