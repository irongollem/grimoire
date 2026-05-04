<template>
  <div class="space-y-6 max-w-lg mx-auto">
    <!-- Header -->
    <div class="text-center space-y-1">
      <p class="font-cinzel text-xs text-primary tracking-widest uppercase">Level Up</p>
      <h2 class="font-cinzel text-2xl font-bold text-foreground">
        {{ member.name }}
        <span class="text-muted-foreground">→ Level {{ nextLevel }}</span>
      </h2>
      <p v-if="member.class" class="font-fell text-sm text-muted-foreground italic">{{ member.class }}</p>
      <!-- Multi-level progress indicator -->
      <div v-if="targetLevel && targetLevel > nextLevel" class="flex items-center justify-center gap-1 mt-2 flex-wrap">
        <template v-for="lvl in (targetLevel - member.level)" :key="lvl">
          <span class="font-cinzel text-[10px] px-1.5 py-0.5 rounded"
            :class="lvl === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'">
            {{ member.level + lvl }}
          </span>
          <span v-if="lvl < (targetLevel - member.level)" class="text-muted-foreground/40 text-xs">→</span>
        </template>
        <span class="font-cinzel text-[10px] text-muted-foreground ml-1">({{ nextLevel - member.level }} of {{ targetLevel - member.level }})</span>
      </div>
    </div>

    <!-- Max level guard -->
    <div v-if="nextLevel > 20" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="font-cinzel text-sm text-muted-foreground">{{ member.name }} has already reached level 20.</p>
    </div>

    <template v-else>
      <!-- Class picker — choose which class gets this level. For single-class
           characters this is the only option; for multiclass the player picks
           between continuing an existing class or taking a new one. -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Leveling in</h3>
        <select
          v-model="chosenClassSelector"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="entry in existingClassOptions" :key="entry.id" :value="entry.id">
            {{ entry.class_name }}{{ entry.subclass_name ? ` (${entry.subclass_name})` : '' }}
            — Level {{ entry.levels }} → {{ entry.levels + 1 }}
          </option>
          <option value="__new__">Take a level in a new class…</option>
        </select>

        <template v-if="isAddingNewClass">
          <div class="space-y-2">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">New Class</label>
            <select
              v-model="newClassName"
              class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Select…</option>
              <option v-for="name in newClassCandidates" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <!-- Prereq warning -->
          <div
            v-if="newClassName && !newClassPrereq.ok"
            class="rounded-md px-3 py-2 flex items-start gap-2"
            :class="ignoreMulticlassPrereqs
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              : 'bg-destructive/10 border border-destructive/30 text-destructive'"
          >
            <span class="font-cinzel text-[10px] tracking-wider shrink-0">{{ ignoreMulticlassPrereqs ? 'PREREQ IGNORED' : 'PREREQ' }}</span>
            <span class="font-fell text-xs">
              {{ newClassPrereq.reason }}.
              <template v-if="ignoreMulticlassPrereqs">
                Multiclass prereqs are disabled for this campaign.
              </template>
              <template v-else>
                The DM can enable "Ignore multiclass prereqs" in Campaign Settings.
              </template>
            </span>
          </div>
          <div
            v-if="newClassName && newClassProficiencyGrants.length > 0"
            class="rounded-md bg-primary/10 border border-primary/20 px-3 py-2"
          >
            <p class="font-cinzel text-[10px] text-primary tracking-wider mb-1">Multiclass Proficiencies</p>
            <p class="font-fell text-xs text-foreground">
              You gain: {{ newClassProficiencyGrants.join(', ') }}
            </p>
          </div>
        </template>
      </div>

      <!-- Features gained -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Features Gained</h3>

        <template v-if="customFeaturesForLevel.length > 0">
          <ul class="space-y-1">
            <li v-for="feat in customFeaturesForLevel" :key="featureName(feat)" class="space-y-1">
              <button
                class="flex items-start gap-2 font-fell text-sm text-foreground w-full text-left"
                :class="featureDescription(feat) ? 'cursor-pointer' : 'cursor-default'"
                @click="featureDescription(feat) && toggleWizardFeature(featureName(feat))"
              >
                <span class="text-primary mt-0.5 shrink-0">✦</span>
                <span class="flex-1">{{ featureName(feat) }}</span>
                <ChevronDown
                  v-if="featureDescription(feat)"
                  class="h-3 w-3 text-muted-foreground/60 mt-0.5 transition-transform shrink-0"
                  :class="wizardExpandedFeatures.has(featureName(feat)) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="featureDescription(feat) && wizardExpandedFeatures.has(featureName(feat))"
                class="ml-4 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
              >
                <RichTextViewer :content="featureDescription(feat)!" />
              </div>
            </li>
          </ul>
        </template>
        <template v-else-if="systemClass || customClass">
          <p class="font-fell text-sm text-muted-foreground italic">
            Class feature details coming soon — check the class description for level {{ nextLevel }} features.
          </p>
        </template>
        <template v-else>
          <p class="font-fell text-sm text-muted-foreground italic">
            No class-specific feature data available yet for {{ member.class ?? "this class" }}.
          </p>
        </template>

        <!-- Cantrips known increase -->
        <div v-if="cantripsKnownGain > 0"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
          <span class="font-cinzel text-xs text-primary tracking-wider">CANTRIPS</span>
          <span class="font-fell text-sm text-foreground">
            Cantrips known increases to <strong class="font-cinzel">{{ cantripsKnownTotal }}</strong>
            — pick {{ cantripsKnownGain }} new cantrip{{ cantripsKnownGain > 1 ? 's' : '' }} below.
          </span>
        </div>

        <!-- Spells known increase -->
        <div v-if="spellsKnownGain > 0"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
          <span class="font-cinzel text-xs text-primary tracking-wider">SPELLS</span>
          <span class="font-fell text-sm text-foreground">
            Spells known increases to <strong class="font-cinzel">{{ spellsKnownTotal }}</strong>
            — pick {{ spellsKnownGain }} new spell{{ spellsKnownGain > 1 ? 's' : '' }} below.
          </span>
        </div>

        <!-- Class resource updates -->
        <div v-for="res in resourceNotices" :key="res.key"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
          <span class="font-cinzel text-xs text-primary tracking-wider uppercase">{{ res.key.replace('_', ' ') }}</span>
          <span class="font-fell text-sm text-foreground">
            {{ res.label }} maximum:
            <strong class="font-cinzel">{{ res.oldMax }}</strong> → <strong class="font-cinzel">{{ res.newMax }}</strong>
          </span>
        </div>

        <!-- Proficiency bonus bump -->
        <div v-if="newProfBonus !== member.proficiency_bonus"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
          <span class="font-cinzel text-xs text-primary tracking-wider">PROF</span>
          <span class="font-fell text-sm text-foreground">
            Proficiency bonus increases to <strong class="font-cinzel">+{{ newProfBonus }}</strong>
          </span>
        </div>

        <!-- Spell slot change -->
        <div v-if="newSpellSlotSummary"
          class="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
          <span class="font-cinzel text-xs text-primary tracking-wider">SLOTS</span>
          <span class="font-fell text-sm text-foreground">{{ newSpellSlotSummary }}</span>
        </div>
      </div>

      <!-- Hit Points -->
      <div class="rounded-lg border border-border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Hit Points</h3>
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
            d{{ hitDie }} · CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
          </span>
        </div>

        <!-- Mode picker -->
        <div class="flex rounded-md border border-border overflow-hidden w-fit font-cinzel text-xs tracking-wider">
          <button
            class="px-3 py-1.5 transition-colors"
            :class="hpMode === 'average' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="setHpMode('average')"
          >Average</button>
          <button
            class="px-3 py-1.5 transition-colors"
            :class="hpMode === 'roll' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="setHpMode('roll')"
          >Roll</button>
          <button
            class="px-3 py-1.5 transition-colors"
            :class="hpMode === 'max' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            title="House rule — take the hit die's maximum."
            @click="setHpMode('max')"
          >Max</button>
        </div>

        <!-- Mode body -->
        <template v-if="hpMode === 'roll'">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-border bg-muted/40 px-3 py-1.5 font-cinzel text-xs text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              :disabled="rolledHp !== null"
              @click="rollHp"
            >Roll d{{ hitDie }}</button>
            <span v-if="rolledHp !== null" class="font-fell text-sm text-foreground">
              Rolled <strong class="font-cinzel">{{ rolledHp }}</strong>
              <span class="text-muted-foreground"> + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }} = </span>
              <strong class="font-cinzel text-primary">{{ Math.max(1, rolledHp + conMod) }}</strong> HP
            </span>
            <span v-else class="font-fell text-xs text-muted-foreground italic">
              Roll once. Minimum 1 HP per level.
            </span>
          </div>
        </template>

        <p v-else class="font-fell text-sm text-muted-foreground">
          <template v-if="hpMode === 'average'">
            Take the average: <strong class="font-cinzel text-foreground">{{ hpAverageValue }}</strong>
            (½ hit die rounded up, +1) + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
            = <strong class="font-cinzel text-primary">{{ Math.max(1, hpAverageValue + conMod) }}</strong> HP
          </template>
          <template v-else>
            Take the maximum: <strong class="font-cinzel text-foreground">{{ hitDie }}</strong>
            + CON {{ conMod >= 0 ? '+' : '' }}{{ conMod }}
            = <strong class="font-cinzel text-primary">{{ Math.max(1, hitDie + conMod) }}</strong> HP
          </template>
        </p>

        <!-- Projected total + hit dice change -->
        <div class="flex items-center justify-between rounded-md bg-muted/30 border border-border/60 px-3 py-2">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">MAX HP</span>
          <span class="font-fell text-sm text-foreground">
            {{ member.max_hp }} → <strong class="font-cinzel text-primary">{{ member.max_hp + hpGain }}</strong>
            <span class="text-muted-foreground ml-1">(+{{ hpGain }})</span>
          </span>
        </div>
        <div class="flex items-center justify-between rounded-md bg-muted/30 border border-border/60 px-3 py-2">
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HIT DICE</span>
          <span class="font-fell text-sm text-foreground">
            {{ currentHitDice }}d{{ hitDie }} → <strong class="font-cinzel text-primary">{{ newHitDiceCount }}d{{ hitDie }}</strong>
          </span>
        </div>
      </div>

      <!-- ASI / Feat picker -->
      <div v-if="grantsAsi" class="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Ability Score Improvement or Feat</h3>
        <p class="font-fell text-sm text-muted-foreground">Choose how to apply your improvement.</p>

        <div class="flex rounded-md border border-border overflow-hidden w-fit font-cinzel text-xs tracking-wider">
          <button class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus2' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus2'">+2 to one</button>
          <button class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'plus1plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'plus1plus1'">+1 / +1</button>
          <button class="px-3 py-1.5 transition-colors"
            :class="asiMode === 'feat' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="asiMode = 'feat'">Feat</button>
        </div>

        <!-- ASI mode -->
        <template v-if="asiMode !== 'feat'">
          <div class="flex flex-wrap gap-3">
            <div class="space-y-1">
              <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
                {{ asiMode === 'plus2' ? '+2 Ability' : '+1 First Ability' }}
              </label>
              <select v-model="asiPrimary"
                class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="" disabled>Select…</option>
                <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
              </select>
            </div>
            <div v-if="asiMode === 'plus1plus1'" class="space-y-1">
              <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">+1 Second Ability</label>
              <select v-model="asiSecondary"
                class="rounded border border-border bg-muted/40 px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="" disabled>Select…</option>
                <option v-for="ab in ABILITY_OPTIONS" :key="ab.key" :value="ab.key">{{ ab.label }}</option>
              </select>
            </div>
          </div>
          <div v-if="asiPreview.length > 0" class="font-fell text-sm text-muted-foreground">
            <span v-for="(line, i) in asiPreview" :key="i" class="mr-3">{{ line }}</span>
          </div>
        </template>

        <!-- Feat mode -->
        <template v-else>
          <div class="space-y-2">
            <input v-model="featSearch" type="text" placeholder="Search feats…"
              class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <div v-if="allFeatures && filteredFeats.length > 0"
              class="max-h-48 overflow-y-auto rounded border border-border divide-y divide-border">
              <button v-for="f in filteredFeats" :key="f.id" type="button"
                class="w-full text-left px-3 py-2 transition-colors"
                :class="featId === f.id ? 'bg-primary/10 text-primary' : 'bg-card text-foreground hover:bg-muted/40'"
                @click="featId = featId === f.id ? '' : f.id">
                <p class="font-cinzel text-xs font-semibold">{{ f.name }}</p>
                <p v-if="f.description" class="font-fell text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{{ f.description }}</p>
              </button>
            </div>
            <p v-else-if="featSearch && allFeatures" class="font-fell text-sm text-muted-foreground italic">No matching features found.</p>
            <p v-if="featId" class="font-cinzel text-xs text-primary tracking-wider">✓ {{ selectedFeatName }}</p>
          </div>
        </template>
      </div>

      <!-- Subclass choice -->
      <div v-if="needsSubclassChoice" class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Choose Subclass</h3>
        <p class="font-fell text-sm text-muted-foreground">
          At level {{ nextLevel }}, {{ member.class }} characters choose their specialisation.
        </p>
        <select v-if="subclassOptions.length > 0" v-model="subclassInput"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="" disabled>Select subclass…</option>
          <option v-for="sc in subclassOptions" :key="sc" :value="sc">{{ sc }}</option>
        </select>
        <input v-else v-model="subclassInput" type="text" placeholder="e.g. Circle of the Moon"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <!-- Class-specific steps -->
      <div v-for="step in classSteps" :key="step.key"
        class="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">{{ step.label }}</h3>
        <p v-if="step.description" class="font-fell text-sm text-muted-foreground">{{ step.description }}</p>

        <template v-if="(step.count ?? 1) > 1">
          <div v-for="pickIdx in (step.count ?? 1)" :key="pickIdx" class="space-y-1">
            <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Choice {{ pickIdx }}</label>
            <select
              :value="(stepMultiValues[step.key] ?? [])[pickIdx - 1] ?? ''"
              class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @change="onMultiStepChange(step, pickIdx - 1, ($event.target as HTMLSelectElement).value)">
              <option value="" disabled>Select…</option>
              <option v-for="opt in step.options" :key="opt" :value="opt"
                :disabled="isMultiPickTaken(step, pickIdx - 1, opt)">{{ opt }}</option>
            </select>
          </div>
        </template>

        <select v-else :value="stepValues[step.key] ?? ''"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onStepChange(step, ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>Select…</option>
          <option v-for="opt in step.options" :key="opt" :value="opt"
            :disabled="isSinglePickTaken(step, opt)">{{ opt }}</option>
        </select>
      </div>

      <!-- Spell picker (known casters gaining spells) -->
      <div v-if="spellsKnownGain > 0" class="rounded-lg border border-border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Choose New Spells</h3>
          <span class="font-cinzel text-xs font-bold"
            :class="selectedSpellIds.size === spellsKnownGain ? 'text-green-500' : 'text-primary'">
            {{ selectedSpellIds.size }} / {{ spellsKnownGain }}
          </span>
        </div>
        <p class="font-fell text-sm text-muted-foreground">
          Pick {{ spellsKnownGain }} new spell{{ spellsKnownGain > 1 ? 's' : '' }} to learn.
        </p>

        <input v-model="spellSearch" type="text" placeholder="Search spells…"
          class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />

        <div class="max-h-64 overflow-y-auto rounded border border-border divide-y divide-border">
          <div v-if="!filteredSpells.length" class="px-3 py-4 text-center">
            <p class="font-fell text-sm text-muted-foreground italic">
              {{ spellSearch ? 'No spells match your search.' : 'No spells found for this class.' }}
            </p>
          </div>
          <button v-for="spell in filteredSpells" :key="spell.id" type="button"
            class="w-full text-left px-3 py-2 transition-colors flex items-center gap-3"
            :class="[
              alreadyKnownIds.has(spell.id) ? 'opacity-40 cursor-not-allowed' :
              selectedSpellIds.has(spell.id) ? 'bg-primary/10 text-primary' :
              selectedSpellIds.size >= spellsKnownGain ? 'opacity-50 cursor-not-allowed' : 'bg-card text-foreground hover:bg-muted/40'
            ]"
            :disabled="alreadyKnownIds.has(spell.id) || (!selectedSpellIds.has(spell.id) && selectedSpellIds.size >= spellsKnownGain)"
            @click="toggleSpell(spell.id)">
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-xs font-semibold">{{ spell.name }}</p>
              <p class="font-fell text-[11px] text-muted-foreground">
                {{ spell.level === 0 ? 'Cantrip' : `Level ${spell.level}` }} · {{ spell.school }}
              </p>
            </div>
            <span v-if="alreadyKnownIds.has(spell.id)" class="font-cinzel text-[10px] text-muted-foreground shrink-0">known</span>
            <span v-else-if="selectedSpellIds.has(spell.id)" class="font-cinzel text-[10px] text-primary shrink-0">✓</span>
          </button>
        </div>

        <p v-if="selectedSpellIds.size < spellsKnownGain" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
          You can also add spells later from your Spellbook tab.
        </p>
      </div>

      <!-- Cantrip picker (known casters gaining cantrips) -->
      <div v-if="cantripsKnownGain > 0" class="rounded-lg border border-border bg-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-cinzel text-xs tracking-wider text-muted-foreground uppercase">Choose New Cantrips</h3>
          <span class="font-cinzel text-xs font-bold"
            :class="selectedCantripIds.size === cantripsKnownGain ? 'text-green-500' : 'text-primary'">
            {{ selectedCantripIds.size }} / {{ cantripsKnownGain }}
          </span>
        </div>
        <p class="font-fell text-sm text-muted-foreground">
          Pick {{ cantripsKnownGain }} new cantrip{{ cantripsKnownGain > 1 ? 's' : '' }} to learn.
        </p>

        <input v-model="cantripSearch" type="text" placeholder="Search cantrips…"
          class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />

        <div class="max-h-64 overflow-y-auto rounded border border-border divide-y divide-border">
          <div v-if="!cantripPageData?.spells.length" class="px-3 py-4 text-center">
            <p class="font-fell text-sm text-muted-foreground italic">
              {{ cantripSearch ? 'No cantrips match your search.' : 'No cantrips found for this class.' }}
            </p>
          </div>
          <button v-for="spell in cantripPageData?.spells" :key="spell.id" type="button"
            class="w-full text-left px-3 py-2 transition-colors flex items-center gap-3"
            :class="[
              alreadyKnownIds.has(spell.id) ? 'opacity-40 cursor-not-allowed' :
              selectedCantripIds.has(spell.id) ? 'bg-primary/10 text-primary' :
              selectedCantripIds.size >= cantripsKnownGain ? 'opacity-50 cursor-not-allowed' : 'bg-card text-foreground hover:bg-muted/40'
            ]"
            :disabled="alreadyKnownIds.has(spell.id) || (!selectedCantripIds.has(spell.id) && selectedCantripIds.size >= cantripsKnownGain)"
            @click="toggleCantrip(spell.id)">
            <div class="flex-1 min-w-0">
              <p class="font-cinzel text-xs font-semibold">{{ spell.name }}</p>
              <p class="font-fell text-[11px] text-muted-foreground">Cantrip · {{ spell.school }}</p>
            </div>
            <span v-if="alreadyKnownIds.has(spell.id)" class="font-cinzel text-[10px] text-muted-foreground shrink-0">known</span>
            <span v-else-if="selectedCantripIds.has(spell.id)" class="font-cinzel text-[10px] text-primary shrink-0">✓</span>
          </button>
        </div>

        <p v-if="selectedCantripIds.size < cantripsKnownGain" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">
          You can also add cantrips later from your Spellbook tab.
        </p>
      </div>

      <!-- Error -->
      <p v-if="error" class="font-fell text-sm text-destructive">{{ error }}</p>

      <!-- Confirm / Cancel -->
      <div class="flex gap-3">
        <RouterLink :to="backRoute ?? '/play'"
          class="flex-1 rounded-md border border-border px-4 py-2 font-cinzel text-xs text-muted-foreground text-center tracking-wider hover:text-foreground hover:border-primary/40 transition-colors">
          Cancel
        </RouterLink>
        <button
          class="flex-1 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="isPending || !canConfirm"
          @click="confirm">
          {{ isPending ? "Applying…" : `Confirm Level ${nextLevel}` }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { ChevronDown } from "lucide-vue-next";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useAllCustomSubclasses, useCustomSubclassByClassAndSubclass } from "@/composables/useCustomSubclasses";
