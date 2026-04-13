<template>
  <!-- ═══ EDIT MODE — tabbed form ═══ -->
  <div v-if="isEditMode" class="max-w-2xl mx-auto space-y-6 pb-8">
    <div>
      <h1 class="font-cinzel text-xl font-bold text-foreground">
        Edit {{ existingMember?.name ?? "Character" }}
      </h1>
      <p class="font-fell text-sm text-muted-foreground italic mt-1">Update your hero's details below.</p>
    </div>

    <div class="flex border-b border-border">
      <button v-for="tab in EDIT_TABS" :key="tab.id" type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="activeTab === tab.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </div>

    <!-- Identity -->
    <div v-if="activeTab === 'identity'" class="space-y-4">
      <div class="flex gap-4">
        <div class="w-28 shrink-0">
          <ImageUpload :model-value="portraitUrl || null" :focal-point="focalPoint" show-focal-point
            @update:model-value="portraitUrl = $event ?? ''" @update:focal-point="focalPoint = $event" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <label class="block">
            <span class="field-label">Character Name *</span>
            <input v-model="f.name" class="field-input w-full" placeholder="Aric Stormblade" />
          </label>
          <label class="block">
            <span class="field-label">Player Name</span>
            <input v-model="f.player_name" class="field-input w-full" :placeholder="auth.membership?.display_name ?? 'Your name'" />
          </label>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <span class="field-label">Card Art <span class="font-fell normal-case font-normal italic text-muted-foreground">(landscape, for card printing)</span></span>
        <ImageUpload :model-value="cardArtUrl || null" aspect="landscape" placeholder="Drop card art or click to upload" @update:model-value="cardArtUrl = $event ?? ''" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="block">
          <span class="field-label">Species</span>
          <EntityCombobox :model-value="f.species_id ?? ''" :options="speciesOptions" placeholder="Search species…"
            @update:model-value="onSpeciesSelect($event)" />
        </div>
        <div v-if="subraceOptions.length > 0" class="block">
          <span class="field-label">Variant</span>
          <select v-model="f.subrace" class="field-input w-full">
            <option value="">— None —</option>
            <option v-for="sr in subraceOptions" :key="sr" :value="sr">{{ sr }}</option>
          </select>
        </div>
        <label class="block">
          <span class="field-label">Class</span>
          <select v-model="f.class" class="field-input w-full" @change="f.subclass = ''">
            <option value="">— None —</option>
            <option v-for="c in allClassNames" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <div class="block">
          <span class="field-label">Subclass</span>
          <EntityCombobox v-if="subclassOptions.length > 0" :model-value="f.subclass ?? ''"
            :options="subclassOptions.map((n: string) => ({ id: n, name: n }))" placeholder="Choose subclass…"
            @update:model-value="f.subclass = $event" />
          <input v-else v-model="f.subclass" class="field-input w-full"
            :placeholder="f.class ? 'No subclasses defined yet' : 'Choose a class first'" :disabled="!f.class" />
        </div>
        <div class="block">
          <span class="field-label">Background</span>
          <EntityCombobox :model-value="f.background_id ?? ''" :options="backgroundOptions" placeholder="Search backgrounds…"
            @update:model-value="onBackgroundSelect($event)" />
        </div>
        <label class="block">
          <span class="field-label">Level</span>
          <input v-model.number="f.level" type="number" min="1" max="20" class="field-input w-full" />
        </label>
      </div>

      <div>
        <span class="field-label">Notes</span>
        <RichTextEditor v-model="f.notes" placeholder="Background, personality, goals…" min-height="120px" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="activeTab === 'stats'" class="space-y-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Ability Scores</p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
          <input v-model.number="f[stat.key]" type="number" min="1" max="30" class="field-input w-full text-center px-1" />
          <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
          </span>
        </label>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Combat</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block"><span class="field-label">Max HP</span><input v-model.number="f.max_hp" type="number" min="1" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Current HP</span><input v-model.number="f.current_hp" type="number" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Temp HP</span><input v-model.number="f.temp_hp" type="number" min="0" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Armor Class</span><input v-model.number="f.ac" type="number" min="1" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Speed (ft)</span><input v-model.number="f.speed" type="number" min="0" step="5" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Initiative Bonus</span><input v-model.number="f.initiative_bonus" type="number" class="field-input w-full" placeholder="= DEX mod" /></label>
        <label class="block"><span class="field-label">Carry Capacity Override</span><input v-model="f.carry_capacity_override" type="text" class="field-input w-full" placeholder="*2, +30, 150" /></label>
      </div>

      <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE PERC.</p><p class="font-cinzel text-base font-bold">{{ passivePerception }}</p></div>
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INS.</p><p class="font-cinzel text-base font-bold">{{ passiveInsight }}</p></div>
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INV.</p><p class="font-cinzel text-base font-bold">{{ passiveInvestigation }}</p></div>
      </div>

      <div class="flex items-center justify-between mt-2">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Spell Slots (Max per Level)</p>
        <button type="button" class="font-cinzel text-[10px] tracking-wider text-primary/70 hover:text-primary transition-colors" @click="resetSlotsToDefault">Reset to class defaults</button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="lvl in 9" :key="lvl" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
          <input v-model.number="spellSlotMaxes[lvl - 1]" type="number" min="0" max="9" class="field-input w-full text-center px-1" />
        </label>
      </div>
    </div>

    <!-- Proficiencies -->
    <div v-if="activeTab === 'profs'" class="space-y-4">
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
    </div>

    <div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <button type="button" class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors" @click="router.push(backRoute)">Cancel</button>
      <button type="button" :disabled="!f.name.trim() || saving"
        class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50" @click="save">
        {{ saving ? "Saving…" : "Save Changes" }}
      </button>
    </div>
  </div>

  <!-- ═══ CREATE MODE — step wizard ═══ -->
  <div v-else class="max-w-2xl mx-auto pb-8 space-y-6">
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
                {{ sp.traits.slice(0, 3).map(t => t.name).join(" · ") }}
              </p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span v-if="sp.size" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[9px] text-muted-foreground capitalize">{{ sp.size }}</span>
              <span v-if="sp.subraces?.length" class="font-cinzel text-[9px] text-muted-foreground/60">{{ sp.subraces.length }} variant{{ sp.subraces.length > 1 ? 's' : '' }}</span>
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

      <!-- Subclass -->
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

      <p v-if="f.background_id" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
        ✓ {{ f.background }} selected
      </p>
    </div>

    <!-- Step 4: Ability Scores -->
    <div v-else-if="wizardStep === 4" class="space-y-4">
      <!-- Mode toggle -->
      <div class="flex items-center gap-2 p-1 rounded-lg bg-muted w-fit">
        <button type="button" v-for="mode in SCORE_MODES" :key="mode.id"
          class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold transition-colors"
          :class="scoreMode === mode.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="scoreMode = mode.id">
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

        <!-- Species ASI preview -->
        <div v-if="selectedSpecies?.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length" class="rounded-lg border border-primary/20 bg-primary/5 p-3">
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
import { ref, reactive, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMembers, useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import { SKILLS } from "@/types/party.types";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllSpecies } from "@/composables/useSpecies";
import { useBackgrounds } from "@/composables/useBackgrounds";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import { getDefaultSpellSlots } from "@/types/spell.types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { PartyMemberInsert, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const EDIT_TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats",    label: "Stats" },
  { id: "profs",    label: "Proficiencies" },
] as const;

