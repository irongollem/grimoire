<template>
  <!-- ── Advisor Modal (new spells wizard) ──────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="advisor-modal">
      <div
        v-if="advisorModalOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @keydown.esc="skipAdvisorModal"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70" @click="skipAdvisorModal" />

        <!-- Card -->
        <div
          class="relative z-10 w-full max-w-lg rounded-xl border border-primary/40 bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-border shrink-0"
          >
            <h2
              class="font-cinzel text-sm font-bold tracking-wider text-foreground flex items-center gap-2"
            >
              <IconTip class="h-4 w-4 text-primary" />
              Spell Level Advisor
            </h2>
            <button
              type="button"
              class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wider transition-colors"
              @click="skipAdvisorModal"
            >
              Skip →
            </button>
          </div>

          <div class="overflow-y-auto px-6 py-4 flex flex-col gap-4">
            <p class="font-fell text-sm text-muted-foreground italic">
              Answer a few questions to pre-fill your spell's mechanics and suggest a balanced
              level.
            </p>

            <!-- 1. School → immediately shows design notes -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >School of Magic</span
              >
              <select
                v-model="school"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">
                  {{ s }}
                </option>
              </select>
            </label>

            <!-- 2. School design notes (reactive to school above) -->
            <div
              v-if="schoolTip"
              class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
            >
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >{{ schoolTip.title }} design notes</span
              >
              <ul class="space-y-1">
                <li
                  v-for="(tip, i) in schoolTip.tips"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex gap-1.5"
                >
                  <span class="text-primary/60 shrink-0">·</span>{{ tip }}
                </li>
              </ul>
            </div>

            <!-- 3. Effect type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Main Effect</span
              >
              <select
                v-model="adv.effectType"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="damage">Damage</option>
                <option value="healing">Healing / Restoration</option>
                <option value="control">Control (restrain, slow, etc.)</option>
                <option value="buff">Buff / Enhancement</option>
                <option value="utility">Utility / Exploration</option>
              </select>
            </label>

            <!-- 4. Intensity (control / buff / utility only) -->
            <label
              v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Effect Intensity</span
              >
              <select
                v-model="adv.effectIntensity"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <template v-if="adv.effectType === 'control'">
                  <option value="weak">Weak — disadvantage, minor debuff (e.g. Bane)</option>
                  <option value="moderate">
                    Moderate — restrained, frightened, slow (e.g. Hold Person)
                  </option>
                  <option value="major">
                    Major — stunned, incapacitated, banished (e.g. Hold Monster)
                  </option>
                  <option value="extreme">
                    Extreme — dominated, paralysed, power word (e.g. Dominate Person)
                  </option>
                </template>
                <template v-else-if="adv.effectType === 'buff'">
                  <option value="weak">Weak — minor bonus, +d4 (e.g. Guidance)</option>
                  <option value="moderate">
                    Moderate — advantage, resistance (e.g. Bless, Shield)
                  </option>
                  <option value="major">
                    Major — extra attack, flight, haste (e.g. Haste, Fly)
                  </option>
                  <option value="extreme">Extreme — extra action, immunity, resurrection</option>
                </template>
                <template v-else>
                  <option value="weak">
                    Minor — convenience, limited info (e.g. Prestidigitation)
                  </option>
                  <option value="moderate">
                    Moderate — solves a problem category (e.g. Darkvision)
                  </option>
                  <option value="major">Major — teleportation, legend lore (e.g. Teleport)</option>
                  <option value="extreme">World-altering — Wish, Gate level</option>
                </template>
              </select>
            </label>

            <!-- 5. Damage / healing dice -->
            <label
              v-if="adv.effectType === 'damage' || adv.effectType === 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">
                {{ adv.effectType === "damage" ? "Damage Dice" : "Healing Dice" }}
              </span>
              <DiceInput
                v-model="adv.damageDice"
                placeholder="e.g. 8d6 · 2d6 fire + 1d6 force · 3d8 + 5"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
              />
              <span v-if="adv.damageDice" class="font-fell text-[11px] text-muted-foreground">
                Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
              </span>
            </label>

            <!-- 6. Targeting -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Targeting</span
              >
              <select
                v-model="adv.targetingMode"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="self">Self only</option>
                <option value="single">Single target</option>
                <option value="multi_2">Up to 2 creatures</option>
                <option value="multi_3">Up to 3 creatures</option>
                <option value="multi_4_5">Up to 4–5 creatures</option>
                <option value="aoe_small">Small AoE (≤15 ft cone / ≤30 ft line)</option>
                <option value="aoe_medium">Medium AoE (20 ft radius / 60 ft line)</option>
                <option value="aoe_large">Large AoE (30+ ft radius)</option>
              </select>
            </label>

            <!-- 7. IconSave type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Targeting / IconSave</span
              >
              <select
                v-model="adv.saveType"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="save_for_half">Saving throw — half on save</option>
                <option value="save_negates">Saving throw — negates on save</option>
                <option value="attack_roll">Attack roll (can miss)</option>
                <option value="automatic">Automatic — no save or attack</option>
              </select>
            </label>

            <!-- 8. Duration -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Duration Tier</span
              >
              <select
                v-model="adv.durationTier"
                class="bg-muted border border-border rounded px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="instantaneous">Instantaneous</option>
                <option value="conc_1min">Concentration, ≤1 minute</option>
                <option value="conc_10min">Concentration, ≤10 minutes</option>
                <option value="conc_1hour">Concentration, ≤1 hour</option>
                <option value="sustained_1min">1 minute (no concentration)</option>
                <option value="sustained_long">8+ hours (no concentration)</option>
              </select>
            </label>

            <!-- 9. Flags -->
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.requiresConcentration" class="rounded" />
                <span class="font-fell text-sm text-foreground">Requires Concentration</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.hasSecondaryEffect" class="rounded" />
                <span class="font-fell text-sm text-foreground"
                  >Secondary condition / rider effect</span
                >
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.isRitual" class="rounded" />
                <span class="font-fell text-sm text-foreground">Can be cast as Ritual</span>
              </label>
            </div>

            <!-- 10. Result -->
            <div class="rounded-md bg-primary/10 border border-primary/30 p-4 flex flex-col gap-3">
              <p class="font-cinzel text-sm font-bold text-primary">
                Suggested: Level {{ advResult.suggestedMin }}–{{ advResult.suggestedMax }}
              </p>
              <ul class="space-y-0.5">
                <li
                  v-for="(f, i) in advResult.factors"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex gap-1.5"
                >
                  <span class="text-primary shrink-0">·</span>{{ f }}
                </li>
              </ul>
              <!-- Reference spells for non-damage types -->
              <template
                v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing' && refSpells"
              >
                <div class="border-t border-primary/20 pt-2 flex flex-col gap-1">
                  <span
                    class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                    >Reference spells at this level</span
                  >
                  <p
                    v-if="refSpells.control && adv.effectType === 'control'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    Control: {{ refSpells.control }}
                  </p>
                  <p
                    v-if="refSpells.buff && adv.effectType === 'buff'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    Buff: {{ refSpells.buff }}
                  </p>
                  <p
                    v-if="refSpells.utility && adv.effectType === 'utility'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    Utility: {{ refSpells.utility }}
                  </p>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer actions -->
          <div
            class="flex items-center justify-between gap-3 px-6 py-4 border-t border-border shrink-0"
          >
            <button
              type="button"
              class="font-cinzel text-xs text-muted-foreground hover:text-foreground tracking-wider transition-colors"
              @click="skipAdvisorModal"
            >
              Skip, I'll fill it in manually
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
              @click="applyAdvisorFromModal"
            >
              Apply to Spell (Level
              {{
                advResult.suggestedMin +
                Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2)
              }}) →
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <div class="flex flex-col gap-6">
    <!-- ── Header actions ─────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <RouterLink
        to="/spells"
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >
        ← Spellbook
      </RouterLink>
      <div class="flex items-center gap-2">
        <button
          v-if="isAiEnabled"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 font-cinzel text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          @click="showGenerateDialog = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate
        </button>
        <button
          v-if="spell"
          type="button"
          :disabled="isSendingToScriptorium"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="sendToScriptorium"
        >
          <IconScrollText class="h-3.5 w-3.5" />
          {{ isSendingToScriptorium ? "Sending…" : "Send to Scriptorium" }}
        </button>
        <template v-if="!isSrd">
          <button
            v-if="spell"
            type="button"
            :disabled="isDeleting"
            class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
            @click="confirmDelete"
          >
            <IconDelete class="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            type="button"
            :disabled="isSaving || !name.trim()"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="save"
          >
            <IconSave class="h-3.5 w-3.5" />
            {{ isSaving ? "Saving…" : spell ? "IconSave" : "Create" }}
          </button>
        </template>
        <span v-else class="font-fell text-xs text-muted-foreground italic">SRD spell — art only</span>
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <div class="grid grid-cols-1 xl:grid-cols-[220px_1fr_260px] gap-6">
      <!-- ── Portrait + Source ─────────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <ImageUpload
          :model-value="imageUrl || null"
          show-focal-point
          :focal-point="imageFocalPoint"
          @update:model-value="onImageUrlUpdate($event)"
          @update:focal-point="onImageFocalUpdate($event)"
        />
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Source</span>
          <div
            v-if="props.spell?.open5e_import"
            class="bg-muted/30 border border-border rounded-md px-3 py-2 font-fell text-sm text-muted-foreground italic"
          >
            <a
              v-if="props.spell.source_url"
              :href="props.spell.source_url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground hover:underline transition-colors"
            >{{ spellSourceLabel(source, props.spell.source_title) }}</a>
            <span v-else>{{ spellSourceLabel(source, props.spell.source_title) }}</span>
          </div>
          <input
            v-else
            v-model="source"
            placeholder="e.g. Homebrew, PHB, XGtE…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <!-- ── Core spell fields ──────────────────────────────────────────── -->
      <div v-if="!isSrd" class="flex flex-col gap-4">
        <!-- Name -->
        <label>
          <span class="sr-only">Spell name</span>
          <input
            v-model="name"
            placeholder="Spell name…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <!-- Level + School row -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
              >Level</span
            >
            <select
              v-model.number="level"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option :value="0">Cantrip (0)</option>
              <option v-for="n in 9" :key="n" :value="n">{{ n }}{{ levelSuffix(n) }}-Level</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
              >School</span
            >
            <select
              v-model="school"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
            >
              <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">
                {{ s }}
              </option>
            </select>
          </label>
        </div>

        <!-- Casting Time + Range -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
              >Casting Time</span
            >
            <select
              v-model="castingTime"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="o in CASTING_TIME_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <input
              v-if="castingTime === 'Special'"
              v-model="castingTimeCustom"
              placeholder="Describe casting time…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              v-if="castingTime === 'Reaction'"
              v-model="castingTimeCustom"
              placeholder="Reaction to what? (optional)"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
              >Range</span
            >
            <select
              v-model="range"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="o in RANGE_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <input
              v-if="range === 'Special'"
              v-model="rangeCustom"
              placeholder="Describe range…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Duration + flags -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
              >Duration</span
            >
            <select
              v-model="duration"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @change="onDurationChange"
            >
              <option v-for="o in DURATION_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <input
              v-if="duration === 'Special'"
              v-model="durationCustom"
              placeholder="Describe duration…"
              class="mt-1 bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="flex flex-col gap-3 justify-end pb-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="concentration" class="rounded" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
                >CONCENTRATION</span
              >
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="ritual" class="rounded" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
                >RITUAL</span
              >
            </label>
          </div>
        </div>

        <!-- Components -->
        <div class="flex flex-col gap-2">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
            >Components</span
          >
          <div class="flex items-center gap-4">
            <label
              v-for="c in SPELL_COMPONENTS"
              :key="c"
              class="flex items-center gap-1.5 cursor-pointer"
            >
              <input type="checkbox" :value="c" v-model="components" class="rounded" />
              <span class="font-cinzel text-sm font-semibold text-foreground">{{ c }}</span>
            </label>
          </div>
          <input
            v-if="components.includes('M')"
            v-model="material"
            placeholder="Material component (e.g. a pinch of sulfur and powdered iron)…"
            class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Mechanics -->
        <div class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <h3
            class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Mechanics
          </h3>

          <!-- Attack / targeting type -->
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Attack / Targeting</span
              >
              <select
                v-model="attackType"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— none selected —</option>
                <option v-for="o in ATTACK_TYPES" :key="o.value" :value="o.value">
                  {{ o.label }}
                </option>
              </select>
            </label>

            <!-- IconSave attribute + effect (only for saving throw) -->
            <template v-if="attackType === 'save'">
              <label class="flex flex-col gap-1">
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                  >IconSave Attribute</span
                >
                <select
                  v-model="saveAttribute"
                  class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">—</option>
                  <option v-for="a in SAVE_ATTRIBUTES" :key="a" :value="a">{{ a }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 col-span-2">
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                  >Effect on Successful IconSave</span
                >
                <select
                  v-model="saveEffect"
                  class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">—</option>
                  <option v-for="o in SAVE_EFFECTS" :key="o.value" :value="o.value">
                    {{ o.label }}
                  </option>
                </select>
              </label>
            </template>
          </div>

          <!-- Damage rolls -->
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
              >Damage</span
            >
            <DamageRollsInput v-model="damageRolls" :school="school" />
          </div>

          <!-- Healing -->
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
              >Healing Dice
              <span class="normal-case font-fell font-normal">(if applicable)</span></span
            >
            <input
              v-model="healingDice"
              placeholder="e.g. 1d8, 2d6+mod"
              class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <!-- Target description -->
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
              >Target Description
              <span class="normal-case font-fell font-normal">(what does it hit?)</span></span
            >
            <input
              v-model="targetDescription"
              placeholder="e.g. one creature you can see within range, up to three willing creatures…"
              class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <!-- AoE (only needed for area spells) -->
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >AoE Shape
                <span class="normal-case font-fell font-normal">(if applicable)</span></span
              >
              <select
                v-model="aoeShape"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                <option value="">—</option>
                <option v-for="s in AOE_SHAPES" :key="s" :value="s" class="capitalize">
                  {{ s }}
                </option>
              </select>
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >AoE Size</span
              >
              <input
                v-model="aoeSize"
                placeholder="e.g. 20-foot radius"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>

          <!-- Condition inflicted -->
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
              >Condition Inflicted
              <span class="normal-case font-fell font-normal">(optional)</span></span
            >
            <input
              v-model="conditionInflicted"
              placeholder="e.g. blinded, stunned, frightened…"
              class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            placeholder="Describe the spell's effects…"
            min-height="200px"
          />
        </div>

        <!-- At Higher Levels -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
            >At Higher Levels
            <span class="normal-case font-fell font-normal text-muted-foreground"
              >(optional)</span
            ></span
          >
          <textarea
            v-model="higherLevels"
            rows="2"
            placeholder="e.g. When cast using a 3rd-level slot or higher, the damage increases by 1d6 for each slot level above 2nd. Or: you can target one additional creature for each slot level above 1st…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Tags -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase"
            >Tags</span
          >
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- ── Right: Classes + Advisor ────────────────────────────────────── -->
      <div v-if="!isSrd" class="flex flex-col gap-4">
        <!-- Class list -->
        <div class="rounded-lg border border-border bg-card p-4">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase mb-3"
          >
            Spell Lists
          </h3>
          <p class="font-fell text-xs text-muted-foreground italic mb-3">
            Which classes have access to this spell?
          </p>
          <div class="flex flex-col gap-2">
            <label
              v-for="cls in SPELL_CLASSES"
              :key="cls"
              class="flex items-center gap-2 cursor-pointer"
            >
              <input type="checkbox" :value="cls" v-model="classes" class="rounded" />
              <span class="font-fell text-sm text-foreground">{{ cls }}</span>
            </label>
          </div>
        </div>

        <!-- Spell Level Advisor -->
        <div
          class="rounded-lg border bg-card p-4 transition-shadow duration-700"
          :class="[
            advisorOpen ? 'border-primary/50' : 'border-border',
            advisorPanelHighlighted
              ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background'
              : '',
          ]"
        >
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 flex-1 text-left"
              @click="advisorOpen = !advisorOpen"
            >
              <IconTip class="h-3.5 w-3.5 text-primary shrink-0" />
              <h3
                class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase"
              >
                Spell Level Advisor
              </h3>
              <IconChevronDown
                class="h-3.5 w-3.5 text-muted-foreground transition-transform ml-auto"
                :class="advisorOpen ? 'rotate-180' : ''"
              />
            </button>
            <button
              v-if="advisorOpen"
              type="button"
              class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground tracking-wider transition-colors shrink-0"
              @click="advisorOpen = false"
            >
              Skip →
            </button>
          </div>
          <p class="font-fell text-xs text-muted-foreground italic mt-1 mb-3">
            {{
              isNew
                ? "Answer a few questions to pre-fill mechanics and suggest a level."
                : "Estimate a balanced level based on 2024 DMG guidelines."
            }}
          </p>

          <div v-if="advisorOpen" class="flex flex-col gap-3">
            <!-- Effect type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Main Effect</span
              >
              <select
                v-model="adv.effectType"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="damage">Damage</option>
                <option value="healing">Healing / Restoration</option>
                <option value="control">Control (restrain, slow, etc.)</option>
                <option value="buff">Buff / Enhancement</option>
                <option value="utility">Utility / Exploration</option>
              </select>
            </label>

            <!-- Intensity (control / buff / utility only) -->
            <label
              v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Effect Intensity</span
              >
              <select
                v-model="adv.effectIntensity"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <template v-if="adv.effectType === 'control'">
                  <option value="weak">Weak — disadvantage, minor debuff</option>
                  <option value="moderate">Moderate — restrained, frightened, slow</option>
                  <option value="major">Major — stunned, incapacitated, banished</option>
                  <option value="extreme">Extreme — dominated, paralysed, power word</option>
                </template>
                <template v-else-if="adv.effectType === 'buff'">
                  <option value="weak">Weak — minor bonus, +d4</option>
                  <option value="moderate">Moderate — advantage, resistance</option>
                  <option value="major">Major — extra attack, flight, haste</option>
                  <option value="extreme">Extreme — extra action, immunity</option>
                </template>
                <template v-else>
                  <option value="weak">Minor — convenience, limited info</option>
                  <option value="moderate">Moderate — solves a problem category</option>
                  <option value="major">Major — teleportation, legend lore</option>
                  <option value="extreme">World-altering — Wish, Gate level</option>
                </template>
              </select>
            </label>

            <!-- Damage / healing dice -->
            <label
              v-if="adv.effectType === 'damage' || adv.effectType === 'healing'"
              class="flex flex-col gap-1"
            >
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">
                {{ adv.effectType === "damage" ? "Damage Dice" : "Healing Dice" }}
              </span>
              <DiceInput
                v-model="adv.damageDice"
                placeholder="e.g. 8d6 · 2d6 fire + 1d6 force · 3d8 + 5"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full"
              />
              <span v-if="adv.damageDice" class="font-fell text-[11px] text-muted-foreground">
                Avg: {{ Math.round(parseDiceAvg(adv.damageDice)) }}
              </span>
            </label>

            <!-- Targeting -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Targeting</span
              >
              <select
                v-model="adv.targetingMode"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="self">Self only</option>
                <option value="single">Single target</option>
                <option value="multi_2">Up to 2 creatures</option>
                <option value="multi_3">Up to 3 creatures</option>
                <option value="multi_4_5">Up to 4–5 creatures</option>
                <option value="aoe_small">Small AoE (≤15 ft cone / ≤30 ft line)</option>
                <option value="aoe_medium">Medium AoE (20 ft radius / 60 ft line)</option>
                <option value="aoe_large">Large AoE (30+ ft radius)</option>
              </select>
            </label>

            <!-- IconSave type -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Targeting / IconSave</span
              >
              <select
                v-model="adv.saveType"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="save_for_half">Saving throw — half on save</option>
                <option value="save_negates">Saving throw — negates on save</option>
                <option value="attack_roll">Attack roll (can miss)</option>
                <option value="automatic">Automatic — no save or attack</option>
              </select>
            </label>

            <!-- Duration -->
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                >Duration Tier</span
              >
              <select
                v-model="adv.durationTier"
                class="bg-muted border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="instantaneous">Instantaneous</option>
                <option value="conc_1min">Concentration, ≤1 minute</option>
                <option value="conc_10min">Concentration, ≤10 minutes</option>
                <option value="conc_1hour">Concentration, ≤1 hour</option>
                <option value="sustained_1min">1 minute (no concentration)</option>
                <option value="sustained_long">8+ hours (no concentration)</option>
              </select>
            </label>

            <!-- Checkboxes -->
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.requiresConcentration" class="rounded" />
                <span class="font-fell text-sm text-foreground">Requires Concentration</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.hasSecondaryEffect" class="rounded" />
                <span class="font-fell text-sm text-foreground"
                  >Secondary condition / rider effect</span
                >
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="adv.isRitual" class="rounded" />
                <span class="font-fell text-sm text-foreground">Can be cast as Ritual</span>
              </label>
            </div>

            <!-- Result -->
            <div
              v-if="advResult"
              class="rounded-md bg-primary/10 border border-primary/30 p-3 flex flex-col gap-2"
            >
              <p class="font-cinzel text-sm font-bold text-primary">
                Suggested: Level {{ advResult.suggestedMin }}–{{ advResult.suggestedMax }}
              </p>
              <ul class="space-y-0.5">
                <li
                  v-for="(f, i) in advResult.factors"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex gap-1.5"
                >
                  <span class="text-primary shrink-0">·</span>{{ f }}
                </li>
              </ul>
              <!-- Reference spells -->
              <template
                v-if="adv.effectType !== 'damage' && adv.effectType !== 'healing' && refSpells"
              >
                <div class="border-t border-primary/20 pt-2 flex flex-col gap-0.5">
                  <span
                    class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                    >Reference spells at this level</span
                  >
                  <p
                    v-if="refSpells.control && adv.effectType === 'control'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    {{ refSpells.control }}
                  </p>
                  <p
                    v-if="refSpells.buff && adv.effectType === 'buff'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    {{ refSpells.buff }}
                  </p>
                  <p
                    v-if="refSpells.utility && adv.effectType === 'utility'"
                    class="font-fell text-xs text-muted-foreground"
                  >
                    {{ refSpells.utility }}
                  </p>
                </div>
              </template>
              <button
                type="button"
                class="mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-[11px] font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
                @click="applyAdvisor"
              >
                Apply to Spell (Level
                {{
                  advResult.suggestedMin +
                  Math.floor((advResult.suggestedMax - advResult.suggestedMin) / 2)
                }}) →
              </button>
            </div>

            <!-- School design tips -->
            <div
              v-if="schoolTip"
              class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase"
                  >{{ schoolTip.title }} design notes</span
                >
                <span class="font-fell text-[10px] text-muted-foreground/60 italic shrink-0"
                  >from School field ↑</span
                >
              </div>
              <ul class="space-y-1">
                <li
                  v-for="(tip, i) in schoolTip.tips"
                  :key="i"
                  class="font-fell text-xs text-muted-foreground flex gap-1.5"
                >
                  <span class="text-primary/60 shrink-0">·</span>{{ tip }}
                </li>
              </ul>
            </div>

            <!-- Reference table toggle -->
            <button
              type="button"
              class="font-cinzel text-[10px] text-muted-foreground tracking-wider hover:text-foreground transition-colors text-left"
              @click="showTable = !showTable"
            >
              {{ showTable ? "▲ Hide" : "▼ Show" }} damage benchmark table
            </button>
            <div v-if="showTable" class="overflow-x-auto">
              <table class="w-full text-[10px] font-fell">
                <thead>
                  <tr class="border-b border-border text-muted-foreground">
                    <th class="text-left py-1 pr-2">Lvl</th>
                    <th class="text-left py-1 pr-2">Single</th>
                    <th class="text-left py-1 pr-2">Small AoE</th>
                    <th class="text-left py-1">Large AoE</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in DAMAGE_BENCHMARKS"
                    :key="row.level"
                    class="border-b border-border/30"
                  >
                    <td class="py-0.5 pr-2 font-cinzel font-bold text-foreground">
                      {{ row.label }}
                    </td>
                    <td class="py-0.5 pr-2 text-muted-foreground">{{ row.singleTarget }}</td>
                    <td class="py-0.5 pr-2 text-muted-foreground">{{ row.aoeSmall }}</td>
                    <td class="py-0.5 text-muted-foreground">{{ row.aoeLarge }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- AI generation dialog -->
  <SpellGenerateDialog
    v-if="showGenerateDialog && isAiEnabled"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import { IconChevronDown, IconDelete, IconGenerate, IconSave, IconScrollText, IconTip } from '@/lib/icons';
import SpellGenerateDialog from "@/ai/SpellGenerateDialog.vue";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import type { SpellAiGenerated } from "@/ai/types";
import { useCampaignStore } from "@/stores/campaign";
import ImageUpload from "@/components/common/ImageUpload.vue";
import DiceInput from "@/components/common/DiceInput.vue";
import DamageRollsInput from "@/components/common/DamageRollsInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import {
  SPELL_SCHOOLS,
  SPELL_CLASSES,
  SPELL_COMPONENTS,
  CASTING_TIME_OPTIONS,
  DURATION_OPTIONS,
  RANGE_OPTIONS,
  AOE_SHAPES,
  ATTACK_TYPES,
  SAVE_ATTRIBUTES,
  SAVE_EFFECTS,
} from "@/types/spell.types";
import type { Spell, SpellSchool } from "@/types/spell.types";
import { spellSourceLabel } from "@/types/spell.types";
import { useCreateSpell, useUpdateSpell, useDeleteSpell } from "@/composables/useSpells";
import { useUpsertSrdSpellArt } from "@/composables/useSrdSpellArt";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatSpellForScriptorium } from "@/lib/scriptoriumImport";
import {
  adviseLevelRange,
  parseDiceAvg,
  DAMAGE_BENCHMARKS,
  REFERENCE_SPELLS,
  SCHOOL_DESIGN_TIPS,
  type EffectType,
  type EffectIntensity,
  type TargetingMode,
  type SaveType,
  type DurationTier,
} from "@/lib/spellAdvisor";
import { parseDamageExpression, type DamageRoll } from "@/lib/dice";

