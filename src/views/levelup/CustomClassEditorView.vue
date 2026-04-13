<template>
  <div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <!-- Back + header -->
    <div class="flex items-center gap-3">
      <RouterLink
        to="/levelup/classes"
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >← Classes</RouterLink>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="form.class_name"
        placeholder="Class name…"
        class="flex-1 min-w-48 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="button"
        :disabled="saving || !canSave"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
    <p v-if="saveError" class="font-fell text-sm text-destructive">{{ saveError }}</p>

    <!-- ── Section 1: Identity ────────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Identity</h2>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">HIT DIE</label>
          <select
            v-model.number="form.hit_die"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option :value="6">d6</option>
            <option :value="8">d8</option>
            <option :value="10">d10</option>
            <option :value="12">d12</option>
          </select>
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">PRIMARY ABILITY</label>
          <input
            v-model="form.primary_ability"
            placeholder="e.g. Strength or Dexterity"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SUBCLASS-GRANTING LEVEL</label>
          <input
            v-model.number="form.subclass_level"
            type="number"
            min="1"
            max="20"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">CAMPAIGN SCOPE</label>
          <select
            v-model="campaignScope"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All my campaigns</option>
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- ── Section 2: Proficiencies ───────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Proficiencies</h2>

      <!-- Saving throws -->
      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-2">SAVING THROWS</label>
        <div class="flex flex-wrap gap-2">
          <label
            v-for="st in SAVE_KEYS"
            :key="st.key"
            class="flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="checkbox"
              :value="st.key"
              :checked="form.saving_throws.includes(st.key)"
              class="accent-primary"
              @change="toggleSave(st.key)"
            />
            <span class="font-cinzel text-xs text-foreground">{{ st.label }}</span>
          </label>
        </div>
      </div>

      <!-- Armor -->
      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">ARMOR PROFICIENCIES</label>
        <TagInput v-model="form.armor_proficiencies" placeholder="e.g. Light armor, Shields…" />
      </div>

      <!-- Weapons -->
      <div>
        <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">WEAPON PROFICIENCIES</label>
        <TagInput v-model="form.weapon_proficiencies" placeholder="e.g. Simple weapons, Firearms…" />
      </div>
    </section>

    <!-- ── Section 3: Features per level ─────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Features per Level</h2>
      <p class="font-fell text-sm text-muted-foreground">
        Select features from the
        <RouterLink to="/features" class="text-primary hover:underline">Abilities compendium</RouterLink>
        to grant at each level. Create custom features there first if needed.
      </p>

      <div v-if="populatedLevels.length > 0" class="space-y-3">
        <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
          <span class="font-cinzel text-xs text-primary tracking-wider w-8 pt-2 shrink-0">{{ lvl }}</span>
          <div class="flex-1 min-w-0 space-y-2">
            <div v-if="(form.features[lvl.toString()] ?? []).length > 0" class="flex flex-wrap gap-1.5">
              <span
                v-for="fid in form.features[lvl.toString()]"
                :key="fid"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary"
              >
                {{ featureNameById(fid) }}
                <button
                  type="button"
                  class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
                  @click="removeFeatureFromLevel(lvl, fid)"
                >×</button>
              </span>
            </div>
            <EntityCombobox
              model-value=""
              :options="availableFeaturesForLevel(lvl)"
              placeholder="Add feature…"
              @update:model-value="(fid) => fid && addFeatureToLevel(lvl, fid)"
            />
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <select
          v-model="addFeatureLevel"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Level…</option>
          <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
        </select>
        <button
          type="button"
          :disabled="!addFeatureLevel || populatedLevels.includes(Number(addFeatureLevel))"
          class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
          @click="addLevel"
        >
          <Plus class="h-3 w-3" />
          Add level
        </button>
      </div>
    </section>

    <!-- ── Section 4: ASI levels ──────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">ASI Levels</h2>
      <p class="font-fell text-sm text-muted-foreground">Levels at which this class gains an Ability Score Improvement.</p>

      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="lvl in form.asi_levels"
          :key="lvl"
          class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-cinzel text-xs text-primary"
        >
          {{ lvl }}
          <button
            type="button"
            class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none"
            @click="removeAsi(lvl)"
          >×</button>
        </span>
      </div>

      <div class="flex items-center gap-2">
        <select
          v-model="addAsiLevel"
          class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" disabled>Level…</option>
          <option v-for="n in 20" :key="n" :value="n" :disabled="form.asi_levels.includes(n)">{{ n }}</option>
        </select>
        <button
          type="button"
          :disabled="!addAsiLevel"
          class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
          @click="addAsi"
        >
          <Plus class="h-3 w-3" />
          Add ASI level
        </button>
      </div>
    </section>

    <!-- ── Section 5: Spellcasting ──────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Spellcasting</h2>
        <label class="flex items-center gap-2 cursor-pointer">
          <span class="font-cinzel text-xs text-muted-foreground">{{ form.isSpellcaster ? 'On' : 'Off' }}</span>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
            :class="form.isSpellcaster ? 'bg-primary' : 'bg-muted'"
            @click="form.isSpellcaster = !form.isSpellcaster"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform"
              :class="form.isSpellcaster ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
        </label>
      </div>

      <template v-if="form.isSpellcaster">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Slot recovery -->
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SLOT RECOVERY</label>
            <div class="flex gap-3">
              <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
                <input type="radio" v-model="form.slot_recovery" value="long" class="accent-primary" /> Long rest
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer font-fell text-sm text-foreground">
                <input type="radio" v-model="form.slot_recovery" value="short" class="accent-primary" /> Short rest
              </label>
            </div>
          </div>

          <!-- Spells known toggle -->
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">SPELLS KNOWN TABLE</label>
            <label class="flex items-center gap-2 cursor-pointer font-fell text-sm text-foreground">
              <input type="checkbox" v-model="hasSpellsKnown" class="accent-primary" />
              Known caster (Bard, Ranger, Sorcerer, Warlock style)
            </label>
          </div>
        </div>

        <!-- Spell slot grid: 20 rows × 9 columns -->
        <div class="overflow-x-auto">
          <table class="w-full text-center border-collapse">
            <thead>
              <tr>
                <th class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 pr-2 text-left w-8">LVL</th>
                <th v-for="sl in 9" :key="sl" class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 w-10">{{ sl }}</th>
                <th v-if="hasSpellsKnown" class="font-cinzel text-[9px] tracking-widest text-muted-foreground pb-1.5 w-12 pl-2">KNOWN</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="lvl in 20" :key="lvl" class="border-t border-border/40">
                <td class="font-cinzel text-[10px] text-primary pr-2 text-left py-0.5">{{ lvl }}</td>
                <td v-for="sl in 9" :key="sl" class="py-0.5 px-0.5">
                  <input
                    :value="(form.spell_slots[lvl - 1] ?? [])[sl - 1] ?? 0"
                    type="number"
                    min="0"
                    max="9"
                    class="w-9 bg-muted/40 border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                    @input="setSlot(lvl - 1, sl - 1, ($event.target as HTMLInputElement).valueAsNumber)"
                  />
                </td>
                <td v-if="hasSpellsKnown" class="py-0.5 pl-2">
                  <input
                    :value="(form.spells_known ?? [])[lvl - 1] ?? 0"
                    type="number"
                    min="0"
                    class="w-10 bg-muted/40 border border-border rounded px-1 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                    @input="setSpellsKnown(lvl - 1, ($event.target as HTMLInputElement).valueAsNumber)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="font-fell text-xs text-muted-foreground">
          Enter the number of spell slots per spell level (columns 1–9) at each class level (rows 1–20). Leave as 0 where none are granted.
        </p>
      </template>
    </section>

    <!-- ── Section 7: Wizard steps ────────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Wizard Steps</h2>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors"
          @click="addStep"
        >
          <Plus class="h-3 w-3" />
          Add step
        </button>
      </div>
      <p class="font-fell text-sm text-muted-foreground">
        Steps shown to the player in the level-up wizard (e.g. choose a fighting style at level 1).
      </p>

      <div v-if="form.steps.length === 0" class="font-fell text-sm text-muted-foreground italic">No steps defined.</div>

      <div v-for="(step, i) in form.steps" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
        <button type="button" class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors" @click="removeStep(i)">
          <X class="h-3.5 w-3.5" />
        </button>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LEVEL</label>
            <input v-model.number="step.level" type="number" min="1" max="20"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">TYPE</label>
            <select v-model="step.type" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="select">Pick one</option>
              <option value="append">Accumulate</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">OPTIONS FROM</label>
            <select v-model="step.step_type" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="feature_pick">Abilities compendium</option>
              <option value="spell_pick">Spellbook</option>
              <option value="text_pick">Custom text</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">KEY</label>
            <input v-model="step.key" placeholder="e.g. fighting_style"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">PICKS (count)</label>
            <input v-model.number="step.count" type="number" min="1" placeholder="1"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LABEL</label>
          <input v-model="step.label" placeholder="e.g. Choose Fighting Style"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">DESCRIPTION (optional)</label>
          <input v-model="step.description" placeholder="Optional hint shown in wizard…"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div>
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">OPTIONS</label>
          <template v-if="step.step_type === 'feature_pick'">
            <div v-if="step.options.length > 0" class="flex flex-wrap gap-1.5 mb-2">
              <span v-for="fid in step.options" :key="fid"
                class="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 font-fell text-xs text-primary">
                {{ featureNameById(fid) }}
                <button type="button" class="ml-0.5 text-primary/60 hover:text-destructive transition-colors leading-none" @click="removeOptionFromStep(i, fid)">×</button>
              </span>
            </div>
            <EntityCombobox model-value="" :options="availableOptionsForStep(i)" placeholder="Add ability option…"
              @update:model-value="(fid) => fid && addOptionToStep(i, fid)" />
          </template>
          <TagInput v-else v-model="step.options" placeholder="Add option…" />
        </div>
      </div>
    </section>

    <!-- ── Section 8: Resource pools ─────────────────────────────────────── -->
    <section class="rounded-lg border border-border bg-card p-4 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Resource Pools</h2>
        <button type="button"
          class="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 font-cinzel text-[10px] tracking-wider text-foreground hover:bg-muted/40 transition-colors"
          @click="addResource">
          <Plus class="h-3 w-3" />
          Add resource
        </button>
      </div>
      <p class="font-fell text-sm text-muted-foreground">
        Tracked pools (uses, charges, etc.) shown on the character sheet.
      </p>

      <div v-if="form.resources.length === 0" class="font-fell text-sm text-muted-foreground italic">No resource pools defined.</div>

      <div v-for="(res, i) in form.resources" :key="i" class="rounded-md border border-border p-3 space-y-3 relative">
        <button type="button" class="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors" @click="removeResource(i)">
          <X class="h-3.5 w-3.5" />
        </button>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">KEY</label>
            <input v-model="res.key" placeholder="e.g. grit_points"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">LABEL</label>
            <input v-model="res.label" placeholder="e.g. Grit Points"
              class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">RECHARGES ON</label>
            <select v-model="res.rest" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="short">Short Rest</option>
              <option value="long">Long Rest</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">SCALING</label>
            <select v-model="res.scaling" class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="fixed">Fixed value</option>
              <option value="per_level">Per class level</option>
              <option value="table">Custom table (20 values)</option>
            </select>
          </div>
        </div>

        <div v-if="res.scaling === 'fixed'">
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1">VALUE</label>
          <input v-model.number="res.fixed_value" type="number" min="0" placeholder="e.g. 1"
            class="w-full bg-muted/40 border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div v-if="res.scaling === 'table'">
          <label class="block font-cinzel text-[10px] tracking-wider text-muted-foreground mb-1.5">VALUES PER LEVEL (1–20)</label>
          <div class="grid grid-cols-5 gap-1.5">
            <div v-for="n in 20" :key="n" class="space-y-0.5">
              <span class="block font-cinzel text-[9px] text-muted-foreground text-center">{{ n }}</span>
              <input :value="(res.table_values ?? [])[n - 1] ?? ''" type="number" min="0"
                class="w-full bg-muted/40 border border-border rounded px-1.5 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                @input="setTableValue(res, n - 1, ($event.target as HTMLInputElement).valueAsNumber)" />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { Save, Trash2, Plus, X } from "lucide-vue-next";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useCustomClass, useCreateCustomClass, useUpdateCustomClass, useDeleteCustomClass } from "@/composables/useCustomClasses";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCampaigns } from "@/composables/useCampaigns";