const WIZARD_STEPS = [
  { id: "identity",   label: "Identity" },
  { id: "species",    label: "Species" },
  { id: "class",      label: "Class" },
  { id: "background", label: "Background" },
  { id: "abilities",  label: "Abilities" },
  { id: "combat",     label: "Combat" },
  { id: "profs",      label: "Profs" },
  { id: "review",     label: "Review" },
] as const;

const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];
const SAVE_STATS = [
  { key: "str" as SaveKey, label: "Strength" },
  { key: "dex" as SaveKey, label: "Dexterity" },
  { key: "con" as SaveKey, label: "Constitution" },
  { key: "int" as SaveKey, label: "Intelligence" },
  { key: "wis" as SaveKey, label: "Wisdom" },
  { key: "cha" as SaveKey, label: "Charisma" },
];
const PROF_LEVELS: { value: SkillProfLevel; label: string }[] = [
  { value: "none",       label: "–" },
  { value: "proficient", label: "P" },
  { value: "expertise",  label: "E" },
];
const SCORE_MODES = [
  { id: "pointbuy" as const, label: "Point Buy" },
  { id: "manual"   as const, label: "Manual" },
];

// Point buy cost table (score → cost)
const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUY_TOTAL = 27;

const router = useRouter();
const route  = useRoute();
const auth   = useAuthStore();