const props = defineProps<{ spell: Spell | null; isSrd?: boolean }>();
const router = useRouter();

const { mutateAsync: upsertSrdArt } = useUpsertSrdSpellArt();
const isSrd = computed(() => !!props.isSrd);

// ── Core fields ───────────────────────────────────────────────────────────────
const name = ref(props.spell?.name ?? "");
const level = ref(props.spell?.level ?? 1);
const school = ref<SpellSchool>(props.spell?.school ?? "evocation");
const castingTime = ref(props.spell?.casting_time ?? "Action");
const castingTimeCustom = ref(props.spell?.casting_time_custom ?? "");
const range = ref(props.spell?.range ?? "60 ft.");
const rangeCustom = ref(props.spell?.range_custom ?? "");
const duration = ref(props.spell?.duration ?? "Instantaneous");
const durationCustom = ref(props.spell?.duration_custom ?? "");
const concentration = ref(props.spell?.concentration ?? false);
const ritual = ref(props.spell?.ritual ?? false);
const components = ref<string[]>(props.spell?.components ?? []);
const material = ref(props.spell?.material ?? "");
const description = ref(props.spell?.description ?? "");
const higherLevels = ref(props.spell?.higher_levels ?? "");
const classes = ref<string[]>(props.spell?.classes ?? []);
const source = ref(props.spell?.source ?? "");
const imageUrl = ref(props.spell?.image_url ?? "");
const imageFocalPoint = ref(props.spell?.image_focal_point ?? null);
const tags = ref<string[]>(props.spell?.tags ?? []);

