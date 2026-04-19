<template>
  <div class="max-w-2xl mx-auto pb-8 space-y-6">

    <!-- Step indicator -->
    <div>
      <h1 class="font-cinzel text-xl font-bold text-foreground">
        {{ isEditMode ? 'Edit Character' : 'Create Your Character' }}
      </h1>
      <div class="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
        <template v-for="(step, idx) in WIZARD_STEPS" :key="step.id">
          <button type="button"
            class="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded font-cinzel text-[10px] font-semibold tracking-wider transition-colors"
            :class="wizardStep === idx
              ? 'bg-primary text-primary-foreground'
              : idx < wizardStep
                ? 'text-primary/70 hover:text-primary cursor-pointer'
                : 'text-muted-foreground/40 cursor-default'"
            :disabled="idx > wizardStep"
            @click="idx < wizardStep && (wizardStep = idx)">
            <span class="w-4 h-4 rounded-full text-[9px] flex items-center justify-center shrink-0"
              :class="wizardStep === idx ? 'bg-white/20' : idx < wizardStep ? 'bg-primary/20' : 'bg-muted'">
              {{ idx + 1 }}
            </span>
            {{ step.label }}
          </button>
          <div v-if="idx < WIZARD_STEPS.length - 1" class="shrink-0 w-3 h-px bg-border" />
        </template>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Step 0: Basics — portrait · name · species                            -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div v-if="wizardStep === 0" class="space-y-5">

      <!-- Portrait + name -->
      <div class="flex gap-4">
        <div class="w-28 shrink-0">
          <ImageUpload :model-value="portraitUrl || null" :focal-point="focalPoint" show-focal-point
            @update:model-value="portraitUrl = $event ?? ''" @update:focal-point="focalPoint = $event" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <label class="block">
            <span class="field-label">Character Name *</span>
            <input v-model="f.name" class="field-input w-full" placeholder="Aric Stormblade" autofocus />
          </label>
          <label class="block">
            <span class="field-label">Player Name</span>
            <input v-model="f.player_name" class="field-input w-full" :placeholder="auth.membership?.display_name ?? 'Your name'" />
          </label>
        </div>
      </div>

      <!-- Species picker -->
      <div class="space-y-3">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">SPECIES</p>
        <div v-if="!allSpecies?.length" class="rounded-lg border border-border bg-card p-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">No species in the campaign yet — skip for now.</p>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button v-for="sp in allSpecies" :key="sp.id" type="button"
            class="rounded-lg border overflow-hidden text-left transition-all"
            :class="f.species_id === sp.id ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
            @click="onSpeciesSelect(sp.id)">
            <div v-if="sp.image_url" class="h-24 overflow-hidden bg-muted">
              <FocalImage :src="sp.image_url" :alt="sp.name" format="landscape" :focal-point="sp.focal_point ?? null" />
            </div>
            <div class="px-3 py-2 flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-sm font-bold text-foreground">{{ sp.name }}</p>
                <p v-if="sp.traits?.length" class="font-fell text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {{ sp.traits.slice(0, 3).map((t) => t.name).join(' · ') }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                <span v-if="sp.size" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[9px] text-muted-foreground capitalize">{{ sp.size }}</span>
                <span v-if="sp.subraces?.length" class="font-cinzel text-[9px] text-muted-foreground/60">
                  {{ sp.subraces.length }} variant{{ sp.subraces.length > 1 ? 's' : '' }}
                </span>
              </div>
            </div>
          </button>
        </div>

        <!-- Subrace picker -->
        <div v-if="subraceOptions.length > 0" class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">CHOOSE A VARIANT</p>
          <div class="flex flex-wrap gap-2">
            <button v-for="sr in subraceOptions" :key="sr" type="button"
              class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold transition-colors"
              :class="f.subrace === sr ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'"
              @click="f.subrace = f.subrace === sr ? '' : sr">
              {{ sr }}
            </button>
          </div>
        </div>

        <p v-if="f.species_id" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
          ✓ {{ selectedSpecies?.name }} selected{{ f.subrace ? ` — ${f.subrace}` : '' }}
        </p>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Step 1: Abilities — scores + species ASI                              -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div v-else-if="wizardStep === 1" class="space-y-4">

      <!-- Score method tabs -->
      <div class="flex items-center gap-2 p-1 rounded-lg bg-muted w-fit flex-wrap">
        <button type="button" v-for="mode in SCORE_MODES" :key="mode.id"
          class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold transition-colors"
          :class="scoreMode === mode.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="onScoreModeChange(mode.id)">
          {{ mode.label }}
        </button>
      </div>

      <!-- Point Buy -->
      <div v-if="scoreMode === 'pointbuy'" class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">ASSIGN SCORES</p>
          <div class="flex items-center gap-2">
            <span class="font-cinzel text-xs text-muted-foreground">Points remaining:</span>
            <span class="font-cinzel text-sm font-bold"
              :class="pointsRemaining < 0 ? 'text-destructive' : pointsRemaining === 0 ? 'text-green-500' : 'text-primary'">
              {{ pointsRemaining }}
            </span>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div v-for="stat in ABILITY_STATS" :key="stat.key"
            class="rounded-lg border bg-card p-3 flex flex-col items-center gap-1.5 transition-colors"
            :class="asiMode === 'bonus' && racialBonusMap[stat.key] ? 'border-primary/40 bg-primary/2' : 'border-border'">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <div class="flex items-center gap-2">
              <button type="button"
                class="w-6 h-6 rounded-full border border-border font-cinzel text-sm font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                :disabled="f[stat.key] <= 8"
                @click="f[stat.key]--">−</button>
              <span class="font-cinzel text-lg font-bold w-8 text-center">{{ displayScore(stat.key) }}</span>
              <button type="button"
                class="w-6 h-6 rounded-full border border-border font-cinzel text-sm font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                :disabled="f[stat.key] >= 15 || pointsRemaining <= 0 || (pointsRemaining < (POINT_BUY_COSTS[f[stat.key] + 1] ?? 99) - POINT_BUY_COSTS[f[stat.key]])"
                @click="f[stat.key]++">+</button>
            </div>
            <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
              class="font-cinzel text-[9px] font-bold text-primary leading-none">
              +{{ racialBonusMap[stat.key] }} racial
            </span>
            <span class="font-cinzel text-xs font-bold" :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
            </span>
            <span class="font-cinzel text-[9px] text-muted-foreground">{{ POINT_BUY_COSTS[f[stat.key]] ?? 0 }} pts</span>
          </div>
        </div>
      </div>

      <!-- Standard Array / 4d6 pool -->
      <div v-else-if="scoreMode === 'array' || scoreMode === 'roll'" class="space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <p class="font-fell text-sm text-muted-foreground italic">
            <template v-if="scoreMode === 'array'">Assign the standard array (15, 14, 13, 12, 10, 8) to your abilities.</template>
            <template v-else>4d6 drop lowest — reroll until happy, then assign.</template>
          </p>
          <button v-if="scoreMode === 'roll'" type="button"
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity"
            @click="rollAbilityScores">Reroll Pool</button>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap rounded-md border border-border bg-card px-3 py-2">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider mr-1">POOL</span>
          <span v-for="(val, idx) in scorePool" :key="idx"
            class="w-9 h-9 rounded-md border font-cinzel text-sm font-bold flex items-center justify-center transition-colors"
            :class="Object.values(scoreAssignment).includes(idx)
              ? 'border-primary/30 bg-primary/10 text-primary/60 line-through'
              : 'border-border bg-muted/50 text-foreground'">{{ val }}</span>
          <span v-if="scorePool.length === 0" class="font-fell text-xs text-muted-foreground italic">No pool loaded.</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div v-for="stat in ABILITY_STATS" :key="stat.key"
            class="rounded-lg border bg-card p-3 flex flex-col items-center gap-1.5 transition-colors"
            :class="asiMode === 'bonus' && racialBonusMap[stat.key] ? 'border-primary/40 bg-primary/2' : 'border-border'">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <select :value="scoreAssignment[stat.key] ?? ''" class="field-input w-full text-center"
              @change="onPoolPick(stat.key, ($event.target as HTMLSelectElement).value)">
              <option value="">—</option>
              <option v-for="opt in availableForAbility(stat.key)" :key="opt.idx" :value="opt.idx">{{ opt.val }}</option>
            </select>
            <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
              class="font-cinzel text-[9px] font-bold text-primary leading-none">
              +{{ racialBonusMap[stat.key] }} racial
            </span>
            <span class="font-cinzel text-xs font-bold" :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Manual entry -->
      <div v-else class="space-y-3">
        <p class="font-fell text-sm text-muted-foreground italic">Enter your scores directly.</p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <input v-model.number="f[stat.key]" type="number" min="1" max="30" class="field-input w-full text-center px-1" />
            <span v-if="asiMode === 'bonus' && racialBonusMap[stat.key]"
              class="font-cinzel text-[9px] font-bold text-primary leading-none">
              +{{ racialBonusMap[stat.key] }} racial
            </span>
            <span class="font-cinzel text-xs font-bold" :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
            </span>
          </label>
        </div>
      </div>

      <!-- Species ASI -->
      <div v-if="selectedSpecies?.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length"
        class="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">

        <!-- Header + mode switch -->
        <div class="flex items-center justify-between flex-wrap gap-2">
          <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">
            {{ selectedSpecies.name.toUpperCase() }} BONUSES
          </p>
          <div class="flex rounded overflow-hidden border border-primary/30 text-[11px] font-cinzel font-semibold">
            <button v-if="asiIsStructured" type="button"
              class="px-2.5 py-1 transition-colors"
              :class="asiMode === 'bonus' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="asiMode = 'bonus'">Racial</button>
            <button type="button"
              class="px-2.5 py-1 transition-colors"
              :class="asiMode === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="asiMode = 'custom'">Custom (+3)</button>
            <button type="button"
              class="px-2.5 py-1 transition-colors"
              :class="asiMode === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="asiMode = 'manual'">Skip</button>
          </div>
        </div>

        <!-- Racial mode: structured — bonuses shown directly in score cards above -->
        <p v-if="asiMode === 'bonus' && asiIsStructured"
          class="font-fell text-xs text-muted-foreground italic">
          Racial bonuses reflected in your scores above — applied automatically on save.
        </p>

        <!-- Racial mode: unstructured — show free-text description, player adjusts manually -->
        <div v-else-if="asiMode === 'bonus' && !asiIsStructured" class="space-y-1">
          <p class="font-fell text-sm text-foreground">{{ asiDescriptionText }}</p>
          <p class="font-fell text-xs text-muted-foreground italic">
            Free-text bonus — adjust your scores above to include it, then use Skip or Custom instead.
          </p>
        </div>

        <!-- Custom mode: distribute 3 free points (player picks which abilities) -->
        <div v-else-if="asiMode === 'custom'" class="space-y-2">
          <p class="font-fell text-xs text-muted-foreground italic">
            Distribute 3 free points across any abilities (max +2 per ability).
            <span :class="customAsiTotal >= 3 ? 'text-green-500 font-bold not-italic' : 'text-primary'">
              {{ customAsiTotal < 3 ? `${3 - customAsiTotal} remaining` : 'All assigned' }}.
            </span>
          </p>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <div v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
              <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
              <div class="flex items-center gap-1">
                <button type="button"
                  class="w-5 h-5 rounded border border-border font-cinzel text-xs font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                  :disabled="customAsi[stat.key] <= 0"
                  @click="adjustCustomAsi(stat.key, -1)">−</button>
                <span class="font-cinzel text-sm font-bold w-5 text-center"
                  :class="customAsi[stat.key] > 0 ? 'text-primary' : 'text-muted-foreground'">
                  +{{ customAsi[stat.key] }}
                </span>
                <button type="button"
                  class="w-5 h-5 rounded border border-border font-cinzel text-xs font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                  :disabled="customAsi[stat.key] >= 2 || customAsiTotal >= 3"
                  @click="adjustCustomAsi(stat.key, 1)">+</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Skip mode -->
        <p v-else class="font-fell text-xs text-muted-foreground italic">
          Racial bonuses skipped — you handle your ability scores above.
        </p>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Step 2: Background & Identity                                          -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div v-else-if="wizardStep === 2" class="space-y-4">

      <!-- Background picker -->
      <div class="space-y-3">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">BACKGROUND</p>
        <div v-if="!allBackgrounds?.length" class="rounded-lg border border-border bg-card p-6 text-center">
          <p class="font-fell text-sm text-muted-foreground italic">No backgrounds in the campaign yet — skip for now.</p>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button v-for="bg in allBackgrounds" :key="bg.id" type="button"
            class="rounded-lg border overflow-hidden text-left transition-all p-3"
            :class="f.background_id === bg.id ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
            @click="onBackgroundSelect(bg.id)">
            <p class="font-cinzel text-sm font-bold text-foreground">{{ bg.name }}</p>
            <div v-if="bg.skill_proficiencies?.length" class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="sk in bg.skill_proficiencies" :key="sk"
                class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[9px] text-primary">{{ sk }}</span>
            </div>
            <p v-if="bg.feature_name" class="font-fell text-xs text-muted-foreground mt-1.5 italic">{{ bg.feature_name }}</p>
            <p v-if="bg.source_title" class="font-cinzel text-[9px] text-muted-foreground/50 mt-1">{{ bg.source_title }}</p>
          </button>
        </div>

        <!-- Starting equipment -->
        <div v-if="selectedBg?.equipment" class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">STARTING EQUIPMENT</p>
          <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ selectedBg.equipment }}</p>
          <label class="flex items-start gap-2 cursor-pointer pt-1">
            <input type="checkbox" v-model="importBackgroundEquipment" class="mt-0.5 h-4 w-4 rounded border-border bg-muted" />
            <span class="font-fell text-xs text-muted-foreground">
              Add these to my inventory automatically.
            </span>
          </label>
        </div>
      </div>

      <!-- Identity (collapsible) -->
      <div class="rounded-lg border border-border bg-card">
        <button type="button"
          class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="showIdentity = !showIdentity">
          <span>IDENTITY — ALIGNMENT · AGE · APPEARANCE</span>
          <span class="text-base transition-transform" :class="showIdentity ? '' : '-rotate-90'">▾</span>
        </button>
        <div v-if="showIdentity" class="px-3 pb-3 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="field-label">Alignment</span>
              <select v-model="f.alignment" class="field-input w-full">
                <option value="">—</option>
                <option v-for="a in ALIGNMENT_OPTIONS" :key="a" :value="a">{{ a }}</option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">Deity</span>
              <input v-model="f.deity" class="field-input w-full" placeholder="Tyr, Mielikki, none…" />
            </label>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <label class="block">
              <span class="field-label">Age</span>
              <input v-model="f.age" class="field-input w-full" placeholder="47, ancient…" />
            </label>
            <label class="block">
              <span class="field-label">Gender</span>
              <input v-model="f.gender" class="field-input w-full" />
            </label>
            <label class="block">
              <span class="field-label">Pronouns</span>
              <input v-model="f.pronouns" class="field-input w-full" placeholder="she/her" />
            </label>
          </div>
          <label class="block">
            <span class="field-label">Physical Description</span>
            <textarea v-model="f.physical_description" class="field-input w-full resize-y" rows="2"
              placeholder="Hair, build, scars, anything that helps the table picture them." />
          </label>
        </div>
      </div>

      <!-- Personality (collapsible) -->
      <div class="rounded-lg border border-border bg-card">
        <button type="button"
          class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="showPersonality = !showPersonality">
          <span>PERSONALITY · IDEALS · BONDS · FLAWS</span>
          <span class="text-base transition-transform" :class="showPersonality ? '' : '-rotate-90'">▾</span>
        </button>
        <div v-if="showPersonality" class="px-3 pb-3 space-y-2">
          <label class="block">
            <span class="field-label">Personality Traits</span>
            <textarea v-model="f.personality_traits" rows="2" class="field-input w-full resize-y"
              placeholder="Two short traits that shape their behaviour." />
          </label>
          <label class="block">
            <span class="field-label">Ideals</span>
            <textarea v-model="f.ideals" rows="2" class="field-input w-full resize-y"
              placeholder="What drives them — justice, freedom, knowledge…" />
          </label>
          <label class="block">
            <span class="field-label">Bonds</span>
            <textarea v-model="f.bonds" rows="2" class="field-input w-full resize-y"
              placeholder="People, places, or artifacts they'd die for." />
          </label>
          <label class="block">
            <span class="field-label">Flaws</span>
            <textarea v-model="f.flaws" rows="2" class="field-input w-full resize-y"
              placeholder="One clear weakness that gets them in trouble." />
          </label>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">BACKSTORY &amp; NOTES</p>
        <RichTextEditor v-model="f.notes" placeholder="Background, goals, secrets…" min-height="80px" />
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Step 3: Class + Proficiencies                                          -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div v-else-if="wizardStep === 3" class="space-y-4">
      <p class="font-fell text-sm text-muted-foreground italic">
        Choose your class. Saving throw proficiencies are set automatically. Fine-tune skills in the collapsible below.
      </p>

      <!-- Class picker -->
      <div v-if="!mergedClasses.length" class="rounded-lg border border-border bg-card p-6 text-center">
        <p class="font-fell text-sm text-muted-foreground italic">No classes available — skip for now.</p>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button v-for="cls in mergedClasses" :key="cls.class_name" type="button"
          class="rounded-lg border overflow-hidden text-left transition-all p-3"
          :class="f.class === cls.class_name ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'"
          @click="onClassSelect(cls.class_name)">
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-sm font-bold text-foreground">{{ cls.class_name }}</p>
              <p v-if="cls.primary_ability" class="font-fell text-xs text-muted-foreground mt-0.5">{{ cls.primary_ability }}</p>
            </div>
            <span class="shrink-0 px-2 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground">d{{ cls.hit_die }}</span>
          </div>
          <div v-if="cls.saving_throws?.length" class="mt-1.5 flex flex-wrap gap-1">
            <span v-for="st in cls.saving_throws" :key="st"
              class="px-1.5 py-0.5 rounded bg-muted/60 font-cinzel text-[9px] text-muted-foreground uppercase">{{ st }}</span>
          </div>
        </button>
      </div>

      <p v-if="f.class" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
        ✓ {{ f.class }} selected — subclass unlocked through levelling
      </p>

      <!-- Proficiencies (collapsible) -->
      <div class="rounded-lg border border-border bg-card">
        <button type="button"
          class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="showProfs = !showProfs">
          <span>PROFICIENCIES — SKILLS · SAVES · TOOLS · LANGUAGES</span>
          <span class="text-base transition-transform" :class="showProfs ? '' : '-rotate-90'">▾</span>
        </button>
        <div v-if="showProfs" class="px-3 pb-3 space-y-4">

          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">SAVING THROWS</p>
            <div class="grid grid-cols-3 gap-2">
              <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" :checked="f.saving_throw_proficiencies.includes(save.key)"
                  class="rounded" @change="toggleSave(save.key)" />
                <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground">{{ saveBonus(save.key) }}</span>
              </label>
            </div>
          </div>

          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">SKILLS</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
                <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
                  <button v-for="level in PROF_LEVELS" :key="level.value" type="button"
                    class="px-1.5 py-0.5 transition-colors"
                    :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:text-foreground'"
                    @click="setSkillProf(skill.key, level.value)">{{ level.label }}</button>
                </div>
                <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ skillBonus(skill.key, skill.ability) }}</span>
              </div>
            </div>
          </div>

          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">TOOL PROFICIENCIES</p>
            <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS"
              placeholder="Search tools…" variant="primary" @update:model-value="f.tool_proficiencies = $event" />
          </div>

          <div>
            <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">LANGUAGES</p>
            <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS"
              placeholder="Search languages…" @update:model-value="f.languages = $event" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Step 4: Done — derived stats summary + save                           -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div v-else-if="wizardStep === 4" class="space-y-4">
      <p class="font-fell text-sm text-muted-foreground italic">
        {{ isEditMode ? 'Review your changes before saving.' : 'All set! Stats are derived from your choices — no magic numbers.' }}
      </p>

      <!-- Summary card -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">

        <!-- Header -->
        <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-3">
          <div v-if="portraitUrl" class="w-10 h-10 rounded-full overflow-hidden shrink-0">
            <FocalImage :src="portraitUrl" :alt="f.name" format="portrait" :focal-point="focalPoint" />
          </div>
          <div>
            <p class="font-cinzel text-base font-bold text-foreground">{{ f.name || '—' }}</p>
            <p class="font-fell text-xs text-muted-foreground">
              Level {{ isEditMode ? f.level : 1 }}
              {{ [selectedSpecies?.name, f.class].filter(Boolean).join(' ') }}
              {{ f.subrace ? `(${f.subrace})` : '' }}
            </p>
          </div>
        </div>

        <!-- Ability scores -->
        <div class="px-4 pt-3 pb-2 grid grid-cols-6 gap-2">
          <div v-for="stat in ABILITY_STATS" :key="stat.key" class="text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">{{ stat.label }}</p>
            <p class="font-cinzel text-sm font-bold">{{ displayScore(stat.key) }}</p>
            <p class="font-cinzel text-[10px]" :class="totalMod(stat.key) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ totalMod(stat.key) >= 0 ? '+' : '' }}{{ totalMod(stat.key) }}
            </p>
          </div>
        </div>

        <!-- Derived combat stats (new chars only) -->
        <div v-if="!isEditMode" class="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="rounded-md bg-muted/40 p-2 text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">MAX HP</p>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedHp ?? '—' }}</p>
            <p v-if="selectedClass" class="font-cinzel text-[9px] text-muted-foreground">d{{ selectedClass.hit_die }} + CON</p>
            <p v-else class="font-cinzel text-[9px] text-muted-foreground">pick a class</p>
          </div>
          <div class="rounded-md bg-muted/40 p-2 text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">ARMOR CLASS</p>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedAc }}</p>
            <p class="font-cinzel text-[9px] text-muted-foreground">10 + DEX</p>
          </div>
          <div class="rounded-md bg-muted/40 p-2 text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">SPEED</p>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedSpeed }} ft</p>
            <p class="font-cinzel text-[9px] text-muted-foreground">{{ selectedSpecies?.name ?? 'base' }}</p>
          </div>
          <div class="rounded-md bg-muted/40 p-2 text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">INITIATIVE</p>
            <p class="font-cinzel text-lg font-bold text-foreground">{{ derivedInitiative >= 0 ? '+' : '' }}{{ derivedInitiative }}</p>
            <p class="font-cinzel text-[9px] text-muted-foreground">DEX mod</p>
          </div>
        </div>

        <!-- Choices summary row -->
        <div v-if="selectedBg || f.alignment" class="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1">
          <div v-if="selectedBg" class="flex items-center gap-1">
            <span class="font-cinzel text-[9px] text-muted-foreground tracking-wider">BG</span>
            <span class="font-fell text-xs text-foreground">{{ selectedBg.name }}</span>
          </div>
          <div v-if="f.alignment" class="flex items-center gap-1">
            <span class="font-cinzel text-[9px] text-muted-foreground tracking-wider">ALIGN</span>
            <span class="font-fell text-xs text-foreground">{{ f.alignment }}</span>
          </div>
        </div>

        <!-- Spell slots (if class is a caster) -->
        <div v-if="spellSlotMaxes.some(v => v > 0)" class="px-4 pb-3">
          <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider mb-1.5">SPELL SLOTS</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="(max, idx) in spellSlotMaxes" v-show="max > 0" :key="idx"
              class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[10px] text-primary">
              {{ SLOT_LEVEL_LABELS[idx] }}: {{ max }}
            </span>
          </div>
        </div>
      </div>

      <!-- Warning: no class selected -->
      <div v-if="!f.class" class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <span class="text-amber-500 shrink-0 mt-0.5">⚡</span>
        <p class="font-fell text-sm text-amber-700 dark:text-amber-400">
          No class selected — HP will default to 8. You can set your class later via the Edit screen.
        </p>
      </div>

      <!-- Save actions -->
      <div v-if="!isEditMode" class="flex flex-col sm:flex-row items-stretch gap-3">
        <button type="button"
          :disabled="!f.name.trim() || saving"
          class="flex-1 px-4 py-3 font-cinzel text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save(false)">
          {{ saving ? 'Creating…' : 'Begin My Adventure' }}
        </button>
        <button type="button"
          :disabled="!f.name.trim() || saving"
          class="flex-1 px-4 py-3 font-cinzel text-sm font-semibold border border-primary text-primary rounded-md hover:bg-primary/5 transition-colors disabled:opacity-50"
          @click="save(true)">
          Begin + Level Up to 2
        </button>
      </div>
      <div v-else>
        <button type="button"
          :disabled="!f.name.trim() || saving"
          class="w-full px-4 py-3 font-cinzel text-sm font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save(false)">
          {{ saving ? 'Saving…' : 'Save Character' }}
        </button>
      </div>
    </div>

    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <!-- Footer nav (not shown on Done step — actions are inline there)        -->
    <!-- ─────────────────────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between pt-2 border-t border-border">
      <!-- Back / Cancel -->
      <button v-if="wizardStep > 0" type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
        @click="wizardStep--">
        ← Back
      </button>
      <button v-else type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
        @click="router.push(backRoute)">
        Cancel
      </button>

      <!-- Next / Skip (hidden on Done step) -->
      <div v-if="wizardStep < WIZARD_STEPS.length - 1" class="flex items-center gap-2">
        <button type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          @click="wizardStep++">
          Skip
        </button>
        <button type="button"
          :disabled="wizardStep === 0 && !f.name.trim()"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="wizardStep++">
          Next →
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { inject, ref, reactive, computed } from "vue";
import {
  CHARACTER_FORM_KEY, WIZARD_STEPS,
  ABILITY_STATS, SAVE_STATS, PROF_LEVELS, SCORE_MODES,
  SLOT_LEVEL_LABELS, POINT_BUY_COSTS, STANDARD_ARRAY,
  roll4d6DropLowest,
} from "@/composables/useCharacterCreationForm";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import ImageUpload from "@/components/common/ImageUpload.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const {
  router, auth, f,
  wizardStep, saving, scoreMode,
  portraitUrl, focalPoint, spellSlotMaxes,
  backRoute,
  isEditMode,
  allSpecies, allBackgrounds,
  selectedSpecies, subraceOptions,
  selectedClass, selectedBg, selectedSubrace,
  mergedClasses,
  asiMode, customAsi, customAsiTotal, adjustCustomAsi,
  derivedHp, derivedAc, derivedSpeed, derivedInitiative,
  pointsRemaining,
  mod, setSkillProf, skillBonus, toggleSave, saveBonus,
  onSpeciesSelect, onClassSelect, onBackgroundSelect,
  importBackgroundEquipment,
  save,
} = form;