import type { CustomStep, CustomResource, HitDie } from "@/levelup/customTypes";

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.name === "custom-class-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: existing } = useCustomClass(id);
const { data: campaignList } = useCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const { data: allFeatures } = useAllFeatures();

const { mutateAsync: create } = useCreateCustomClass();
const { mutateAsync: update } = useUpdateCustomClass();
const { mutateAsync: del } = useDeleteCustomClass();

const SAVE_KEYS = [
  { key: "Strength",     label: "STR" },
  { key: "Dexterity",   label: "DEX" },
  { key: "Constitution", label: "CON" },
  { key: "Intelligence", label: "INT" },
  { key: "Wisdom",       label: "WIS" },
  { key: "Charisma",     label: "CHA" },
] as const;

// ── Feature lookup helpers ────────────────────────────────────────────────────

function featureNameById(featureId: string): string {
  return allFeatures.value?.find(f => f.id === featureId)?.name ?? featureId;
}

const allFeatureOptions = computed(() =>
  (allFeatures.value ?? []).map(f => ({ id: f.id, name: f.name })),
);

function availableFeaturesForLevel(level: number) {
  const selected = new Set(form.value.features[level.toString()] ?? []);
  return allFeatureOptions.value.filter(f => !selected.has(f.id));
}

function availableOptionsForStep(stepIdx: number) {
  const selected = new Set(form.value.steps[stepIdx]?.options ?? []);
  return allFeatureOptions.value.filter(f => !selected.has(f.id));
}