// When SRD art loads asynchronously, sync art fields from the updated prop
watch(
  () => props.spell,
  (s) => {
    if (isSrd.value && s) {
      imageUrl.value = s.image_url ?? "";
      imageFocalPoint.value = s.image_focal_point ?? null;
    }
  },
);

function onImageUrlUpdate(url: string | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.spell!.id, image_url: url });
  else imageUrl.value = url ?? "";
}
function onImageFocalUpdate(pt: { x: number; y: number } | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.spell!.id, portrait_focal_point: pt });
  else imageFocalPoint.value = pt;
}

// ── Mechanics ─────────────────────────────────────────────────────────────────
const attackType = ref(props.spell?.attack_type ?? "");
const saveAttribute = ref(props.spell?.save_attribute ?? "");
const saveEffect = ref(props.spell?.save_effect ?? "");
const damageRolls = ref<DamageRoll[]>(props.spell?.damage_rolls ?? []);
const healingDice = ref(props.spell?.healing_dice ?? "");
const targetDescription = ref(props.spell?.target_description ?? "");
const aoeShape = ref(props.spell?.aoe_shape ?? "");
const aoeSize = ref(props.spell?.aoe_size ?? "");
const conditionInflicted = ref(props.spell?.condition_inflicted ?? "");
function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