import { useCustomClassByName, useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import {
  useCharacterClasses,
  useMulticlassPrereqs,
  useAddCharacterClass,
  useUpdateCharacterClass,
} from "@/composables/useCharacterClasses";
import { useCampaignStore } from "@/stores/campaign";
import { meetsMulticlassPrereq } from "@/types/multiclass.types";
import type { CharacterClass } from "@/types/multiclass.types";
import { getHitDie, getMulticlassSpellSlots } from "@/types/spell.types";
import type { DieSize } from "@/lib/dice";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { useAllFeatures } from "@/composables/useFeatures";
import { useCharacterSpells, useAddCharacterSpell, addInvocationSpellGrant } from "@/composables/useCharacterSpells";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import { useSpellsPage } from "@/composables/useSpells";
import type { PartyMember, PartyMemberUpdate, SpellSlotEntry, LevelChoiceEntry, LevelChoices } from "@/types/party.types";
import type { AbilityKey, AsiMode, ClassStep, ClassResourceDef, FeatureEntry } from "./types";
import { featureName, featureDescription, mapFeatureIds } from "./types";
import type { CustomResource } from "@/levelup/customTypes";

const props = defineProps<{
  member: PartyMember;
  targetLevel?: number;
  backRoute?: string;
}>();

const router = useRouter();
const { mutateAsync: updateMember, isPending } = useUpdatePartyMember();
const { mutateAsync: addCharacterClass } = useAddCharacterClass();
const { mutateAsync: updateCharacterClass } = useUpdateCharacterClass();
const campaign = useCampaignStore();

// ── Multiclass state ───────────────────────────────────────────────────────────
const memberIdRef = computed(() => props.member.id);
const { data: characterClasses } = useCharacterClasses(memberIdRef);
const { data: multiclassPrereqs } = useMulticlassPrereqs();
const { data: allCustomClasses } = useAllCustomClasses();
const { data: allSystemClasses } = useAllSystemClasses();

const memberClassEntries = computed<CharacterClass[]>(() => characterClasses.value ?? []);

const existingClassOptions = computed(() => memberClassEntries.value);

/** User's choice for this level-up: either an existing class entry or "__new__" */
const chosenClassSelector = ref<string>("");

/** When adding a new class, which class is being taken. */
const newClassName = ref<string>("");

// Seed the picker on mount / when member classes load.
const initClassSelectorOnce = computed(() => {
  if (chosenClassSelector.value) return true;
  const primary = existingClassOptions.value.find(c => c.is_primary) ?? existingClassOptions.value[0];
  if (primary) {
    chosenClassSelector.value = primary.id;
    return true;
  }
  return false;
});
// Touch the computed so it runs its seeding effect.
void initClassSelectorOnce;

const isAddingNewClass = computed(() => chosenClassSelector.value === "__new__");

const chosenExistingEntry = computed<CharacterClass | null>(() => {
  if (isAddingNewClass.value) return null;
  return existingClassOptions.value.find(c => c.id === chosenClassSelector.value) ?? null;
});

/** The class name for this level-up — existing-class name or newly-picked class. */
const memberClass = computed(() => {
  if (isAddingNewClass.value) return newClassName.value;
  return chosenExistingEntry.value?.class_name ?? props.member.class ?? "";
});

const memberSubclass = computed(() =>
  chosenExistingEntry.value?.subclass_name ?? "",
);

/** Per-chosen-class level: the level *inside the chosen class* after this bump. */
const levelInChosenClass = computed(() => {
  if (isAddingNewClass.value) return 1;
  return (chosenExistingEntry.value?.levels ?? 0) + 1;
});

const { data: customSubclass } = useCustomSubclassByClassAndSubclass(memberClass, memberSubclass);
const { data: customClass }    = useCustomClassByName(memberClass);
const systemClass = computed(() => (allSystemClasses.value ?? []).find(c => c.class_name === memberClass.value));
const { data: allFeatures }   = useAllFeatures();
const { data: allCustomSubclasses } = useAllCustomSubclasses();
const customSubclassNamesForClass = computed<string[]>(() =>
  (allCustomSubclasses.value ?? [])
    .filter(cs => cs.class_name === memberClass.value)
    .map(cs => cs.subclass_name),
);

// Classes the character doesn't already have — candidates for a new level.
const newClassCandidates = computed<string[]>(() => {
  const existing = new Set(existingClassOptions.value.map(c => c.class_name));
  const custom = (allCustomClasses.value ?? []).map(c => c.class_name);
  const system = (allSystemClasses.value ?? []).map(c => c.class_name);
  const all = Array.from(new Set([...custom, ...system]));
  return all.filter(name => !existing.has(name)).sort();
});

const ignoreMulticlassPrereqs = computed<boolean>(() => {
  const rules = (campaign.activeCampaign?.optional_rules ?? {}) as Record<string, unknown>;
  return rules.ignore_multiclass_prereqs === true;
});

/** Prereq check for the currently-selected new class. */
const newClassPrereq = computed(() => {
  if (!isAddingNewClass.value || !newClassName.value) return { ok: true as const };
  const prereq = (multiclassPrereqs.value ?? []).find(p => p.class_name === newClassName.value);
  if (!prereq) return { ok: true as const };
  return meetsMulticlassPrereq(prereq, {
    str: props.member.str, dex: props.member.dex, con: props.member.con,
    int: props.member.int, wis: props.member.wis, cha: props.member.cha,
  });
});

const newClassProficiencyGrants = computed<string[]>(() => {
  if (!isAddingNewClass.value || !newClassName.value) return [];
  const prereq = (multiclassPrereqs.value ?? []).find(p => p.class_name === newClassName.value);
  return prereq?.gained_proficiencies ?? [];
});

// ── Derived ────────────────────────────────────────────────────────────────────
// `nextLevel` is the character's new TOTAL level — used for proficiency bonus.
// `levelInChosenClass` (defined above) is the new level IN THE CLASS BEING
// LEVELLED — used for features, ASI checks, subclass gates, hit die, and
// class-specific spell/cantrip tables.
const nextLevel    = computed(() => props.member.level + 1);
const newProfBonus = computed(() => 2 + Math.floor((nextLevel.value - 1) / 4));

// ── Hit points + hit dice ──────────────────────────────────────────────────────
const hitDie = computed<number>(() => {
  const cls = customClass.value ?? systemClass.value;
  return cls?.hit_die ?? getHitDie(memberClass.value);
});
const conMod = computed(() => Math.floor((props.member.con - 10) / 2));
const hpAverageValue = computed(() => Math.ceil(hitDie.value / 2) + 1);

type HpMode = "average" | "roll" | "max";
const hpMode = ref<HpMode>("average");
const rolledHp = ref<number | null>(null);

function setHpMode(mode: HpMode) {
  if (hpMode.value === mode) return;
  hpMode.value = mode;
  // Clear any locked roll so switching to "roll" re-exposes the button.
  rolledHp.value = null;
}

const { promptRoll } = usePromptedRoll();

async function rollHp() {
  if (rolledHp.value !== null) return;
  const r = await promptRoll({
    counts: { [hitDie.value as DieSize]: 1 },
    modifier: 0,
    label: `Hit Die (1d${hitDie.value})`,
    silent: true,
  });
  if (r) rolledHp.value = r.total;
}

const subclassHpBonus = computed(() => customSubclass.value?.hp_per_level ?? 0);

/** HP gained at this level-up. Minimum 1 per 5e guidance (no negative levels). */
const hpGain = computed(() => {
  const bonus = subclassHpBonus.value;
  if (hpMode.value === "roll") {
    if (rolledHp.value === null) return 0;
    return Math.max(1, rolledHp.value + conMod.value + bonus);
  }
  if (hpMode.value === "max") return Math.max(1, hitDie.value + conMod.value + bonus);
  return Math.max(1, hpAverageValue.value + conMod.value + bonus);
});

const currentHitDice = computed(() =>
  Math.min(props.member.level, props.member.hit_dice_remaining ?? props.member.level),
);
const newHitDiceCount = computed(() => Math.min(nextLevel.value, currentHitDice.value + 1));

const grantsAsi = computed(() =>
  systemClass.value?.asi_levels.includes(levelInChosenClass.value) ||
  customClass.value?.asi_levels.includes(levelInChosenClass.value) ||
  false,
);

const needsSubclassChoice = computed(() => {
  if (chosenExistingEntry.value?.subclass_name) return false;
  if (systemClass.value?.subclass_level === levelInChosenClass.value) return true;
  if (customClass.value?.subclass_level === levelInChosenClass.value) return true;
  return false;
});

const subclassOptions = computed(() => customSubclassNamesForClass.value);

function dbSlots(level: number): SpellSlotEntry[] {
  const cls = customClass.value ?? systemClass.value;
  const row = cls?.spell_slots?.[Math.min(level, 20) - 1];
  if (!row) return [];
  return row.map((max, i) => ({ level: i + 1, max, used: 0 })).filter(s => s.max > 0);
}

const prevLevelInChosenClass = computed(() => Math.max(0, levelInChosenClass.value - 1));
const prevSpellSlots = computed<SpellSlotEntry[]>(() => dbSlots(prevLevelInChosenClass.value));
const newSpellSlots  = computed<SpellSlotEntry[]>(() => dbSlots(levelInChosenClass.value));

// ── Multiclass-aware spell slot lists ─────────────────────────────────────────
// For multi-class characters the PHB combines all caster levels into a single
// slot table. We compute the post-level-up class list here so that confirm()
// can store the correct combined slots instead of the per-class table used by
// dbSlots().

/** Class list as it will look AFTER this level-up (for slot calculation). */
const postLevelupClassList = computed<{ class_name: string; levels: number }[]>(() => {
  const entries = memberClassEntries.value;
  if (isAddingNewClass.value && newClassName.value) {
    return [
      ...entries.map(e => ({ class_name: e.class_name, levels: e.levels })),
      { class_name: newClassName.value, levels: 1 },
    ];
  }
  if (chosenExistingEntry.value) {
    const chosenId = chosenExistingEntry.value.id;
    return entries.map(e => ({
      class_name: e.class_name,
      levels: e.id === chosenId ? e.levels + 1 : e.levels,
    }));
  }
  return [];
});

/** Class list as it looks BEFORE this level-up (for slot diff summary). */
const preLevelupClassList = computed<{ class_name: string; levels: number }[]>(() =>
  memberClassEntries.value.map(e => ({ class_name: e.class_name, levels: e.levels }))
);

/**
 * Spell slots after this level-up. Uses the PHB multiclass combined table when
 * the character will have 2+ classes; falls back to the per-class DB table for
 * single-class characters so custom class slot progressions are respected.
 */
const postLevelupSpellSlots = computed<SpellSlotEntry[]>(() => {
  if (postLevelupClassList.value.length > 1) {
    return getMulticlassSpellSlots(postLevelupClassList.value);
  }
  return newSpellSlots.value;
});

/** Spell slots before this level-up — multiclass-aware for the diff summary. */
const preLevelupSpellSlots = computed<SpellSlotEntry[]>(() => {
  if (preLevelupClassList.value.length > 1) {
    return getMulticlassSpellSlots(preLevelupClassList.value);
  }
  return prevSpellSlots.value;
});

const newSpellSlotSummary = computed(() => {
  const prev = preLevelupSpellSlots.value;
  const next = postLevelupSpellSlots.value;
  if (next.length === 0) return null;
  const gains: string[] = [];
  for (const slot of next) {
    const old = prev.find(s => s.level === slot.level);
    if (!old) gains.push(`${slot.max}× level-${slot.level}`);
    else if (slot.max > old.max) gains.push(`+${slot.max - old.max} level-${slot.level}`);
  }
  if (gains.length === 0) return null;
  return `Spell slots: ${gains.join(", ")}`;
});

const spellsKnownGain = computed(() => {
  const table = customClass.value?.spells_known ?? systemClass.value?.spells_known;
  if (!table) return 0;
  const cur  = table[levelInChosenClass.value - 1] ?? 0;
  const prev = table[prevLevelInChosenClass.value - 1] ?? 0;
  return Math.max(0, cur - prev);
});

const spellsKnownTotal = computed(() => {
  const table = customClass.value?.spells_known ?? systemClass.value?.spells_known;
  return table?.[levelInChosenClass.value - 1] ?? 0;
});

const cantripsKnownGain = computed(() => {
  const table = customClass.value?.cantrips_known ?? systemClass.value?.cantrips_known;
  if (!table) return 0;
  const cur  = table[levelInChosenClass.value - 1] ?? 0;
  const prev = table[prevLevelInChosenClass.value - 1] ?? 0;
  return Math.max(0, cur - prev);
});

const cantripsKnownTotal = computed(() => {
  const table = customClass.value?.cantrips_known ?? systemClass.value?.cantrips_known;
  return table?.[levelInChosenClass.value - 1] ?? 0;
});

/** Highest spell slot level available at nextLevel — caps what spells can be learned. */
const maxCastableLevel = computed(() => {
  const slots = newSpellSlots.value;
  if (slots.length === 0) return 9; // no slot data → no restriction
  return Math.max(...slots.map(s => s.level));
});

const wizardExpandedFeatures = ref(new Set<string>());
function toggleWizardFeature(name: string) {
  if (wizardExpandedFeatures.value.has(name)) wizardExpandedFeatures.value.delete(name);
  else wizardExpandedFeatures.value.add(name);
  wizardExpandedFeatures.value = new Set(wizardExpandedFeatures.value);
}

const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

const customFeaturesForLevel = computed<FeatureEntry[]>(() => {
  // Features are indexed per-class-level, not per-total-level.
  const lvlKey = levelInChosenClass.value.toString();
  const ids = customSubclass.value?.features[lvlKey] ?? customClass.value?.features[lvlKey] ?? systemClass.value?.features[lvlKey] ?? [];
  return mapFeatureIds(ids, featureObjectMap.value);
});

function resourceDefsFrom(resources: CustomResource[]): ClassResourceDef[] {
  return resources.map(r => ({
    key: r.key,
    label: r.label,
    rest: r.rest,
    maxAtLevel: (level: number) => {
      if (r.scaling === "fixed") return r.fixed_value ?? 0;
      if (r.scaling === "per_level") return level;
      if (r.scaling === "table" && r.table_values) return r.table_values[Math.min(level, 20) - 1] ?? 0;
      return 0;
    },
  }));
}

const classDefs = computed<ClassResourceDef[]>(() => {
  const all = [
    ...resourceDefsFrom(systemClass.value?.resources ?? []),
    ...resourceDefsFrom(customClass.value?.resources ?? []),
    ...resourceDefsFrom(customSubclass.value?.resources ?? []),
  ];
  const seenKeys = new Set<string>();
  return all.filter(d => { if (seenKeys.has(d.key)) return false; seenKeys.add(d.key); return true; });
});

const resourceNotices = computed(() =>
  classDefs.value.flatMap(def => {
    const newMax = def.maxAtLevel(levelInChosenClass.value);
    const oldMax = def.maxAtLevel(prevLevelInChosenClass.value);
    if (newMax === oldMax) return [];
    return [{ key: def.key, label: def.label, oldMax, newMax }];
  }),
);

// ── ASI ────────────────────────────────────────────────────────────────────────
const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
const ABILITY_OPTIONS = (Object.entries(ABILITY_LABEL) as [AbilityKey, string][]).map(([key, label]) => ({ key, label }));

const asiMode      = ref<AsiMode>("plus2");
const asiPrimary   = ref<AbilityKey | "">("");
const asiSecondary = ref<AbilityKey | "">("");

const asiPreview = computed(() => {
  const lines: string[] = [];
  if (asiPrimary.value) {
    const cur = props.member[asiPrimary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiPrimary.value]} ${cur} → ${cur + (asiMode.value === "plus2" ? 2 : 1)}`);
  }
  if (asiMode.value === "plus1plus1" && asiSecondary.value && asiSecondary.value !== asiPrimary.value) {
    const cur = props.member[asiSecondary.value as keyof PartyMember] as number;
    lines.push(`${ABILITY_LABEL[asiSecondary.value]} ${cur} → ${cur + 1}`);
  }
  return lines;
});

// ── Feat picker ────────────────────────────────────────────────────────────────
const featSearch = ref("");
const featId     = ref("");
const filteredFeats = computed(() => {
  const term = featSearch.value.toLowerCase().trim();
  return (allFeatures.value ?? []).filter(f => !term || f.name.toLowerCase().includes(term));
});
const selectedFeatName = computed(() => allFeatures.value?.find(f => f.id === featId.value)?.name ?? "");

// ── Subclass ───────────────────────────────────────────────────────────────────
const subclassInput = ref("");

// ── Class-specific steps ───────────────────────────────────────────────────────
const classSteps = computed<ClassStep[]>(() => {
  function stepsAt(steps: { level: number; step_type: string; type: "select" | "append"; key: string; label: string; description?: string; options: string[]; count?: number }[]): ClassStep[] {
    return steps
      .filter(s => s.level === levelInChosenClass.value)
      .map(({ level: _l, step_type: _st, ...rest }) => rest);
  }
  return [
    ...stepsAt(systemClass.value?.steps ?? []),
    ...stepsAt(customClass.value?.steps ?? []),
    ...stepsAt(customSubclass.value?.steps ?? []),
  ];
});

const stepValues = ref<Record<string, string>>({});
function onStepChange(step: ClassStep, value: string) {
  stepValues.value = { ...stepValues.value, [step.key]: value };
}

const stepMultiValues = ref<Record<string, string[]>>({});
function onMultiStepChange(step: ClassStep, idx: number, value: string) {
  const cur = [...(stepMultiValues.value[step.key] ?? [])];
  cur[idx] = value;
  stepMultiValues.value = { ...stepMultiValues.value, [step.key]: cur };
}
function isMultiPickTaken(step: ClassStep, ownIdx: number, opt: string): boolean {
  const picks = stepMultiValues.value[step.key] ?? [];
  if (picks.some((v, i) => i !== ownIdx && v === opt)) return true;
  if (step.type === "append") {
    const existing = props.member.class_choices?.[step.key];
    if (Array.isArray(existing) && (existing as string[]).includes(opt)) return true;
  }
  return false;
}

function isSinglePickTaken(step: ClassStep, opt: string): boolean {
  if (step.type !== "append") return false;
  const existing = props.member.class_choices?.[step.key];
  return Array.isArray(existing) && (existing as string[]).includes(opt);
}

// ── Spell picker ───────────────────────────────────────────────────────────────
const spellSearch = ref("");
const spellFilters = computed(() => ({
  search: spellSearch.value,
  level: "",
  school: "",
  class: memberClass.value,
  source: "",
}));
const spellPage = ref(0);
const { data: spellPageData } = useSpellsPage(spellFilters, spellPage);
/** Only show spells the character can actually cast (level ≤ max slot level). */
const filteredSpells = computed(() =>
  (spellPageData.value?.spells ?? []).filter(s => s.level > 0 && s.level <= maxCastableLevel.value),
);

const { data: characterSpells } = useCharacterSpells(computed(() => props.member.id));
const alreadyKnownIds = computed(() => new Set((characterSpells.value ?? []).map(s => s.spell_id)));
const { mutateAsync: addSpell } = useAddCharacterSpell();

const selectedSpellIds = ref(new Set<string>());
function toggleSpell(id: string) {
  if (alreadyKnownIds.value.has(id)) return;
  if (selectedSpellIds.value.has(id)) {
    const next = new Set(selectedSpellIds.value);
    next.delete(id);
    selectedSpellIds.value = next;
  } else if (selectedSpellIds.value.size < spellsKnownGain.value) {
    selectedSpellIds.value = new Set([...selectedSpellIds.value, id]);
  }
}

// ── Cantrip picker ─────────────────────────────────────────────────────────────
const cantripSearch = ref("");
const cantripFilters = computed(() => ({
  search: cantripSearch.value,
  level: "0",
  school: "",
  class: memberClass.value,
  source: "",
}));
const cantripPage = ref(0);
const { data: cantripPageData } = useSpellsPage(cantripFilters, cantripPage);

const selectedCantripIds = ref(new Set<string>());
function toggleCantrip(id: string) {
  if (alreadyKnownIds.value.has(id)) return;
  if (selectedCantripIds.value.has(id)) {
    const next = new Set(selectedCantripIds.value);
    next.delete(id);
    selectedCantripIds.value = next;
  } else if (selectedCantripIds.value.size < cantripsKnownGain.value) {
    selectedCantripIds.value = new Set([...selectedCantripIds.value, id]);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────
const error = ref("");

const canConfirm = computed(() => {
  if (nextLevel.value > 20) return false;
  if (!memberClass.value) return false;
  if (isAddingNewClass.value && !newClassName.value) return false;
  if (isAddingNewClass.value && !ignoreMulticlassPrereqs.value && !newClassPrereq.value.ok) return false;
  if (hpMode.value === "roll" && rolledHp.value === null) return false;
  if (grantsAsi.value) {
    if (asiMode.value === "plus2" && !asiPrimary.value) return false;
    if (asiMode.value === "plus1plus1" && (!asiPrimary.value || !asiSecondary.value || asiSecondary.value === asiPrimary.value)) return false;
    if (asiMode.value === "feat" && !featId.value) return false;
  }
  if (needsSubclassChoice.value && !subclassInput.value.trim()) return false;
  for (const step of classSteps.value) {
    const count = step.count ?? 1;
    if (count > 1) {
      if ((stepMultiValues.value[step.key] ?? []).filter(Boolean).length < count) return false;
    } else {
      if (!stepValues.value[step.key]) return false;
    }
  }
  return true;
});

// ── Confirm ────────────────────────────────────────────────────────────────────
async function confirm() {
  error.value = "";
  const update: Record<string, unknown> = {
    level: nextLevel.value,
    proficiency_bonus: newProfBonus.value,
    max_hp: props.member.max_hp + hpGain.value,
    current_hp: props.member.current_hp + hpGain.value,
    hit_dice_remaining: newHitDiceCount.value,
  };

  // Spell slots — use the multiclass-aware combined table so that e.g. a
  // Paladin/Wizard character gets the correct merged slot count, not just the
  // Wizard's own per-class progression.
  if (postLevelupSpellSlots.value.length > 0) {
    const existing = props.member.spell_slots ?? [];
    update.spell_slots = postLevelupSpellSlots.value.map(s => ({
      ...s,
      used: existing.find(e => e.level === s.level)?.used ?? 0,
    }));
  }

  // ASI or feat
  if (grantsAsi.value) {
    if (asiMode.value === "plus2" && asiPrimary.value) {
      update[asiPrimary.value] = (props.member[asiPrimary.value as keyof PartyMember] as number) + 2;
    } else if (asiMode.value === "plus1plus1") {
      if (asiPrimary.value) update[asiPrimary.value] = (props.member[asiPrimary.value as keyof PartyMember] as number) + 1;
      if (asiSecondary.value) update[asiSecondary.value] = (props.member[asiSecondary.value as keyof PartyMember] as number) + 1;
    }
    // feat: saved in class_choices below
  }

  // Class resources
  const defs = classDefs.value;
  if (defs.length > 0) {
    const newResources = { ...props.member.class_resources };
    for (const def of defs) {
      const newMax = def.maxAtLevel(levelInChosenClass.value);
      const existing = newResources[def.key];
      newResources[def.key] = {
        max:     newMax,
        current: existing ? Math.min(existing.current, newMax) : newMax,
        rest:    def.rest,
      };
    }
    update.class_resources = newResources;
  }

  // Subclass + class_choices
  const newChoices: Record<string, unknown> = { ...props.member.class_choices };

  const subclass = subclassInput.value.trim();
  const leveledEntryIsPrimary = chosenExistingEntry.value?.is_primary ?? (isAddingNewClass.value && existingClassOptions.value.length === 0);
  if (needsSubclassChoice.value && subclass && leveledEntryIsPrimary) {
    // Keep the legacy column in sync only for the primary class; other
    // classes' subclasses live on their character_classes row.
    update.subclass = subclass;
    newChoices.subclass = subclass;
  }

  // When taking a new class, persist the PHB multiclass proficiencies into
  // the member's tool_proficiencies bag so the sheet reflects them. We
  // intentionally keep them in tool_proficiencies (free-text) rather than
  // trying to split by prof category — the grant list is freeform per PHB
  // and not all entries are real tools.
  if (isAddingNewClass.value && newClassProficiencyGrants.value.length > 0) {
    const existingProfs = props.member.tool_proficiencies ?? [];
    const merged = Array.from(new Set([...existingProfs, ...newClassProficiencyGrants.value]));
    update.tool_proficiencies = merged;
  }

  // Feat choice
  if (grantsAsi.value && asiMode.value === "feat" && featId.value) {
    const existing = Array.isArray(newChoices.feats) ? (newChoices.feats as string[]) : [];
    newChoices.feats = [...existing, featId.value];
  }

  // Class-specific step values
  for (const step of classSteps.value) {
    const count = step.count ?? 1;
    if (count > 1) {
      const picks = (stepMultiValues.value[step.key] ?? []).filter(Boolean);
      if (picks.length === 0) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, ...picks];
      } else {
        newChoices[step.key] = picks;
      }
    } else {
      const val = stepValues.value[step.key];
      if (!val) continue;
      if (step.type === "append") {
        const existing = Array.isArray(newChoices[step.key]) ? (newChoices[step.key] as string[]) : [];
        newChoices[step.key] = [...existing, val];
      } else {
        newChoices[step.key] = val;
      }
    }
  }

  if (Object.keys(newChoices).length > Object.keys(props.member.class_choices).length
    || classSteps.value.length > 0 || (needsSubclassChoice.value && subclass)
    || (grantsAsi.value && asiMode.value === "feat" && featId.value)) {
    update.class_choices = newChoices;
  }

  try {
    await updateMember({ id: props.member.id, update: update as PartyMemberUpdate });

    // Persist to character_classes: insert a new row for a new class, or
    // increment the levels on the existing row being leveled.
    if (isAddingNewClass.value && newClassName.value) {
      await addCharacterClass({
        party_member_id: props.member.id,
        class_name: newClassName.value,
        subclass_name: null,
        levels: 1,
        is_primary: existingClassOptions.value.length === 0,
        hit_dice_used: 0,
        sort_order: existingClassOptions.value.length,
      });
    } else if (chosenExistingEntry.value) {
      const entry = chosenExistingEntry.value;
      const patch: { levels: number; subclass_name?: string | null } = {
        levels: entry.levels + 1,
      };
      if (needsSubclassChoice.value && subclass) {
        patch.subclass_name = subclass;
      }
      await updateCharacterClass({ id: entry.id, update: patch });
    }

    // Add selected spells and cantrips to character_spells
    for (const spellId of selectedSpellIds.value) {
      await addSpell({ partyMemberId: props.member.id, spellId, isPrepared: false });
    }
    for (const spellId of selectedCantripIds.value) {
      await addSpell({ partyMemberId: props.member.id, spellId, isPrepared: false });
    }

    // Auto-grant spells from Eldritch Invocations that were just picked
    for (const step of classSteps.value) {
      if (step.key !== "eldritch_invocations") continue;
      const count = step.count ?? 1;
      const picks = count > 1
        ? (stepMultiValues.value[step.key] ?? []).filter(Boolean)
        : stepValues.value[step.key] ? [stepValues.value[step.key]] : [];
      for (const name of picks) {
        const inv = ELDRITCH_INVOCATIONS_MAP.get(name);
        if (!inv?.grants_spell) continue;
        await addInvocationSpellGrant(
          props.member.id,
          inv.grants_spell,
          name,
          inv.spell_uses_per_day ?? null,
        );
      }
    }

    // Persist this level's choices so de-leveling can reverse them exactly
    const choiceEntry: LevelChoiceEntry = {
      class_name: memberClass.value,
      is_new_class: isAddingNewClass.value,
      hp_gained: hpGain.value,
    };
    if (grantsAsi.value) {
      choiceEntry.asi = {
        mode: asiMode.value,
        ...(asiPrimary.value ? { primary: asiPrimary.value } : {}),
        ...(asiMode.value === 'plus1plus1' && asiSecondary.value ? { secondary: asiSecondary.value } : {}),
        ...(asiMode.value === 'feat' && featId.value ? { feat_id: featId.value } : {}),
      };
    }
    if (needsSubclassChoice.value && subclassInput.value.trim()) {
      choiceEntry.subclass = subclassInput.value.trim();
    }
    if (selectedSpellIds.value.size > 0) {
      choiceEntry.spells_learned = [...selectedSpellIds.value];
    }
    if (selectedCantripIds.value.size > 0) {
      choiceEntry.cantrips_learned = [...selectedCantripIds.value];
    }
    const allStepChoices: Record<string, string | string[]> = {};
    for (const step of classSteps.value) {
      if ((step.count ?? 1) > 1) {
        const picks = (stepMultiValues.value[step.key] ?? []).filter(Boolean);
        if (picks.length) allStepChoices[step.key] = picks;
      } else if (stepValues.value[step.key]) {
        allStepChoices[step.key] = stepValues.value[step.key];
      }
    }
    if (Object.keys(allStepChoices).length) choiceEntry.step_choices = allStepChoices;
    if (isAddingNewClass.value && newClassProficiencyGrants.value.length > 0) {
      choiceEntry.new_class_profs = newClassProficiencyGrants.value;
    }
    const newLevelChoices: LevelChoices = {
      ...props.member.level_choices,
      [nextLevel.value]: choiceEntry,
    };
    await updateMember({ id: props.member.id, update: { level_choices: newLevelChoices } });

    // Multi-level loop: keep going if we haven't reached targetLevel yet
    if (props.targetLevel && nextLevel.value < props.targetLevel) {
      void router.push(`/play/character/levelup?targetLevel=${props.targetLevel}`);
    } else {
      void router.push(props.backRoute ?? "/play");
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to apply level up.";
  }
}
</script>
