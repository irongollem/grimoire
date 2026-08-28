<template>
  <div class="space-y-3">

    <!-- About (player-authored description) -->
    <div
      v-if="isOwner || member.player_description"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <span class="text-label-lg font-semibold text-muted-foreground uppercase">About</span>
      </div>
      <div class="p-3">
        <RichTextEditor
          v-if="isOwner"
          :model-value="member.player_description ?? null"
          placeholder="Describe yourself to your party…"
          size="sm"
          @update:model-value="saveDescription"
        />
        <RichTextViewer
          v-else-if="member.player_description"
          :content="member.player_description"
        />
      </div>
    </div>

    <!-- Identity -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <span class="text-label-lg font-semibold text-muted-foreground uppercase">Identity</span>
      </div>
      <div v-if="isOwner" class="p-4 space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="field-label">Age</label>
            <input v-model="form.age" class="field-input w-full" placeholder="47…" @input="scheduleAutoSave" />
          </div>
          <div>
            <label class="field-label">Gender</label>
            <input v-model="form.gender" class="field-input w-full" @input="scheduleAutoSave" />
          </div>
          <div>
            <label class="field-label">Pronouns</label>
            <input v-model="form.pronouns" class="field-input w-full" placeholder="she/her" @input="scheduleAutoSave" />
          </div>
        </div>
        <div>
          <label class="field-label">Physical Description</label>
          <RichTextEditor
            :model-value="form.physical_description"
            size="sm"
            placeholder="Height, build, hair, eyes, distinguishing marks…"
            @update:model-value="form.physical_description = $event; scheduleAutoSave()"
          />
        </div>
      </div>
      <div v-else-if="hasIdentity" class="p-4 space-y-2.5">
        <div class="flex flex-wrap gap-1.5">
          <span v-if="member.age"      class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">Age {{ member.age }}</span>
          <span v-if="member.gender"   class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ member.gender }}</span>
          <span v-if="member.pronouns" class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ member.pronouns }}</span>
        </div>
        <RichTextViewer
          v-if="member.physical_description"
          :content="member.physical_description"
          class="text-body text-foreground"
        />
      </div>
      <div v-else class="px-4 py-3">
        <p class="text-body text-muted-foreground italic">No identity details recorded.</p>
      </div>
    </div>

    <!-- Personality -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <span class="text-label-lg font-semibold text-muted-foreground uppercase">Personality</span>
      </div>
      <div v-if="isOwner" class="p-4 space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">Alignment</label>
            <select v-model="form.alignment" class="field-input w-full" @change="scheduleAutoSave">
              <option value="">—</option>
              <option v-for="a in ALIGNMENT_OPTIONS" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
          <!-- Deity: free-text + optional campaign deity suggestions -->
          <div class="relative">
            <label class="field-label">Deity</label>
            <input
              v-model="form.deity"
              class="field-input w-full"
              placeholder="Tyr, Mielikki…"
              autocomplete="off"
              @input="form.deity_id = null; scheduleAutoSave()"
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
        <div>
          <label class="field-label">Personality Traits</label>
          <RichTextEditor
            :model-value="form.personality_traits"
            size="sm"
            placeholder="I always have a plan…"
            @update:model-value="form.personality_traits = $event; scheduleAutoSave()"
          />
        </div>
        <div>
          <label class="field-label">Ideals</label>
          <RichTextEditor
            :model-value="form.ideals"
            size="sm"
            placeholder="What drives you…"
            @update:model-value="form.ideals = $event; scheduleAutoSave()"
          />
        </div>
        <div>
          <label class="field-label">Bonds</label>
          <RichTextEditor
            :model-value="form.bonds"
            size="sm"
            placeholder="Who or what do you protect…"
            @update:model-value="form.bonds = $event; scheduleAutoSave()"
          />
        </div>
        <div>
          <label class="field-label">Flaws</label>
          <RichTextEditor
            :model-value="form.flaws"
            size="sm"
            placeholder="Your weakness or vice…"
            @update:model-value="form.flaws = $event; scheduleAutoSave()"
          />
        </div>
      </div>
      <div v-else-if="hasPersonality" class="p-4 space-y-3">
        <div v-if="member.alignment || member.deity" class="flex flex-wrap gap-1.5">
          <span v-if="member.alignment" class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ member.alignment }}</span>
          <span v-if="member.deity"     class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">✦ {{ member.deity }}</span>
        </div>
        <div v-if="member.personality_traits" class="space-y-0.5">
          <p class="text-label text-muted-foreground">TRAITS</p>
          <RichTextViewer :content="member.personality_traits" class="text-body text-foreground" />
        </div>
        <div v-if="member.ideals" class="space-y-0.5">
          <p class="text-label text-muted-foreground">IDEALS</p>
          <RichTextViewer :content="member.ideals" class="text-body text-foreground" />
        </div>
        <div v-if="member.bonds" class="space-y-0.5">
          <p class="text-label text-muted-foreground">BONDS</p>
          <RichTextViewer :content="member.bonds" class="text-body text-foreground" />
        </div>
        <div v-if="member.flaws" class="space-y-0.5">
          <p class="text-label text-muted-foreground">FLAWS</p>
          <RichTextViewer :content="member.flaws" class="text-body text-foreground" />
        </div>
      </div>
      <div v-else class="px-4 py-3">
        <p class="text-body text-muted-foreground italic">No personality details recorded.</p>
      </div>
    </div>

    <!-- Notes (plain DM/creation notes — read-only always) -->
    <div v-if="member.notes" class="rounded-lg border border-border bg-card p-4">
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mb-2">Notes</p>
      <RichTextViewer :content="member.notes" class="text-body text-foreground" />
    </div>

    <!-- Background -->
    <div v-if="background" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <span class="text-label-lg font-semibold text-muted-foreground uppercase">Background</span>
      </div>
      <div class="p-4 space-y-3">
        <!-- Name + image -->
        <div class="flex gap-3 items-start">
          <div v-if="background.image_url" class="shrink-0 h-16 w-16 rounded-md overflow-hidden bg-muted">
            <FocalImage
              :src="background.image_url"
              :alt="background.name"
              format="portrait"
              :focal-point="background.focal_point ?? null"
              class="w-full h-full"
            />
          </div>
          <div>
            <p class="font-cinzel text-sm font-bold text-foreground">{{ background.name }}</p>
            <p v-if="background.source_title || background.source" class="text-label text-muted-foreground mt-0.5">
              {{ background.source_title ?? background.source }}
            </p>
          </div>
        </div>

        <!-- Description -->
        <RichTextViewer v-if="background.description" :content="background.description" />

        <!-- Feature -->
        <div v-if="background.feature_name" class="border-t border-border pt-3 space-y-1">
          <p class="font-cinzel text-xs font-semibold text-foreground">{{ background.feature_name }}</p>
          <RichTextViewer v-if="background.feature_description" :content="background.feature_description" />
        </div>

        <!-- Proficiencies -->
        <div
          v-if="background.skill_proficiencies.length || background.tool_proficiencies.length || background.languages.length"
          class="border-t border-border pt-3 flex flex-col gap-2"
        >
          <div v-if="background.skill_proficiencies.length">
            <p class="text-eyebrow text-muted-foreground mb-1">SKILLS</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="s in background.skill_proficiencies" :key="s" class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ s }}</span>
            </div>
          </div>
          <div v-if="background.tool_proficiencies.length">
            <p class="text-eyebrow text-muted-foreground mb-1">TOOLS</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="t in background.tool_proficiencies" :key="t" class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ t }}</span>
            </div>
          </div>
          <div v-if="background.languages.length">
            <p class="text-eyebrow text-muted-foreground mb-1">LANGUAGES</p>
            <div class="flex flex-wrap gap-1">
              <template v-for="l in background.languages" :key="l">
                <RouterLink
                  v-if="isOwner && isChoicePlaceholder(l)"
                  to="/play/character/edit?tab=profs"
                  class="px-2 py-0.5 rounded bg-primary/8 border border-primary/30 border-dashed font-cinzel text-2xs text-primary/70 hover:text-primary hover:bg-primary/15 transition-colors"
                  :title="'Tap to choose a language'"
                >{{ l }}</RouterLink>
                <span v-else class="px-2 py-0.5 rounded bg-muted border border-border text-label text-foreground">{{ l }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state (non-owner only) -->
    <div
      v-if="!isOwner && !member.player_description && !hasIdentity && !hasPersonality && !member.notes && !background"
      class="rounded-lg border border-border bg-card p-6 text-center"
    >
      <p class="text-body text-muted-foreground italic">No lore recorded yet.</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from "vue";
import { RouterLink } from "vue-router";
import { useBackground } from "@/composables/rules/useBackgrounds";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useAllDeities } from "@/composables/deities/useDeities";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { PartyMember } from "@/types/party.types";