// ── Form state ────────────────────────────────────────────────────────────────

function emptySlotGrid(): number[][] {
  return Array.from({ length: 20 }, () => Array(9).fill(0));
}

interface FormState {
  class_name: string;
  hit_die: HitDie;
  primary_ability: string;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;
  features: Record<string, string[]>;
  asi_levels: number[];
  isSpellcaster: boolean;
  spell_slots: number[][];
  spells_known: number[] | null;
  slot_recovery: "short" | "long";
  steps: CustomStep[];
  resources: CustomResource[];
}

const form = ref<FormState>({
  class_name: "",
  hit_die: 8,
  primary_ability: "",
  saving_throws: [],
  armor_proficiencies: [],
  weapon_proficiencies: [],
  subclass_level: 3,
  features: {},
  asi_levels: [4, 8, 12, 16, 19],
  isSpellcaster: false,
  spell_slots: emptySlotGrid(),
  spells_known: null,
  slot_recovery: "long",
  steps: [],
  resources: [],
});

const hasSpellsKnown = computed({
  get: () => form.value.spells_known !== null,
  set: (v) => { form.value.spells_known = v ? Array(20).fill(0) : null; },
});

const campaignScope = ref<string>("all");

watch(existing, (val) => {
  if (!val) return;
  const raw = JSON.parse(JSON.stringify(val)) as typeof val;
  // Normalise slot grid: ensure 20 rows × 9 columns even if DB had partial data
  const rawSlots = (raw.spell_slots ?? null) as number[][] | null;
  const slotGrid = rawSlots
    ? Array.from({ length: 20 }, (_, i) => {
        const row = rawSlots[i] ?? [];
        return Array.from({ length: 9 }, (_, j) => row[j] ?? 0);
      })
    : emptySlotGrid();
  form.value = {
    class_name: raw.class_name,
    hit_die: raw.hit_die as HitDie,
    primary_ability: raw.primary_ability ?? "",
    saving_throws: raw.saving_throws,
    armor_proficiencies: raw.armor_proficiencies,
    weapon_proficiencies: raw.weapon_proficiencies,
    subclass_level: raw.subclass_level,
    features: raw.features,
    asi_levels: [...raw.asi_levels].sort((a, b) => a - b),
    isSpellcaster: rawSlots !== null,
    spell_slots: slotGrid,
    spells_known: (raw.spells_known as number[] | null) ?? null,
    slot_recovery: (raw.slot_recovery as "short" | "long") ?? "long",
    steps: raw.steps.map((s) => ({ ...s, step_type: s.step_type ?? "text_pick" })),
    resources: raw.resources,
  };
  campaignScope.value = raw.campaign_id ?? "all";
}, { immediate: true });