// Auto-set concentration when a concentration duration is selected
function onDurationChange() {
  if (duration.value.startsWith("Concentration")) concentration.value = true;
}

// ── Advisor state ─────────────────────────────────────────────────────────────
const isNew = !props.spell;
const advisorModalOpen = ref(isNew); // modal wizard for new spells
const advisorOpen = ref(false); // sidebar panel (collapsed by default)
const advisorPanelHighlighted = ref(false);
const showTable = ref(false);

const adv = reactive({
  effectType: "damage" as EffectType,
  effectIntensity: "moderate" as EffectIntensity,
  damageDice: "",
  targetingMode: "single" as TargetingMode,
  saveType: "save_for_half" as SaveType,
  durationTier: "instantaneous" as DurationTier,
  requiresConcentration: false,
  hasSecondaryEffect: false,
  isRitual: false,
});

const schoolTip = computed(() => SCHOOL_DESIGN_TIPS[school.value] ?? null);
const refSpells = computed(() => {
  const level =
    advResult.value.suggestedMin +
    Math.floor((advResult.value.suggestedMax - advResult.value.suggestedMin) / 2);
  return REFERENCE_SPELLS[Math.max(0, Math.min(9, level))] ?? null;
});

const advResult = computed(() => adviseLevelRange(adv));