// ── Species ASI format detection ─────────────────────────────────────────────
// ASI can be { dex: 2, str: 1 } (structured) or { description: "+2 DEX" } (free-text).
// Both base and selected subrace ASIs are considered.
// Structured = can be auto-applied and shown inline in score cards.
function isStructuredAsi(asi: Record<string, number | string> | null | undefined): boolean {
  if (!asi) return true; // null = no bonus = no problem
  if ("description" in asi) return false;
  return Object.values(asi).every(v => typeof v === "number");
}

const asiIsStructured = computed(() =>
  isStructuredAsi(selectedSpecies.value?.ability_score_increases) &&
  isStructuredAsi(selectedSubrace.value?.ability_score_increases),
);

// Maps ability key → total racial bonus (base + subrace) when ASI is structured.
// Used to show bonuses inline in score cards and compute total modifiers.
const racialBonusMap = computed((): Partial<Record<AbilityKey, number>> => {
  if (!asiIsStructured.value || asiMode.value !== "bonus") return {};
  const abilityKeyMap: Record<string, AbilityKey> = {
    str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
    strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
  };
  const map: Partial<Record<AbilityKey, number>> = {};
  const addAsi = (asi: Record<string, number | string>) => {
    for (const [k, v] of Object.entries(asi)) {
      const fk = abilityKeyMap[k.toLowerCase()];
      if (fk && typeof v === "number") map[fk] = (map[fk] ?? 0) + v;
    }
  };
  const base = selectedSpecies.value?.ability_score_increases;
  if (base && !("description" in base)) addAsi(base);
  const sub = selectedSubrace.value?.ability_score_increases;
  if (sub && !("description" in sub)) addAsi(sub);
  return map;
});