// ── Proficiencies ─────────────────────────────────────────────────────────────

function toggleSave(key: string) {
  const idx = form.value.saving_throws.indexOf(key);
  if (idx >= 0) form.value.saving_throws.splice(idx, 1);
  else form.value.saving_throws.push(key);
}

// ── Features section ──────────────────────────────────────────────────────────

const populatedLevels = computed<number[]>(() =>
  Object.keys(form.value.features).map(Number).sort((a, b) => a - b),
);

const addFeatureLevel = ref<number | "">("");

function addFeatureToLevel(level: number, featureId: string) {
  const key = level.toString();
  const current = form.value.features[key] ?? [];
  if (!current.includes(featureId)) {
    form.value.features = { ...form.value.features, [key]: [...current, featureId] };
  }
}

function removeFeatureFromLevel(level: number, featureId: string) {
  const key = level.toString();
  const next = (form.value.features[key] ?? []).filter(id => id !== featureId);
  if (next.length === 0) {
    const copy = { ...form.value.features };
    delete copy[key];
    form.value.features = copy;
  } else {
    form.value.features = { ...form.value.features, [key]: next };
  }
}

function addLevel() {
  if (!addFeatureLevel.value) return;
  const key = addFeatureLevel.value.toString();
  if (form.value.features[key] === undefined) {
    form.value.features = { ...form.value.features, [key]: [] };
  }
  addFeatureLevel.value = "";
}