function applyAdvisor() {
  if (!advResult.value) return;

  // Level
  const mid =
    advResult.value.suggestedMin +
    Math.floor((advResult.value.suggestedMax - advResult.value.suggestedMin) / 2);
  level.value = Math.max(0, Math.min(9, mid));

  // Dice → mechanics fields
  if (adv.effectType === "damage") {
    if (adv.damageDice) damageRolls.value = parseDamageExpression(adv.damageDice);
    healingDice.value = "";
  } else if (adv.effectType === "healing") {
    healingDice.value = adv.damageDice;
    damageRolls.value = [];
  } else {
    damageRolls.value = [];
    healingDice.value = "";
  }

  // Targeting → AoE shape + size hints (only for AoE modes)
  if (adv.targetingMode === "aoe_small") {
    if (!aoeShape.value) aoeShape.value = "cone";
  } else if (adv.targetingMode === "aoe_medium") {
    if (!aoeShape.value) aoeShape.value = "sphere";
    if (!aoeSize.value) aoeSize.value = "20-foot radius";
  } else if (adv.targetingMode === "aoe_large") {
    if (!aoeShape.value) aoeShape.value = "sphere";
    if (!aoeSize.value) aoeSize.value = "30-foot radius";
  } else {
    // Non-AoE targeting — clear AoE fields
    aoeShape.value = "";
    aoeSize.value = "";
  }

  // IconSave/attack type
  if (adv.saveType === "automatic") {
    attackType.value = "automatic";
    saveAttribute.value = "";
    saveEffect.value = "";
  } else if (adv.saveType === "attack_roll") {
    attackType.value = "ranged_spell";
    saveAttribute.value = "";
    saveEffect.value = "";
  } else if (adv.saveType === "save_negates") {
    attackType.value = "save";
    saveEffect.value = "negates";
  } else if (adv.saveType === "save_for_half") {
    attackType.value = "save";
    saveEffect.value = "half";
  }

  // Concentration + ritual
  concentration.value = adv.requiresConcentration;
  ritual.value = adv.isRitual;
}