const { data: allSpecies } = useAllSpecies();
const { data: allBackgrounds } = useBackgrounds();

const speciesOptions = computed(() => (allSpecies.value ?? []).map(s => ({ id: s.id, name: s.name })));
const backgroundOptions = computed(() => (allBackgrounds.value ?? []).map(b => ({ id: b.id, name: b.name })));
const selectedSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === f.species_id) ?? null);
const subraceOptions  = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses }  = useAllCustomClasses();
const { data: allSubclasses }  = useAllCustomSubclasses();

const mergedClasses = computed(() => {
  const byName = new Map<string, { class_name: string; hit_die: number; primary_ability: string | null; saving_throws: string[]; subclass_level: number; features: Record<string, string[]> }>();
  for (const c of systemClasses.value ?? []) byName.set(c.class_name, c);
  for (const c of customClasses.value  ?? []) { if (!byName.has(c.class_name)) byName.set(c.class_name, c); }
  return [...byName.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
});

const allClassNames = computed(() => mergedClasses.value.map(c => c.class_name));

const subclassOptions = computed(() => {
  if (!f.class) return [];
  return (allSubclasses.value ?? []).filter(sc => sc.class_name === f.class).map(sc => sc.subclass_name).sort();
});

const isEditMode = computed(() => route.name === "play-character-edit");
const { data: partyMembers }    = useParty();
const { data: campaignMembers } = useCampaignMembers();
const { mutateAsync: create }              = useCreatePartyMember();
const { mutateAsync: update }              = useUpdatePartyMember();
const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

const editMemberId = computed(() =>
  (route.query.memberId as string | undefined) ?? auth.linkedPartyMemberId ?? null,
);
const existingMember = computed(() =>
  editMemberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === editMemberId.value) ?? null)
    : null,
);
const backRoute = (route.query.memberId as string | undefined) ? "/party" : "/play";

const activeTab  = ref<"identity" | "stats" | "profs">("identity");
const wizardStep = ref(0);
const saving     = ref(false);
const scoreMode  = ref<"pointbuy" | "manual">("pointbuy");

const portraitUrl = ref(existingMember.value?.portrait_url ?? "");
const focalPoint  = ref<{ x: number; y: number } | null>(existingMember.value?.portrait_focal_point ?? null);
const cardArtUrl  = ref(existingMember.value?.card_art_url ?? "");

const m = existingMember.value;
const f = reactive<Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "card_art_url" | "spell_slots"> & { sort_order: number }>({
  campaign_id:   m?.campaign_id ?? null,
  name:          m?.name ?? "",
  player_name:   m?.player_name ?? auth.membership?.display_name ?? "",
  class:         m?.class ?? "",
  subclass:      m?.subclass ?? "",
  level:         m?.level ?? 1,
  race:          m?.race ?? "",
  subrace:       m?.subrace ?? "",
  species_id:    m?.species_id ?? null,
  background:    m?.background ?? "",
  background_id: m?.background_id ?? null,
  max_hp:        m?.max_hp ?? 10,
  current_hp:    m?.current_hp ?? 10,
  temp_hp:       m?.temp_hp ?? 0,
  ac:            m?.ac ?? 10,
  speed:         m?.speed ?? 30,
  initiative_bonus:   m?.initiative_bonus ?? 0,
  current_initiative: m?.current_initiative ?? null,
  str: m?.str ?? 8,
  dex: m?.dex ?? 8,
  con: m?.con ?? 8,
  int: m?.int ?? 8,
  wis: m?.wis ?? 8,
  cha: m?.cha ?? 8,
  proficiency_bonus:           m?.proficiency_bonus ?? 2,
  skill_proficiencies:         { ...m?.skill_proficiencies },
  saving_throw_proficiencies:  [...(m?.saving_throw_proficiencies ?? [])],
  conditions:   [...(m?.conditions ?? [])],
  inspiration:  m?.inspiration ?? false,
  death_save_successes: m?.death_save_successes ?? 0,
  death_save_failures:  m?.death_save_failures ?? 0,
  notes:       m?.notes ?? "",
  sort_order:  m?.sort_order ?? 0,
  curses:      [...(m?.curses ?? [])],
  pp: m?.pp ?? 0,
  gp: m?.gp ?? 0,
  ep: m?.ep ?? 0,
  sp: m?.sp ?? 0,
  cp: m?.cp ?? 0,
  tool_proficiencies:  [...(m?.tool_proficiencies ?? [])],
  languages:           [...(m?.languages ?? [])],
  current_location_id: m?.current_location_id ?? null,
  carry_capacity_override: m?.carry_capacity_override ?? null,
  class_resources: m?.class_resources ?? {},
  class_choices:   m?.class_choices ?? {},
});