// Displayed score: base + racial bonus (when in Bonus mode with structured ASI)
function displayScore(key: AbilityKey): number {
  return f[key] + (racialBonusMap.value[key] ?? 0);
}

// Modifier based on total score (including racial bonus in Bonus mode)
function totalMod(key: AbilityKey): number {
  return mod(displayScore(key));
}

// Human-readable description text when ASI is free-text format
const asiDescriptionText = computed((): string => {
  const parts: string[] = [];
  const baseAsi = selectedSpecies.value?.ability_score_increases;
  if (baseAsi) {
    if ("description" in baseAsi && typeof baseAsi.description === "string") parts.push(baseAsi.description as string);
    else parts.push(...Object.entries(baseAsi).map(([k, v]) => `${k.toUpperCase()} +${v}`));
  }
  const subAsi = selectedSubrace.value?.ability_score_increases;
  if (subAsi) {
    if ("description" in subAsi && typeof subAsi.description === "string") parts.push(`${f.subrace}: ${subAsi.description}`);
    else parts.push(...Object.entries(subAsi).map(([k, v]) => `${f.subrace}: ${k.toUpperCase()} +${v}`));
  }
  return parts.join(", ");
});

// ── Collapsible section state ─────────────────────────────────────────────────
const showIdentity    = ref(false);
const showPersonality = ref(false);
const showProfs       = ref(false);