function skipAdvisorModal() {
  advisorModalOpen.value = false;
}

function applyAdvisorFromModal() {
  applyAdvisor();
  advisorModalOpen.value = false;
  // Briefly highlight the sidebar panel so the user knows where the advisor went
  setTimeout(() => {
    advisorPanelHighlighted.value = true;
    setTimeout(() => {
      advisorPanelHighlighted.value = false;
    }, 1200);
  }, 250);
}

// Sync concentration checkbox → advisor
watch(concentration, (val) => {
  adv.requiresConcentration = val;
});
watch(ritual, (val) => {
  adv.isRitual = val;
});

// Pre-fill advisor from mechanics fields when it opens
watch(advisorOpen, (open) => {
  if (!open) return;
  if (damageRolls.value.length) {
    adv.effectType = "damage";
    adv.damageDice = damageRolls.value
      .map((r) => (r.type ? `${r.dice} ${r.type}` : r.dice))
      .join(" + ");
  }
  if (healingDice.value) {
    adv.effectType = "healing";
    adv.damageDice = healingDice.value;
  }
  if (aoeShape.value) {
    adv.targetingMode =
      aoeSize.value && parseInt(aoeSize.value) >= 30
        ? "aoe_large"
        : aoeSize.value && parseInt(aoeSize.value) >= 15
          ? "aoe_medium"
          : "aoe_small";
  }
  if (attackType.value === "automatic") adv.saveType = "automatic";
  else if (attackType.value === "ranged_spell" || attackType.value === "melee_spell")
    adv.saveType = "attack_roll";
  else if (attackType.value === "save") {
    adv.saveType = saveEffect.value === "negates" ? "save_negates" : "save_for_half";
  }
});

