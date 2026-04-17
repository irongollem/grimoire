<template>
  <div class="max-w-2xl mx-auto pb-8 space-y-6">
    <!-- Step header -->
    <div>
      <h1 class="font-cinzel text-xl font-bold text-foreground">Create Your Character</h1>
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

    <!-- Step 0: Identity -->
    <div v-if="wizardStep === 0" class="space-y-4">
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
          <label class="block">
            <span class="field-label">Level</span>
            <input v-model.number="f.level" type="number" min="1" max="20" class="field-input w-full" />
          </label>
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <span class="field-label">Card Art <span class="font-fell normal-case font-normal italic text-muted-foreground">(landscape, for card printing)</span></span>
        <ImageUpload :model-value="cardArtUrl || null" aspect="landscape" placeholder="Drop card art or click to upload" @update:model-value="cardArtUrl = $event ?? ''" />
      </div>

      <!-- Alignment + deity (optional, inline) -->
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="field-label">Alignment</span>
          <select v-model="f.alignment" class="field-input w-full">
            <option value="">—</option>
            <option v-for="a in ALIGNMENT_OPTIONS" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="block">
          <span class="field-label">Deity <span class="font-fell normal-case font-normal italic text-muted-foreground">(if any)</span></span>
          <input v-model="f.deity" class="field-input w-full" placeholder="Tyr, Mielikki, none…" />
        </label>
      </div>

      <!-- Personality block (collapsible) -->
      <div class="rounded-lg border border-border bg-card">
        <button
          type="button"
          class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          @click="showPersonality = !showPersonality"
        >
          <span>PERSONALITY · IDEALS · BONDS · FLAWS</span>
          <span class="text-base" :class="showPersonality ? '' : 'rotate-[-90deg]'">▾</span>
        </button>
        <div v-if="showPersonality" class="px-3 pb-3 space-y-2">
          <label class="block">
            <span class="field-label">Personality Traits</span>
            <textarea v-model="f.personality_traits" rows="2" class="field-input w-full resize-y" placeholder="Two short traits that shape their behaviour." />
          </label>
          <label class="block">
            <span class="field-label">Ideals</span>
            <textarea v-model="f.ideals" rows="2" class="field-input w-full resize-y" placeholder="What drives them — justice, freedom, knowledge…" />
          </label>
          <label class="block">
            <span class="field-label">Bonds</span>
            <textarea v-model="f.bonds" rows="2" class="field-input w-full resize-y" placeholder="People, places, or artifacts they'd die for." />
          </label>
          <label class="block">
            <span class="field-label">Flaws</span>
            <textarea v-model="f.flaws" rows="2" class="field-input w-full resize-y" placeholder="One clear weakness that gets them in trouble." />
          </label>
        </div>
      </div>

      <!-- Identity extras (collapsible) -->
      <details class="rounded-lg border border-border bg-card overflow-hidden">
        <summary class="cursor-pointer px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
          Details — age, gender, pronouns, description
        </summary>
        <div class="p-3 space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <label class="block">
              <span class="field-label">Age</span>
              <input v-model="f.age" class="field-input w-full" placeholder="47, ancient…" />
            </label>
            <label class="block">
              <span class="field-label">Gender</span>
              <input v-model="f.gender" class="field-input w-full" placeholder="" />
            </label>
            <label class="block">
              <span class="field-label">Pronouns</span>
              <input v-model="f.pronouns" class="field-input w-full" placeholder="she/her" />
            </label>
          </div>
          <label class="block">
            <span class="field-label">Physical Description</span>
            <textarea v-model="f.physical_description" class="field-input w-full resize-y" rows="2" placeholder="Hair, build, scars, anything that helps the table picture them." />
          </label>
        </div>
      </details>
    </div>

    <!-- Step 1: Species -->
    <div v-else-if="wizardStep === 1" class="space-y-3">
      <p class="font-fell text-sm text-muted-foreground italic">Choose your character's species. This determines racial traits and may grant bonuses.</p>

      <div v-if="!allSpecies?.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">No species in the campaign yet. Ask your DM to add some, or skip.</p>
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
                {{ sp.traits.slice(0, 3).map((t) => t.name).join(" · ") }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span v-if="sp.size" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[9px] text-muted-foreground capitalize">{{ sp.size }}</span>
              <span v-if="sp.subraces?.length" class="font-cinzel text-[9px] text-muted-foreground/60">{{ sp.subraces.length }} variant{{ sp.subraces.length > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </button>
      </div>

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
        ✓ {{ f.race }} selected{{ f.subrace ? ` — ${f.subrace}` : '' }}
      </p>
    </div>

    <!-- Step 2: Class -->
    <div v-else-if="wizardStep === 2" class="space-y-3">
      <p class="font-fell text-sm text-muted-foreground italic">Choose your class. This determines your combat abilities, features, and spell progression.</p>

      <div v-if="!mergedClasses.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">No classes in the campaign yet. Ask your DM to add some, or skip.</p>
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

      <div v-if="f.class && subclassOptions.length > 0" class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">SUBCLASS (OPTIONAL)</p>
        <div class="flex flex-wrap gap-2">
          <button v-for="sc in subclassOptions" :key="sc" type="button"
            class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold transition-colors"
            :class="f.subclass === sc ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'"
            @click="f.subclass = f.subclass === sc ? '' : sc">
            {{ sc }}
          </button>
        </div>
      </div>

      <p v-if="f.class" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
        ✓ {{ f.class }} selected{{ f.subclass ? ` — ${f.subclass}` : '' }}
      </p>
    </div>

    <!-- Step 3: Background -->
    <div v-else-if="wizardStep === 3" class="space-y-3">
      <p class="font-fell text-sm text-muted-foreground italic">Choose your background. This grants skill proficiencies, languages, and a unique feature.</p>

      <div v-if="!allBackgrounds?.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">No backgrounds in the campaign yet. Ask your DM to add some, or skip.</p>
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

      <!-- Selected background's equipment + import opt-in -->
      <div v-if="selectedBackground?.equipment" class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p class="font-cinzel text-xs font-semibold text-primary tracking-wider">STARTING EQUIPMENT</p>
        <p class="font-fell text-sm text-foreground whitespace-pre-wrap">{{ selectedBackground.equipment }}</p>
        <label class="flex items-start gap-2 cursor-pointer pt-1">
          <input type="checkbox" v-model="importBackgroundEquipment" class="mt-0.5 h-4 w-4 rounded border-border bg-muted" />
          <span class="font-fell text-xs text-muted-foreground">
            Add these to my inventory automatically. Each comma-separated entry becomes a freeform inventory row you can refine in <em>/play/inventory</em>.
          </span>
        </label>
      </div>

      <p v-if="f.background_id" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
        ✓ {{ f.background }} selected
      </p>
    </div>

    <!-- Step 4: Ability Scores -->
    <div v-else-if="wizardStep === 4" class="space-y-4">
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
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">ASSIGN ABILITY SCORES</p>
          <div class="flex items-center gap-2">
            <span class="font-cinzel text-xs text-muted-foreground">Points remaining:</span>
            <span class="font-cinzel text-sm font-bold" :class="pointsRemaining < 0 ? 'text-destructive' : pointsRemaining === 0 ? 'text-green-500' : 'text-primary'">
              {{ pointsRemaining }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div v-for="stat in ABILITY_STATS" :key="stat.key" class="rounded-lg border border-border bg-card p-3 flex flex-col items-center gap-2">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <div class="flex items-center gap-2">
              <button type="button"
                class="w-6 h-6 rounded-full border border-border font-cinzel text-sm font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                :disabled="f[stat.key] <= 8"
                @click="f[stat.key]--">−</button>
              <span class="font-cinzel text-lg font-bold w-6 text-center">{{ f[stat.key] }}</span>
              <button type="button"
                class="w-6 h-6 rounded-full border border-border font-cinzel text-sm font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                :disabled="f[stat.key] >= 15 || pointsRemaining <= 0 || (pointsRemaining < (POINT_BUY_COSTS[f[stat.key] + 1] ?? 99) - POINT_BUY_COSTS[f[stat.key]])"
                @click="f[stat.key]++">+</button>
            </div>
            <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
            </span>
            <span class="font-cinzel text-[9px] text-muted-foreground">{{ POINT_BUY_COSTS[f[stat.key]] ?? 0 }} pts</span>
          </div>
        </div>

        <div v-if="selectedSpecies?.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length"
          class="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p class="font-cinzel text-[10px] font-semibold text-primary tracking-wider mb-1.5">{{ selectedSpecies.name.toUpperCase() }} BONUSES (applied at creation)</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="(val, key) in selectedSpecies.ability_score_increases" :key="key"
              class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[11px] text-primary uppercase">
              {{ key }} +{{ val }}
            </span>
          </div>
        </div>
      </div>

      <!-- Standard Array / 4d6 pool-assignment -->
      <div v-else-if="scoreMode === 'array' || scoreMode === 'roll'" class="space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <p class="font-fell text-sm text-muted-foreground italic">
            <template v-if="scoreMode === 'array'">
              Assign the standard array (15, 14, 13, 12, 10, 8) to your abilities.
            </template>
            <template v-else>
              Each score is 4d6 with the lowest die dropped. Reroll until you like the pool, then assign.
            </template>
          </p>
          <button
            v-if="scoreMode === 'roll'"
            type="button"
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wider hover:opacity-90 transition-opacity"
            @click="rollAbilityScores"
          >Reroll Pool</button>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap rounded-md border border-border bg-card px-3 py-2">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider mr-1">POOL</span>
          <span
            v-for="(val, idx) in scorePool"
            :key="idx"
            class="w-9 h-9 rounded-md border font-cinzel text-sm font-bold flex items-center justify-center transition-colors"
            :class="Object.values(scoreAssignment).includes(idx)
              ? 'border-primary/30 bg-primary/10 text-primary/60 line-through'
              : 'border-border bg-muted/50 text-foreground'"
          >{{ val }}</span>
          <span v-if="scorePool.length === 0" class="font-fell text-xs text-muted-foreground italic">No pool loaded.</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div v-for="stat in ABILITY_STATS" :key="stat.key" class="rounded-lg border border-border bg-card p-3 flex flex-col items-center gap-2">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <select
              :value="scoreAssignment[stat.key] ?? ''"
              class="field-input w-full text-center"
              @change="onPoolPick(stat.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">—</option>
              <option v-for="opt in availableForAbility(stat.key)" :key="opt.idx" :value="opt.idx">{{ opt.val }}</option>
            </select>
            <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
            </span>
          </div>
        </div>

        <div v-if="selectedSpecies?.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length"
          class="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p class="font-cinzel text-[10px] font-semibold text-primary tracking-wider mb-1.5">{{ selectedSpecies.name.toUpperCase() }} BONUSES (applied at creation)</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="(val, key) in selectedSpecies.ability_score_increases" :key="key"
              class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[11px] text-primary uppercase">
              {{ key }} +{{ val }}
            </span>
          </div>
        </div>
      </div>

      <!-- Manual Entry -->
      <div v-else class="space-y-3">
        <p class="font-fell text-sm text-muted-foreground italic">Enter your rolled or assigned scores directly.</p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
            <input v-model.number="f[stat.key]" type="number" min="1" max="30" class="field-input w-full text-center px-1" />
            <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
            </span>
          </label>
        </div>
      </div>
    </div>

    <!-- Step 5: Combat Stats -->
    <div v-else-if="wizardStep === 5" class="space-y-4">
      <p class="font-fell text-sm text-muted-foreground italic">Set your starting HP, AC, and speed. Suggestions are based on your class and ability scores.</p>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block">
          <span class="field-label">Max HP</span>
          <input v-model.number="f.max_hp" type="number" min="1" class="field-input w-full" />
          <p v-if="suggestedHp" class="font-cinzel text-[9px] text-muted-foreground mt-0.5">Suggested: {{ suggestedHp }}</p>
        </label>
        <label class="block">
          <span class="field-label">Armor Class</span>
          <input v-model.number="f.ac" type="number" min="1" class="field-input w-full" />
          <p class="font-cinzel text-[9px] text-muted-foreground mt-0.5">Unarmored: {{ 10 + mod(f.dex) }}</p>
        </label>
        <label class="block">
          <span class="field-label">Speed (ft)</span>
          <input v-model.number="f.speed" type="number" min="0" step="5" class="field-input w-full" />
          <p v-if="selectedSpecies?.speed?.walk" class="font-cinzel text-[9px] text-muted-foreground mt-0.5">{{ selectedSpecies.name }}: {{ selectedSpecies.speed.walk }} ft</p>
        </label>
        <label class="block">
          <span class="field-label">Initiative Bonus</span>
          <input v-model.number="f.initiative_bonus" type="number" class="field-input w-full" />
          <p class="font-cinzel text-[9px] text-muted-foreground mt-0.5">= DEX {{ mod(f.dex) >= 0 ? '+' : '' }}{{ mod(f.dex) }}</p>
        </label>
      </div>

      <div class="flex items-center justify-between">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Spell Slots</p>
        <button type="button" class="font-cinzel text-[10px] tracking-wider text-primary/70 hover:text-primary transition-colors" @click="resetSlotsToDefault">Reset to class defaults</button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="lvl in 9" :key="lvl" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
          <input v-model.number="spellSlotMaxes[lvl - 1]" type="number" min="0" max="9" class="field-input w-full text-center px-1" />
        </label>
      </div>
    </div>

    <!-- Step 6: Proficiencies -->
    <div v-else-if="wizardStep === 6" class="space-y-4">
      <p class="font-fell text-sm text-muted-foreground italic">Proficiencies have been pre-filled from your class, background, and species. Adjust as needed.</p>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Saving Throw Proficiencies</p>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" :checked="f.saving_throw_proficiencies.includes(save.key)" class="rounded" @change="toggleSave(save.key)" />
          <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground">{{ saveBonus(save.key) }}</span>
        </label>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Skills</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
          <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
            <button v-for="level in PROF_LEVELS" :key="level.value" type="button"
              class="px-1.5 py-0.5 transition-colors"
              :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="setSkillProf(skill.key, level.value)">{{ level.label }}</button>
          </div>
          <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ skillBonus(skill.key, skill.ability) }}</span>
        </div>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-4">Tool Proficiencies</p>
      <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" variant="primary" @update:model-value="f.tool_proficiencies = $event" />

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">Languages</p>
      <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" @update:model-value="f.languages = $event" />

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">Notes / Backstory</p>
      <RichTextEditor v-model="f.notes" placeholder="Background, personality, goals…" min-height="100px" />
    </div>

    <!-- Step 7: Review -->
    <div v-else-if="wizardStep === 7" class="space-y-4">
      <p class="font-fell text-sm text-muted-foreground italic">Review your character before creating.</p>

      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-3">
          <div v-if="portraitUrl" class="w-10 h-10 rounded-full overflow-hidden shrink-0">
            <img :src="portraitUrl" class="w-full h-full object-cover" :alt="f.name" />
          </div>
          <div>
            <p class="font-cinzel text-base font-bold text-foreground">{{ f.name || "—" }}</p>
            <p class="font-fell text-xs text-muted-foreground">Level {{ f.level }} {{ [f.race, f.class].filter(Boolean).join(" ") }}</p>
          </div>
        </div>
        <div class="p-4 grid grid-cols-2 gap-3">
          <div v-if="f.race"><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">SPECIES</p><p class="font-fell text-sm">{{ f.race }}{{ f.subrace ? ` (${f.subrace})` : '' }}</p></div>
          <div v-if="f.class"><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">CLASS</p><p class="font-fell text-sm">{{ f.class }}{{ f.subclass ? ` — ${f.subclass}` : '' }}</p></div>
          <div v-if="f.background"><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">BACKGROUND</p><p class="font-fell text-sm">{{ f.background }}</p></div>
          <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP / AC</p><p class="font-fell text-sm">{{ f.max_hp }} HP · AC {{ f.ac }}</p></div>
        </div>
        <div class="px-4 pb-4 grid grid-cols-6 gap-2">
          <div v-for="stat in ABILITY_STATS" :key="stat.key" class="text-center">
            <p class="font-cinzel text-[9px] text-muted-foreground tracking-wider">{{ stat.label }}</p>
            <p class="font-cinzel text-sm font-bold">{{ f[stat.key] }}</p>
            <p class="font-cinzel text-[10px]" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
              {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="f.level > 1" class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <span class="text-amber-500 mt-0.5">⚡</span>
        <p class="font-fell text-sm text-amber-700 dark:text-amber-400">
          Your character starts at level {{ f.level }}. After creating, you'll be guided through the Level Up tool to choose features, spells, and abilities for each level.
        </p>
      </div>
    </div>

    <!-- Wizard footer nav -->
    <div class="flex items-center justify-between pt-2 border-t border-border">
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

      <div class="flex items-center gap-2">
        <button v-if="wizardStep < WIZARD_STEPS.length - 1" type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          @click="wizardStep++">
          Skip
        </button>
        <button v-if="wizardStep < WIZARD_STEPS.length - 1" type="button"
          :disabled="wizardStep === 0 && !f.name.trim()"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="wizardStep++">
          Next →
        </button>
        <button v-else type="button"
          :disabled="!f.name.trim() || saving"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save">
          {{ saving ? "Creating…" : "Create Character" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, reactive, computed } from "vue";
import { CHARACTER_FORM_KEY, WIZARD_STEPS, ABILITY_STATS, SAVE_STATS, PROF_LEVELS, SCORE_MODES, SLOT_LEVEL_LABELS, POINT_BUY_COSTS, STANDARD_ARRAY, roll4d6DropLowest } from "@/composables/useCharacterCreationForm";
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
  portraitUrl, focalPoint, cardArtUrl, spellSlotMaxes,
  backRoute,
  allSpecies, allBackgrounds,
  selectedSpecies, subraceOptions,
  mergedClasses, subclassOptions,
  pointsRemaining, suggestedHp,
  mod, setSkillProf, skillBonus, toggleSave, saveBonus,
  resetSlotsToDefault, onSpeciesSelect, onClassSelect, onBackgroundSelect,
  save,
  importBackgroundEquipment,
} = form;

// ── Identity extras ──────────────────────────────────────────────────────────
const showPersonality = ref(false);

const ALIGNMENT_OPTIONS = [
  "Lawful Good",    "Neutral Good",    "Chaotic Good",
  "Lawful Neutral", "True Neutral",    "Chaotic Neutral",
  "Lawful Evil",    "Neutral Evil",    "Chaotic Evil",
  "Unaligned",
] as const;

const selectedBackground = computed(() =>
  (allBackgrounds.value ?? []).find((b: { id: string }) => b.id === f.background_id) ?? null,
);

// ── Ability score assignment: standard array + 4d6 ───────────────────────────
type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

/** The immutable pool of six values for the current mode (standard array or roll). */
const scorePool = ref<number[]>([]);

/** Which pool index is assigned to each ability. null = unassigned. */
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

function loadStandardArray() { resetPool(STANDARD_ARRAY); }

function rollAbilityScores() {
  const rolled = Array.from({ length: 6 }, () => roll4d6DropLowest()).sort((a, b) => b - a);
  resetPool(rolled);
}

function availableForAbility(abilityKey: AbilityKey): { idx: number; val: number }[] {
  const takenIdxs = new Set<number>();
  for (const k of Object.keys(scoreAssignment) as AbilityKey[]) {
    if (k !== abilityKey && scoreAssignment[k] !== null) takenIdxs.add(scoreAssignment[k]!);
  }
  return scorePool.value
    .map((val, idx) => ({ idx, val }))
    .filter((e) => !takenIdxs.has(e.idx));
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
  if (mode === "array" && scorePool.value.length === 0) loadStandardArray();
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