const { member, isOwner } = defineProps<{ member: PartyMember; isOwner: boolean }>();

function isChoicePlaceholder(s: string): boolean {
  return s.toLowerCase().includes("choice");
}

const ALIGNMENT_OPTIONS = [
  "Lawful Good",    "Neutral Good",    "Chaotic Good",
  "Lawful Neutral", "True Neutral",    "Chaotic Neutral",
  "Lawful Evil",    "Neutral Evil",    "Chaotic Evil",
  "Unaligned",
] as const;

const backgroundId = computed(() => member.background_id ?? "");
const { data: background } = useBackground(backgroundId);
const { mutateAsync: updateMember } = useUpdatePartyMember();

// ── About (player_description) ────────────────────────────────────────────────
let descTimer: ReturnType<typeof setTimeout> | null = null;
function saveDescription(value: string) {
  if (descTimer) clearTimeout(descTimer);
  descTimer = setTimeout(() => {
    void updateMember({ id: member.id, update: { player_description: value } });
  }, 600);
}

// ── Editable lore form (owner only) ──────────────────────────────────────────
const form = reactive({
  age:                  member.age                  ?? "",
  gender:               member.gender               ?? "",
  pronouns:             member.pronouns             ?? "",
  physical_description: member.physical_description ?? "",
  alignment:            member.alignment            ?? "",
  deity:                member.deity                ?? "",
  deity_id:             member.deity_id             ?? null as string | null,
  personality_traits:   member.personality_traits   ?? "",
  ideals:               member.ideals               ?? "",
  bonds:                member.bonds                ?? "",
  flaws:                member.flaws                ?? "",
});