const ALIGNMENT_OPTIONS = [
  "Lawful Good",    "Neutral Good",    "Chaotic Good",
  "Lawful Neutral", "True Neutral",    "Chaotic Neutral",
  "Lawful Evil",    "Neutral Evil",    "Chaotic Evil",
  "Unaligned",
] as const;

// ── Ability score assignment: standard array + 4d6 ───────────────────────────
type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

/** The pool of six values for array / roll modes. */
const scorePool = ref<number[]>([]);

/** Which pool index is assigned to each ability. */
const scoreAssignment = reactive<Record<AbilityKey, number | null>>({
  str: null, dex: null, con: null, int: null, wis: null, cha: null,
});

function resetPool(values: readonly number[]) {
  scorePool.value = [...values];
  for (const k of Object.keys(scoreAssignment) as AbilityKey[]) {
    scoreAssignment[k] = null;
    f[k] = 8;
  }
}

function rollAbilityScores() {
  const rolled = Array.from({ length: 6 }, () => roll4d6DropLowest()).sort((a, b) => b - a);
  resetPool(rolled);
}

function availableForAbility(abilityKey: AbilityKey): { idx: number; val: number }[] {
  const takenIdxs = new Set<number>();
  for (const k of Object.keys(scoreAssignment) as AbilityKey[]) {
    if (k !== abilityKey && scoreAssignment[k] !== null) takenIdxs.add(scoreAssignment[k]!);
  }
  return scorePool.value.map((val, idx) => ({ idx, val })).filter((e) => !takenIdxs.has(e.idx));
}

function onPoolPick(abilityKey: AbilityKey, poolIdxStr: string) {
  if (poolIdxStr === "") {
    scoreAssignment[abilityKey] = null;
    f[abilityKey] = 8;
    return;
  }
  const idx = Number(poolIdxStr);
  scoreAssignment[abilityKey] = idx;
  f[abilityKey] = scorePool.value[idx] ?? 8;
}

function onScoreModeChange(mode: typeof SCORE_MODES[number]["id"]) {
  scoreMode.value = mode;
  if (mode === "array" && scorePool.value.length === 0) resetPool(STANDARD_ARRAY);
  if (mode === "roll" && scorePool.value.length === 0) rollAbilityScores();
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
