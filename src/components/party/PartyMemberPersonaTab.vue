<template>
  <div class="space-y-3">

    <!-- Alignment + Deity -->
    <div class="grid grid-cols-2 gap-3">
      <label class="block">
        <span class="field-label">Alignment</span>
        <select
          :value="form.alignment"
          class="field-input w-full"
          @change="patch({ alignment: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">—</option>
          <option v-for="a in ALIGNMENT_OPTIONS" :key="a" :value="a">{{ a }}</option>
        </select>
      </label>

      <div class="block relative">
        <span class="field-label">Deity</span>
        <input
          :value="form.deity"
          class="field-input w-full"
          placeholder="Tyr, Mielikki, none…"
          autocomplete="off"
          @input="onDeityInput"
          @focus="showDeityDropdown = true"
          @blur="hideDeityDropdown"
        />
        <ul
          v-if="showDeityDropdown && deityHints.length"
          class="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          <li
            v-for="d in deityHints"
            :key="d.id"
            class="flex items-baseline gap-1.5 px-3 py-2 text-body text-foreground hover:bg-muted cursor-pointer"
            @mousedown.prevent="selectDeity(d.id, d.name)"
          >
            <span>{{ d.name }}</span>
            <span v-if="d.titles" class="text-muted-foreground text-xs truncate">— {{ d.titles }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Age / Gender / Pronouns -->
    <div class="grid grid-cols-3 gap-2">
      <label class="block">
        <span class="field-label">Age</span>
        <input
          :value="form.age"
          class="field-input w-full"
          placeholder="47, ancient…"
          @input="patch({ age: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="block">
        <span class="field-label">Gender</span>
        <input
          :value="form.gender"
          class="field-input w-full"
          @input="patch({ gender: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="block">
        <span class="field-label">Pronouns</span>
        <input
          :value="form.pronouns"
          class="field-input w-full"
          placeholder="she/her"
          @input="patch({ pronouns: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <!-- Physical Description -->
    <label class="block">
      <span class="field-label">Physical Description</span>
      <RichTextEditor
        :model-value="form.physical_description"
        min-height="4.5rem"
        placeholder="Hair, build, scars, anything that helps the table picture them."
        @update:model-value="patch({ physical_description: $event })"
      />
    </label>

    <!-- Personality -->
    <label class="block">
      <span class="field-label">Personality Traits</span>
      <RichTextEditor
        :model-value="form.personality_traits"
        min-height="4.5rem"
        placeholder="Two short traits that shape their behaviour."
        @update:model-value="patch({ personality_traits: $event })"
      />
    </label>
    <label class="block">
      <span class="field-label">Ideals</span>
      <RichTextEditor
        :model-value="form.ideals"
        min-height="4.5rem"
        placeholder="What drives them — justice, freedom, knowledge…"
        @update:model-value="patch({ ideals: $event })"
      />
    </label>
    <label class="block">
      <span class="field-label">Bonds</span>
      <RichTextEditor
        :model-value="form.bonds"
        min-height="4.5rem"
        placeholder="People, places, or artifacts they'd die for."
        @update:model-value="patch({ bonds: $event })"
      />
    </label>
    <label class="block">
      <span class="field-label">Flaws</span>
      <RichTextEditor
        :model-value="form.flaws"
        min-height="4.5rem"
        placeholder="One clear weakness that gets them in trouble."
        @update:model-value="patch({ flaws: $event })"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useAllDeities } from "@/composables/useDeities";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { PersonaFormSlice } from "./partyMemberForm.types";

const { form } = defineProps<{ form: PersonaFormSlice }>();

const emit = defineEmits<{
  "update:form": [patch: Partial<PersonaFormSlice>];
}>();

function patch(p: Partial<PersonaFormSlice>) {
  emit("update:form", p);
}

// ── Alignment ────────────────────────────────────────────────────────────────

const ALIGNMENT_OPTIONS = [
  "Lawful Good",    "Neutral Good",    "Chaotic Good",
  "Lawful Neutral", "True Neutral",    "Chaotic Neutral",
  "Lawful Evil",    "Neutral Evil",    "Chaotic Evil",
  "Unaligned",
] as const;

// ── Deity autocomplete ───────────────────────────────────────────────────────

const { data: allDeities } = useAllDeities();
const showDeityDropdown = ref(false);

const deityHints = computed(() => {
  const list = allDeities.value ?? [];
  if (!list.length) return [];
  const q = form.deity.toLowerCase().trim();
  const filtered = q
    ? list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.alternate_names?.some((n) => n.toLowerCase().includes(q)),
      )
    : list;
  return filtered.slice(0, 8);
});

function onDeityInput(e: Event) {
  patch({ deity: (e.target as HTMLInputElement).value, deity_id: null });
}

function selectDeity(id: string, name: string) {
  patch({ deity: name, deity_id: id });
  showDeityDropdown.value = false;
}

function hideDeityDropdown() {
  setTimeout(() => { showDeityDropdown.value = false; }, 150);
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
