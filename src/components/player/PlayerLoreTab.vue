<template>
  <div class="space-y-3">

    <!-- About (player-authored description) -->
    <div
      v-if="isOwner || member.player_description"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">About</span>
      </div>
      <div class="p-3">
        <RichTextEditor
          v-if="isOwner"
          :model-value="member.player_description ?? null"
          placeholder="Describe yourself to your party…"
          min-height="80px"
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
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Identity</span>
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
          <textarea v-model="form.physical_description" rows="3" class="field-input w-full resize-y"
            placeholder="Height, build, hair, eyes, distinguishing marks…" @input="scheduleAutoSave" />
        </div>
      </div>
      <div v-else-if="hasIdentity" class="p-4 space-y-2.5">
        <div class="flex flex-wrap gap-1.5">
          <span v-if="member.age"      class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">Age {{ member.age }}</span>
          <span v-if="member.gender"   class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ member.gender }}</span>
          <span v-if="member.pronouns" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ member.pronouns }}</span>
        </div>
        <p v-if="member.physical_description" class="font-fell text-sm text-foreground whitespace-pre-wrap">
          {{ member.physical_description }}
        </p>
      </div>
      <div v-else class="px-4 py-3">
        <p class="font-fell text-sm text-muted-foreground italic">No identity details recorded.</p>
      </div>
    </div>

    <!-- Personality -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Personality</span>
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
          <div>
            <label class="field-label">Deity</label>
            <input v-model="form.deity" class="field-input w-full" placeholder="Tyr, Mielikki…" @input="scheduleAutoSave" />
          </div>
        </div>
        <div>
          <label class="field-label">Personality Traits</label>
          <textarea v-model="form.personality_traits" rows="2" class="field-input w-full resize-y"
            placeholder="I always have a plan…" @input="scheduleAutoSave" />
        </div>
        <div>
          <label class="field-label">Ideals</label>
          <textarea v-model="form.ideals" rows="2" class="field-input w-full resize-y"
            placeholder="What drives you…" @input="scheduleAutoSave" />
        </div>
        <div>
          <label class="field-label">Bonds</label>
          <textarea v-model="form.bonds" rows="2" class="field-input w-full resize-y"
            placeholder="Who or what do you protect…" @input="scheduleAutoSave" />
        </div>
        <div>
          <label class="field-label">Flaws</label>
          <textarea v-model="form.flaws" rows="2" class="field-input w-full resize-y"
            placeholder="Your weakness or vice…" @input="scheduleAutoSave" />
        </div>
      </div>
      <div v-else-if="hasPersonality" class="p-4 space-y-3">
        <div v-if="member.alignment || member.deity" class="flex flex-wrap gap-1.5">
          <span v-if="member.alignment" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ member.alignment }}</span>
          <span v-if="member.deity"     class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">✦ {{ member.deity }}</span>
        </div>
        <div v-if="member.personality_traits" class="space-y-0.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">TRAITS</p>
          <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.personality_traits }}</p>
        </div>
        <div v-if="member.ideals" class="space-y-0.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">IDEALS</p>
          <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.ideals }}</p>
        </div>
        <div v-if="member.bonds" class="space-y-0.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">BONDS</p>
          <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.bonds }}</p>
        </div>
        <div v-if="member.flaws" class="space-y-0.5">
          <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">FLAWS</p>
          <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.flaws }}</p>
        </div>
      </div>
      <div v-else class="px-4 py-3">
        <p class="font-fell text-sm text-muted-foreground italic">No personality details recorded.</p>
      </div>
    </div>

    <!-- Notes (plain DM/creation notes — read-only always) -->
    <div v-if="member.notes" class="rounded-lg border border-border bg-card p-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">Notes</p>
      <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ member.notes }}</p>
    </div>

    <!-- Background -->
    <div v-if="background" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Background</span>
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
            <p v-if="background.source_title || background.source" class="font-cinzel text-[10px] text-muted-foreground tracking-wider mt-0.5">
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
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">SKILLS</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="s in background.skill_proficiencies" :key="s" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ s }}</span>
            </div>
          </div>
          <div v-if="background.tool_proficiencies.length">
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">TOOLS</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="t in background.tool_proficiencies" :key="t" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ t }}</span>
            </div>
          </div>
          <div v-if="background.languages.length">
            <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-1">LANGUAGES</p>
            <div class="flex flex-wrap gap-1">
              <template v-for="l in background.languages" :key="l">
                <RouterLink
                  v-if="isOwner && isChoicePlaceholder(l)"
                  to="/play/character/edit?tab=profs"
                  class="px-2 py-0.5 rounded bg-primary/8 border border-primary/30 border-dashed font-cinzel text-[10px] text-primary/70 hover:text-primary hover:bg-primary/15 transition-colors"
                  :title="'Tap to choose a language'"
                >{{ l }}</RouterLink>
                <span v-else class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider">{{ l }}</span>
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
      <p class="font-fell text-sm text-muted-foreground italic">No lore recorded yet.</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { RouterLink } from "vue-router";
import { useBackground } from "@/composables/useBackgrounds";
import { useUpdatePartyMember } from "@/composables/useParty";
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
        personality_traits:   form.personality_traits || null,
        ideals:               form.ideals || null,
        bonds:                form.bonds || null,
        flaws:                form.flaws || null,
      },
    });
  }, 600);
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
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-[calc(var(--radius)-2px)] px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