// ── ASI section ───────────────────────────────────────────────────────────────

const addAsiLevel = ref<number | "">("");

function addAsi() {
  if (!addAsiLevel.value || form.value.asi_levels.includes(Number(addAsiLevel.value))) return;
  form.value.asi_levels = [...form.value.asi_levels, Number(addAsiLevel.value)].sort((a, b) => a - b);
  addAsiLevel.value = "";
}

function removeAsi(level: number) {
  form.value.asi_levels = form.value.asi_levels.filter(l => l !== level);
}

// ── Steps section ─────────────────────────────────────────────────────────────

function addStep() {
  form.value.steps.push({ level: 1, type: "select", step_type: "text_pick", key: "", label: "", options: [] });
}

function removeStep(i: number) { form.value.steps.splice(i, 1); }

function addOptionToStep(stepIdx: number, featureId: string) {
  const step = form.value.steps[stepIdx];
  if (step && !step.options.includes(featureId)) step.options.push(featureId);
}

function removeOptionFromStep(stepIdx: number, featureId: string) {
  const step = form.value.steps[stepIdx];
  if (step) step.options = step.options.filter(id => id !== featureId);
}

// ── Spellcasting section ──────────────────────────────────────────────────

function setSlot(levelIdx: number, slotLevelIdx: number, value: number) {
  const grid = form.value.spell_slots.map(row => [...row]);
  if (!grid[levelIdx]) grid[levelIdx] = Array(9).fill(0);
  grid[levelIdx][slotLevelIdx] = isNaN(value) ? 0 : value;
  form.value.spell_slots = grid;
}

function setSpellsKnown(levelIdx: number, value: number) {
  const arr = [...(form.value.spells_known ?? Array(20).fill(0))];
  arr[levelIdx] = isNaN(value) ? 0 : value;
  form.value.spells_known = arr;
}

// ── Resources section ─────────────────────────────────────────────────────────

function addResource() {
  form.value.resources.push({ key: "", label: "", rest: "long", scaling: "fixed", fixed_value: 1 });
}

function removeResource(i: number) { form.value.resources.splice(i, 1); }

function setTableValue(res: CustomResource, idx: number, value: number) {
  const arr = [...(res.table_values ?? Array(20).fill(0))];
  arr[idx] = isNaN(value) ? 0 : value;
  res.table_values = arr;
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

const saving = ref(false);
const saveError = ref("");
const canSave = computed(() => form.value.class_name.trim() !== "");

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  saveError.value = "";
  const payload = {
    class_name: form.value.class_name.trim(),
    hit_die: form.value.hit_die,
    primary_ability: form.value.primary_ability.trim() || null,
    saving_throws: form.value.saving_throws,
    armor_proficiencies: form.value.armor_proficiencies,
    weapon_proficiencies: form.value.weapon_proficiencies,
    subclass_level: form.value.subclass_level,
    features: form.value.features,
    asi_levels: form.value.asi_levels,
    spell_slots: form.value.isSpellcaster ? form.value.spell_slots : null,
    spells_known: form.value.isSpellcaster ? (form.value.spells_known ?? null) : null,
    slot_recovery: form.value.isSpellcaster ? form.value.slot_recovery : "long",
    steps: form.value.steps,
    resources: form.value.resources,
    campaign_id: campaignScope.value === "all" ? null : campaignScope.value,
  };
  try {
    if (isNew.value) {
      await create(payload);
    } else {
      await update({ id: id.value, update: payload });
    }
    void router.push("/levelup/classes");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirm(`Delete "${form.value.class_name}"? This cannot be undone.`)) return;
  try {
    await del(id.value);
    void router.push("/levelup/classes");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete.";
  }
}
</script>