// ── Point buy ────────────────────────────────────────────────────────────────
const totalSpent = computed(() =>
  ABILITY_STATS.reduce((sum, stat) => sum + (POINT_BUY_COSTS[f[stat.key]] ?? 0), 0),
);
const pointsRemaining = computed(() => POINT_BUY_TOTAL - totalSpent.value);

// ── Spell slots ───────────────────────────────────────────────────────────────
function buildSlotMaxes(): number[] {
  if (m?.spell_slots?.length) {
    return Array.from({ length: 9 }, (_, i) => m.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const defaults = getDefaultSpellSlots(m?.class ?? null, m?.level ?? 1);
  return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
}
const spellSlotMaxes = reactive<number[]>(buildSlotMaxes());

function resetSlotsToDefault() {
  const defaults = getDefaultSpellSlots(f.class || null, f.level);
  Array.from({ length: 9 }, (_, i) => { spellSlotMaxes[i] = defaults.find((s) => s.level === i + 1)?.max ?? 0; });
}
watch(() => f.class, () => { if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault(); });

// ── Species selection ─────────────────────────────────────────────────────────
function onSpeciesSelect(id: string) {
  const sp = (allSpecies.value ?? []).find(s => s.id === id);
  f.species_id = id || null;
  f.race = sp?.name ?? "";
  f.subrace = "";
  // Auto-add species languages to proficiencies
  if (sp?.languages?.length) {
    for (const lang of sp.languages) {
      if (!f.languages.includes(lang)) f.languages.push(lang);
    }
  }
  // Auto-apply speed from species
  if (sp?.speed?.walk) f.speed = sp.speed.walk;
}

// ── Class selection ───────────────────────────────────────────────────────────
function onClassSelect(className: string) {
  f.class = className;
  f.subclass = "";
  const cls = mergedClasses.value.find(c => c.class_name === className);
  if (cls?.saving_throws?.length) {
    f.saving_throw_proficiencies = [...cls.saving_throws] as SaveKey[];
  }
  resetSlotsToDefault();
}

// ── Background selection ──────────────────────────────────────────────────────
function onBackgroundSelect(id: string) {
  const bg = (allBackgrounds.value ?? []).find(b => b.id === id);
  f.background_id = id || null;
  f.background = bg?.name ?? "";
  if (!bg) return;
  // Auto-add skill proficiencies from background
  for (const skill of bg.skill_proficiencies ?? []) {
    const key = SKILLS.find(s => s.label.toLowerCase() === skill.toLowerCase())?.key;
    if (key && (f.skill_proficiencies[key] ?? "none") === "none") {
      f.skill_proficiencies[key] = "proficient";
    }
  }
  // Auto-add tool proficiencies
  for (const tool of bg.tool_proficiencies ?? []) {
    if (!f.tool_proficiencies.includes(tool)) f.tool_proficiencies.push(tool);
  }
  // Auto-add languages
  for (const lang of bg.languages ?? []) {
    if (!f.languages.includes(lang)) f.languages.push(lang);
  }
}

// ── Suggested HP ─────────────────────────────────────────────────────────────
const suggestedHp = computed(() => {
  const cls = mergedClasses.value.find(c => c.class_name === f.class);
  if (!cls) return null;
  const conMod = mod(f.con);
  return cls.hit_die + conMod + Math.max(0, (f.level - 1) * (Math.ceil(cls.hit_die / 2) + 1 + conMod));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function mod(score: number) { return Math.floor((score - 10) / 2); }

const profBonus = computed(() => {
  const l = f.level;
  if (l >= 17) return 6; if (l >= 13) return 5; if (l >= 9) return 4; if (l >= 5) return 3; return 2;
});

function setSkillProf(key: keyof typeof f.skill_proficiencies, val: SkillProfLevel) { f.skill_proficiencies[key] = val; }
function skillBonus(key: keyof typeof f.skill_proficiencies, ability: SaveKey): string {
  const base = mod(f[ability]);
  const prof = f.skill_proficiencies[key] ?? "none";
  const bonus = prof === "proficient" ? base + profBonus.value : prof === "expertise" ? base + profBonus.value * 2 : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}
function toggleSave(key: SaveKey) {
  const idx = f.saving_throw_proficiencies.indexOf(key);
  if (idx >= 0) f.saving_throw_proficiencies.splice(idx, 1); else f.saving_throw_proficiencies.push(key);
}
function saveBonus(key: SaveKey): string {
  const base = mod(f[key]);
  const bonus = f.saving_throw_proficiencies.includes(key) ? base + profBonus.value : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}

const passivePerception = computed(() => { const b = mod(f.wis); const p = f.skill_proficiencies.perception ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });
const passiveInsight = computed(() => { const b = mod(f.wis); const p = f.skill_proficiencies.insight ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });
const passiveInvestigation = computed(() => { const b = mod(f.int); const p = f.skill_proficiencies.investigation ?? "none"; return 10 + b + (p === "proficient" ? profBonus.value : p === "expertise" ? profBonus.value * 2 : 0); });

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  if (!f.name.trim() || saving.value) return;
  saving.value = true;

  // Apply species ASI bonuses at creation
  if (!isEditMode.value && selectedSpecies.value?.ability_score_increases) {
    const abilityKeyMap: Record<string, keyof typeof f> = {
      strength: "str", dexterity: "dex", constitution: "con",
      intelligence: "int", wisdom: "wis", charisma: "cha",
      str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
    };
    for (const [key, val] of Object.entries(selectedSpecies.value.ability_score_increases)) {
      const fKey = abilityKeyMap[key.toLowerCase()];
      if (fKey) (f as unknown as Record<string, number>)[fKey as string] = Math.min(20, (f[fKey] as number) + (val as number));
    }
  }

  const spellSlots: SpellSlotEntry[] = spellSlotMaxes
    .map((max, i) => {
      const existing = existingMember.value?.spell_slots?.find((s) => s.level === i + 1);
      return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
    })
    .filter((s) => s.max > 0);

  const payload = {
    ...f,
    name:        f.name.trim(),
    player_name: f.player_name || auth.membership?.display_name || null,
    class:       f.class || null,
    subclass:    f.subclass || null,
    race:        f.race || null,
    subrace:     f.subrace || null,
    background:  f.background || null,
    notes:       f.notes || null,
    portrait_url:         portraitUrl.value || null,
    portrait_focal_point: focalPoint.value,
    card_art_url:         cardArtUrl.value || null,
    proficiency_bonus:    profBonus.value,
    spell_slots:          spellSlots,
    current_hp:           f.max_hp,
  };

  if (isEditMode.value && existingMember.value) {
    const { campaign_id: _cid, ...updatePayload } = payload;
    await update({ id: existingMember.value.id, update: updatePayload });
    saving.value = false;
    router.push(backRoute);
  } else {
    const created = await create(payload);
    const myMembership = (campaignMembers.value ?? []).find((cm) => cm.user_id === auth.user?.id);
    if (myMembership) {
      await updateCampaignMember({ id: myMembership.id, update: { party_member_id: created.id } });
    }
    await auth.refreshMembership();
    saving.value = false;
    // If starting above level 1, go to level-up to choose features
    if (f.level > 1) {
      router.push("/play/character/levelup");
    } else {
      router.push(backRoute);
    }
  }
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
