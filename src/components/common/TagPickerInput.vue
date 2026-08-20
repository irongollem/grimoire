<template>
  <div class="flex flex-col gap-2">
    <!-- Selected chips — no height cap, flow naturally so nothing is hidden -->
    <div v-if="model.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="(tag, idx) in model"
        :key="tag"
        class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 font-cinzel text-2xs tracking-wide text-foreground"
      >
        {{ tag }}
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="ml-0.5 leading-none"
          @click="remove(idx)"
        >×</AppButton>
      </span>
    </div>

    <!-- IconSearch input -->
    <div class="relative">
      <IconSearch class="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      <AppInput
        ref="inputRef"
        v-model="query"
        tone="filled"
        size="body"
        :placeholder="placeholder"
        class="pl-8"
        @focus="open = true"
        @blur="onBlur"
        @keydown.enter.prevent="onEnter"
        @keydown.escape="close"
      />
    </div>

    <!-- Suggestion panel — only shown while the input is focused -->
    <div v-if="open" class="overflow-hidden rounded-md border border-border bg-card">
      <!-- Filtered results while typing -->
      <template v-if="query.trim()">
        <div class="flex max-h-52 flex-wrap gap-1 overflow-y-auto p-2">
          <AppButton
            v-for="item in filteredItems"
            :key="item"
            variant="subtle"
            tone="primary"
            surface="card"
            fill="tone"
            shape="pill"
            size="xs"
            :disabled="isSelected(item)"
            :label="item"
            @mousedown.prevent
            @click="add(item)"
          />
          <AppButton
            v-if="canAddCustom"
            variant="tinted"
            tone="primary"
            emphasis="outline"
            shape="pill"
            size="xs"
            class="border-dashed"
            @mousedown.prevent
            @click="addCustom"
          >+ Add "{{ query.trim() }}"</AppButton>
          <p v-if="filteredItems.length === 0 && !canAddCustom" class="px-1 py-1 text-caption italic text-muted-foreground">
            Already added.
          </p>
        </div>
      </template>

      <!-- Full grouped list when search is empty -->
      <template v-else>
        <div class="max-h-64 overflow-y-auto">
          <div v-for="group in groups" :key="group.name" class="p-2 pb-1">
            <p class="mb-1.5 px-0.5 text-eyebrow font-semibold text-muted-foreground">
              {{ group.name }}
            </p>
            <div class="flex flex-wrap gap-1">
              <!--
                Selected used to be a neutral `bg-muted` chip — one of the four
                rival "selected" treatments this sweep converges. It takes the
                gold `active` tint like every other selected control now; the ✓
                stays, because in a multi-select the tint alone does not say how
                many are on.
              -->
              <AppButton
                v-for="item in group.items"
                :key="item"
                variant="subtle"
                surface="card"
                size="xs"
                shape="pill"
                :active="isSelected(item)"
                @mousedown.prevent
                @click="toggle(item)"
              >
                <span v-if="isSelected(item)" class="mr-0.5 opacity-70">✓</span>{{ item }}
              </AppButton>
            </div>
          </div>
        </div>
        <div class="border-t border-border px-2 py-1.5">
          <p class="text-caption-sm italic text-muted-foreground/60">
            Type above to search or add a custom entry
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconSearch } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AppInputHandle } from "@/components/common/fieldVariants";
import type { ProficiencyGroup } from "@/lib/proficiency-lists";

const model = defineModel<string[]>({ required: true });
const { groups, placeholder = "Search…" } = defineProps<{
  groups: ProficiencyGroup[];
  placeholder?: string;
}>();

const query = ref("");
const open = ref(false);
const inputRef = ref<AppInputHandle | null>(null);

const allItems = computed(() => groups.flatMap((g) => g.items));

const filteredItems = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return allItems.value.filter((item) => item.toLowerCase().includes(q));
});

const canAddCustom = computed(() => {
  const q = query.value.trim();
  if (!q) return false;
  const already = model.value.some((v) => v.toLowerCase() === q.toLowerCase());
  const exact = allItems.value.some((v) => v.toLowerCase() === q.toLowerCase());
  return !already && !exact;
});

function isSelected(item: string) {
  return model.value.includes(item);
}

function add(item: string) {
  if (!isSelected(item)) model.value = [...model.value, item];
  query.value = "";
}

function addCustom() {
  const val = query.value.trim();
  if (val && !isSelected(val)) model.value = [...model.value, val];
  query.value = "";
}

function toggle(item: string) {
  model.value = isSelected(item)
    ? model.value.filter((v) => v !== item)
    : [...model.value, item];
}

function remove(idx: number) {
  const next = [...model.value];
  next.splice(idx, 1);
  model.value = next;
}

function onEnter() {
  if (filteredItems.value.length === 1 && !isSelected(filteredItems.value[0])) {
    add(filteredItems.value[0]);
  } else if (canAddCustom.value) {
    addCustom();
  }
}

function close() {
  query.value = "";
  open.value = false;
}

function onBlur() {
  // Delay so @mousedown.prevent on panel buttons fires before the blur closes the panel.
  // Without this, clicking a chip button would close the dropdown before the click registers.
  setTimeout(close, 150);
}
</script>