// ── IconSave / Delete ─────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateSpell();
const { mutateAsync: update } = useUpdateSpell();
const { mutateAsync: deleteSpell } = useDeleteSpell();
const isSaving = ref(false);
const isDeleting = ref(false);
const saveError = ref("");

function buildPayload() {
  return {
    name: name.value.trim(),
    level: level.value,
    school: school.value,
    casting_time: castingTime.value,
    casting_time_custom:
      castingTime.value === "Special" || castingTime.value === "Reaction"
        ? castingTimeCustom.value || null
        : null,
    range: range.value,
    range_custom: range.value === "Special" ? rangeCustom.value || null : null,
    duration: duration.value,
    duration_custom: duration.value === "Special" ? durationCustom.value || null : null,
    concentration: concentration.value,
    ritual: ritual.value,
    components: components.value,
    material: components.value.includes("M") ? material.value || null : null,
    description: description.value,
    higher_levels: higherLevels.value || null,
    classes: classes.value,
    tags: tags.value,
    source: source.value || null,
    source_title: props.spell?.source_title ?? null,
    source_url: props.spell?.source_url ?? null,
    open5e_import: props.spell?.open5e_import ?? false,
    image_url: imageUrl.value || null,
    image_focal_point: imageFocalPoint.value,
    attack_type: attackType.value || null,
    save_attribute: attackType.value === "save" ? saveAttribute.value || null : null,
    save_effect: attackType.value === "save" ? saveEffect.value || null : null,
    damage_rolls: damageRolls.value.length ? damageRolls.value : null,
    healing_dice: healingDice.value || null,
    target_description: targetDescription.value || null,
    aoe_shape: aoeShape.value || null,
    aoe_size: aoeSize.value || null,
    condition_inflicted: conditionInflicted.value || null,
    higher_level_damage: props.spell?.higher_level_damage ?? null,
    higher_level_healing: props.spell?.higher_level_healing ?? null,
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.spell) {
      await update({ id: props.spell.id, update: buildPayload() });
      router.push("/spells");
    } else {
      const created = await create(buildPayload());
      router.replace(`/spells/${created.id}?edit=true`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!props.spell || !confirm(`Delete "${props.spell.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    router.push("/spells");
    await deleteSpell(props.spell);
  } finally {
    isDeleting.value = false;
  }
}

// ── AI generation ─────────────────────────────────────────────────────────────
const campaignStore = useCampaignStore();
const aiApiKey = computed(() => campaignStore.decryptedApiKey);
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const showGenerateDialog = ref(false);

function onAiGenerated(result: SpellAiGenerated) {
  showGenerateDialog.value = false;
  // Reuse the adapter so dialog-fill matches what the side-panel "Generate
  // and create" path produces — single source of truth for AI → Spell mapping.
  const ins = spellInsertFromAi(result);
  name.value                = ins.name;
  level.value               = ins.level;
  school.value              = ins.school;
  castingTime.value         = ins.casting_time;
  castingTimeCustom.value   = ins.casting_time_custom ?? "";
  range.value               = ins.range;
  rangeCustom.value         = ins.range_custom ?? "";
  duration.value            = ins.duration;
  durationCustom.value      = ins.duration_custom ?? "";
  concentration.value       = ins.concentration;
  ritual.value              = ins.ritual;
  components.value          = [...ins.components];
  material.value            = ins.material ?? "";
  description.value         = ins.description;
  higherLevels.value        = ins.higher_levels ?? "";
  classes.value             = [...ins.classes];
  source.value              = ins.source ?? "";
  tags.value                = [...ins.tags];
  attackType.value          = ins.attack_type ?? "";
  saveAttribute.value       = ins.save_attribute ?? "";
  saveEffect.value          = ins.save_effect ?? "";
  damageRolls.value         = ins.damage_rolls ?? [];
  healingDice.value         = ins.healing_dice ?? "";
  targetDescription.value   = ins.target_description ?? "";
  aoeShape.value            = ins.aoe_shape ?? "";
  aoeSize.value             = ins.aoe_size ?? "";
  conditionInflicted.value  = ins.condition_inflicted ?? "";
  if (ins.image_url) {
    imageUrl.value          = ins.image_url;
    imageFocalPoint.value   = null;
  }
  // Skip the level advisor wizard when AI populated us — DM can re-open it.
  advisorModalOpen.value = false;
}

// ── Send to Scriptorium ───────────────────────────────────────────────────────
const { mutateAsync: createDoc } = useCreateScriptoriumDocument();
const isSendingToScriptorium = ref(false);

async function sendToScriptorium() {
  if (!props.spell) return;
  isSendingToScriptorium.value = true;
  try {
    const data = formatSpellForScriptorium(props.spell);
    const doc = await createDoc(data);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    isSendingToScriptorium.value = false;
  }
}
</script>

<style>
.advisor-modal-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.advisor-modal-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.advisor-modal-enter-from,
.advisor-modal-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-6px);
}
</style>