watch(() => member.id, () => {
  form.age                  = member.age                  ?? "";
  form.gender               = member.gender               ?? "";
  form.pronouns             = member.pronouns             ?? "";
  form.physical_description = member.physical_description ?? "";
  form.alignment            = member.alignment            ?? "";
  form.deity                = member.deity                ?? "";
  form.deity_id             = member.deity_id             ?? null;
  form.personality_traits   = member.personality_traits   ?? "";
  form.ideals               = member.ideals               ?? "";
  form.bonds                = member.bonds                ?? "";
  form.flaws                = member.flaws                ?? "";
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void updateMember({
      id: member.id,
      update: {
        age:                  form.age || null,
        gender:               form.gender || null,
        pronouns:             form.pronouns || null,
        physical_description: form.physical_description || null,
        alignment:            form.alignment || null,
        deity:                form.deity || null,
        deity_id:             form.deity_id || null,
        personality_traits:   form.personality_traits || null,
        ideals:               form.ideals || null,
        bonds:                form.bonds || null,
        flaws:                form.flaws || null,
      },
    });
  }, 600);
}

// ── Deity suggestions ────────────────────────────────────────────────────────
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

function selectDeity(id: string, name: string) {
  form.deity    = name;
  form.deity_id = id;
  showDeityDropdown.value = false;
  scheduleAutoSave();
}

function hideDeityDropdown() {
  setTimeout(() => { showDeityDropdown.value = false; }, 150);
}

// ── Computed visibility ───────────────────────────────────────────────────────
const hasIdentity = computed(() =>
  !!(member.age || member.gender || member.pronouns || member.physical_description),
);
const hasPersonality = computed(() =>
  !!(member.alignment || member.deity || member.personality_traits || member.ideals || member.bonds || member.flaws),
);
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
