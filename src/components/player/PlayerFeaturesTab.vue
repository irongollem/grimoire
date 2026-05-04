<template>
  <div class="space-y-4">

    <!-- ── Beast traits (only when wildshaped) ──────────────────────────────── -->
    <div
      v-if="wildshapeMonster?.stat_block?.special_abilities?.length"
      class="rounded-lg border border-primary/30 bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-primary/80 tracking-wider">
          Beast Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ wildshapeMonster.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in wildshapeMonster.stat_block.special_abilities"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2 cursor-pointer"
            @click="toggleExpanded(`beast-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0" :class="expanded.has(`beast-${trait.name}`) ? 'rotate-180' : ''" />
          </button>
          <div v-if="expanded.has(`beast-${trait.name}`)" class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed">
            {{ trait.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Rest buttons (hidden when header already provides them) ────────── -->
    <div v-if="showRestButtons" class="flex gap-2">
      <button
        class="flex-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-cinzel text-xs text-amber-600 hover:bg-amber-500/20 transition-colors"
        @click="shortRest"
      >Short Rest</button>
      <button
        class="flex-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 font-cinzel text-xs text-blue-600 hover:bg-blue-500/20 transition-colors"
        @click="longRest"
      >Long Rest</button>
    </div>

    <!-- ── Resource pools ─────────────────────────────────────────────────── -->
    <div v-if="displayedResources.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Resources</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="res in displayedResources"
          :key="res.key"
          class="flex items-center gap-2 px-4 py-2.5 flex-wrap"
        >
          <span class="font-fell text-sm text-foreground flex-1">{{ res.label }}</span>
          <span
            class="font-cinzel text-2xs md:text-sm tracking-wider rounded px-1.5 py-0.5 shrink-0"
            :class="res.rest === 'short'
              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'"
          >{{ res.rest === "short" ? "Short" : "Long" }}</span>

          <!-- Variable-spend: Lay on Hands -->
          <template v-if="res.key === 'lay_on_hands'">
            <span class="font-cinzel text-sm text-foreground shrink-0">{{ res.current }} / {{ res.max }}</span>
            <template v-if="pendingSpendKey === res.key">
              <input
                v-model.number="pendingSpendAmount"
                type="number"
                min="1"
                :max="res.current"
                class="w-14 rounded border border-border bg-muted/40 px-2 py-0.5 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span class="font-fell text-xs text-muted-foreground shrink-0">HP</span>
              <button
                class="h-6 px-2 rounded border border-border font-cinzel text-xs text-primary hover:border-primary/40 disabled:opacity-30 transition-colors"
                :disabled="pendingSpendAmount < 1 || pendingSpendAmount > res.current"
                @click="confirmSpend"
              >✓</button>
              <button
                class="h-6 px-2 rounded border border-border font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
                @click="cancelSpend"
              >✗</button>
            </template>
            <template v-else>
              <button
                class="h-6 rounded border border-border font-cinzel text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 px-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                :disabled="res.current <= 0"
                @click="openSpendInput(res.key)"
              >Spend</button>
              <button
                class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                :disabled="res.current >= res.max"
                @click="restoreResource(res.key)"
              >+</button>
            </template>
          </template>

          <!-- Standard ±1 resource -->
          <div v-else class="flex items-center gap-1.5 shrink-0">
            <button
              class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              :disabled="res.current <= 0"
              @click="spendResource(res.key)"
            >−</button>
            <span class="font-cinzel text-sm text-foreground w-10 text-center">
              {{ res.current }} / {{ res.max }}
            </span>
            <button
              class="h-6 w-6 rounded border border-border font-cinzel text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              :disabled="res.current >= res.max"
              @click="restoreResource(res.key)"
            >+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Class features (one card per class, grouped for multiclass) ──────── -->
    <template v-for="group in classFeatureGroups" :key="group.class_name">
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border">
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
            {{ group.class_name || 'Class' }} Features
            <span v-if="group.subclass_name" class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ group.subclass_name }})</span>
          </p>
        </div>

        <div
          v-if="Object.keys(group.featuresByLevel).length === 0 && Object.keys(group.subclassFeaturesByLevel).length === 0"
          class="px-4 py-3"
        >
          <p class="font-fell text-sm text-muted-foreground italic">No class features defined yet.</p>
        </div>

        <div v-else class="divide-y divide-border">
          <!-- Class features -->
          <template v-for="(features, lvl) in group.featuresByLevel" :key="lvl">
            <div
              v-for="feat in features"
              :key="`${group.class_name}-${lvl}-${featureName(feat)}`"
              class="px-4 py-2.5"
            >
              <button
                class="w-full text-left flex items-center gap-3 cursor-pointer"
                @click="isSpellcasting(featureName(feat)) ? router.push('/play/spells') : featureDescription(feat) && toggleExpanded(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
              >
                <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ lvl }}</span>
                <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
                <Sparkles v-if="isSpellcasting(featureName(feat))" class="h-3 w-3 text-primary/60 shrink-0" />
                <ChevronDown
                  v-else-if="featureDescription(feat)"
                  class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
                  :class="expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="!isSpellcasting(featureName(feat)) && featureDescription(feat) && expanded.has(`class-${group.class_name}-${lvl}-${featureName(feat)}`)"
                class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
              >
                <RichTextViewer :content="featureDescription(feat)!" />
              </div>
            </div>
          </template>
          <!-- Subclass features inline (subtle tint + "Subclass" badge) -->
          <template v-for="(subFeats, lvl) in group.subclassFeaturesByLevel" :key="`sub-${lvl}`">
            <div
              v-for="feat in subFeats"
              :key="`${group.class_name}-sub-${lvl}-${featureName(feat)}`"
              class="px-4 py-2.5 bg-primary/3"
            >
              <button
                class="w-full text-left flex items-center gap-3 cursor-pointer"
                @click="isSpellcasting(featureName(feat)) ? router.push('/play/spells') : featureDescription(feat) && toggleExpanded(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
              >
                <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ lvl }}</span>
                <span class="font-fell text-sm text-foreground flex-1">{{ featureName(feat) }}</span>
                <span class="font-cinzel text-2xs md:text-sm text-primary/60 tracking-wider shrink-0 mr-1">Subclass</span>
                <Sparkles v-if="isSpellcasting(featureName(feat))" class="h-3 w-3 text-primary/60 shrink-0" />
                <ChevronDown
                  v-else-if="featureDescription(feat)"
                  class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
                  :class="expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`) ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="!isSpellcasting(featureName(feat)) && featureDescription(feat) && expanded.has(`sub-${group.class_name}-${lvl}-${featureName(feat)}`)"
                class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2"
              >
                <RichTextViewer :content="featureDescription(feat)!" />
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ── Spell choices ─────────────────────────────────────────────────── -->
    <div v-if="spellPickSteps.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spell Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div v-for="step in spellPickSteps" :key="step.key" class="px-4 py-3 space-y-2">
          <div class="flex items-baseline gap-3">
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ step.level }}</span>
            <span class="font-fell text-sm font-semibold text-foreground">{{ step.label }}</span>
          </div>
          <p v-if="step.description" class="font-fell text-xs text-muted-foreground pl-13">{{ step.description }}</p>
          <!-- Already picked -->
          <div v-if="spellChoicesForStep(step.key).length" class="pl-13 flex flex-wrap gap-1.5">
            <span
              v-for="(name, i) in spellChoicesForStep(step.key)"
              :key="i"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ name }}</span>
          </div>
          <!-- Not yet picked -->
          <div v-else class="pl-13 flex items-center gap-2">
            <select
              v-model="pendingSpellPicks[step.key]"
              class="flex-1 bg-muted/40 border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="" disabled>Choose a spell…</option>
              <option v-for="opt in step.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <button
              :disabled="!pendingSpellPicks[step.key]"
              class="px-2.5 py-1 bg-primary text-primary-foreground rounded font-cinzel text-2xs md:text-sm tracking-wider disabled:opacity-40 transition-opacity hover:opacity-90"
              @click="confirmSpellPick(step.key)"
            >Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Racial traits ─────────────────────────────────────────────────────── -->
    <div v-if="linkedSpecies && linkedSpecies.traits?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          Racial Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ linkedSpecies.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in linkedSpecies.traits"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2"
            :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
            @click="trait.description && toggleExpanded(`racial-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown
              v-if="trait.description"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`racial-${trait.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="trait.description && expanded.has(`racial-${trait.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            <RichTextViewer :content="trait.description" />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Subrace traits ─────────────────────────────────────────────────────── -->
    <div v-if="linkedSubrace && linkedSubrace.traits?.length" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
          Variant Traits
          <span class="normal-case font-fell font-normal tracking-normal ml-1 text-muted-foreground/70">({{ linkedSubrace.name }})</span>
        </p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="trait in linkedSubrace.traits"
          :key="trait.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2"
            :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
            @click="trait.description && toggleExpanded(`subrace-${trait.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ trait.name }}</span>
            <ChevronDown
              v-if="trait.description"
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`subrace-${trait.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="trait.description && expanded.has(`subrace-${trait.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            <RichTextViewer :content="trait.description" />
          </div>
        </div>
      </div>
    </div>


    <!-- ── Languages & Tool Proficiencies ───────────────────────────────────── -->
    <div
      v-if="member.languages?.length || member.tool_proficiencies?.length"
      class="rounded-lg border border-border bg-card overflow-hidden"
    >
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Proficiencies & Languages</p>
      </div>
      <div class="divide-y divide-border">
        <div v-if="member.languages?.length" class="flex gap-3 px-4 py-2.5">
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">Languages</span>
          <div class="flex flex-wrap gap-1.5">
            <template v-for="lang in member.languages" :key="lang">
              <RouterLink
                v-if="isOwner && isChoicePlaceholder(lang)"
                to="/play/character/edit?tab=profs"
                class="inline-flex items-center rounded-md bg-primary/8 border border-primary/30 border-dashed px-2 py-0.5 font-fell text-sm text-primary/70 hover:text-primary hover:bg-primary/15 transition-colors"
                :title="'Tap to choose a language'"
              >{{ lang }}</RouterLink>
              <span
                v-else
                class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 font-fell text-sm text-foreground"
              >{{ lang }}</span>
            </template>
          </div>
        </div>
        <div v-if="member.tool_proficiencies?.length" class="flex gap-3 px-4 py-2.5">
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">Tools</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tool in member.tool_proficiencies"
              :key="tool"
              class="inline-flex items-center rounded-md bg-muted/50 border border-border px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ tool }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Class choices ───────────────────────────────────────────────────── -->
    <div v-if="choiceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Choices</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="entry in choiceEntries"
          :key="entry.key"
          class="flex gap-3 px-4 py-2.5"
        >
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-32 shrink-0 pt-0.5">
            {{ entry.label }}
          </span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="val in entry.values"
              :key="val"
              class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
            >{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Metamagic ─────────────────────────────────────────────────────── -->
    <div v-if="knownMetamagic.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Metamagic</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="opt in knownMetamagic"
          :key="opt.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2 cursor-pointer"
            @click="toggleExpanded(`metamagic-${opt.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ opt.name }}</span>
            <span class="font-cinzel text-2xs tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-primary/10 text-primary border border-primary/20">
              {{ opt.sp_cost }} SP
            </span>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`metamagic-${opt.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="expanded.has(`metamagic-${opt.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            {{ opt.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Eldritch Invocations (Warlock) ──────────────────────────────────── -->
    <div v-if="knownInvocations.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Eldritch Invocations</p>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="inv in knownInvocations"
          :key="inv.name"
          class="px-4 py-2.5"
        >
          <button
            class="w-full text-left flex items-center gap-2 cursor-pointer"
            @click="toggleExpanded(`invocation-${inv.name}`)"
          >
            <span class="font-fell text-sm text-foreground flex-1">{{ inv.name }}</span>
            <span
              v-if="inv.grants_spell"
              class="font-cinzel text-2xs tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-primary/10 text-primary border border-primary/20"
            >Spell</span>
            <span
              v-if="inv.min_level > 2"
              class="font-cinzel text-2xs tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-muted/50 text-muted-foreground border border-border"
            >Lv {{ inv.min_level }}+</span>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
              :class="expanded.has(`invocation-${inv.name}`) ? 'rotate-180' : ''"
            />
          </button>
          <div
            v-if="expanded.has(`invocation-${inv.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            {{ inv.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Divine Smite (Paladin) ───────────────────────────────────────────── -->
    <div v-if="isPaladin" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Divine Smite</p>
      </div>
      <div class="divide-y divide-border">
        <div v-for="row in DIVINE_SMITE_TABLE" :key="row.slotLevel" class="flex items-center gap-3 px-4 py-2">
          <span class="font-cinzel text-2xs text-muted-foreground tracking-wider w-14 shrink-0">Slot {{ row.slotLevel }}</span>
          <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ row.damage }} radiant</span>
          <span class="font-fell text-xs text-muted-foreground italic shrink-0">{{ row.special }} vs undead/fiends</span>
        </div>
      </div>
      <div class="px-4 py-2 border-t border-border">
        <p class="font-fell text-xs text-muted-foreground italic">Expend a spell slot after a melee hit. Max 5d8 (+ 1d8 vs undead/fiends).</p>
      </div>
    </div>

    <!-- ── Infusions (Artificer) ──────────────────────────────────────────── -->
    <div v-if="isArtificer && artificerLevel >= 2" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Infusions</p>
        <span class="font-cinzel text-2xs tracking-wider text-muted-foreground">
          {{ localActiveInfusions.length }} / {{ infusionSlotsMax }} active
        </span>
      </div>

      <!-- Unified known infusions list — active ones highlighted, inactive show Apply -->
      <div class="divide-y divide-border">
        <div v-for="inf in knownInfusions" :key="inf.name" class="px-4 py-2.5">

          <!-- Row: name + item name + badges + actions -->
          <div class="flex items-center gap-2">
            <button
              class="flex-1 min-w-0 text-left flex items-center gap-2 cursor-pointer"
              @click="toggleExpanded(`infusion-${inf.name}`)"
            >
              <span
                class="font-fell text-sm flex-1 min-w-0 truncate"
                :class="isInfusionActive(inf.name) ? 'text-primary' : 'text-foreground'"
              >{{ inf.name }}</span>
              <span
                v-if="activeInfusionItemName(inf.name)"
                class="font-fell text-xs text-muted-foreground italic shrink-0"
              >{{ activeInfusionItemName(inf.name) }}</span>
              <span
                v-if="inf.min_level > 2"
                class="font-cinzel text-2xs tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-muted/50 text-muted-foreground border border-border"
              >Lv {{ inf.min_level }}+</span>
              <span
                v-if="isInfusionActive(inf.name)"
                class="font-cinzel text-2xs tracking-wider rounded px-1.5 py-0.5 shrink-0 bg-primary/10 text-primary border border-primary/20"
              >Active</span>
              <ChevronDown
                class="h-3 w-3 text-muted-foreground/60 transition-transform shrink-0"
                :class="expanded.has(`infusion-${inf.name}`) ? 'rotate-180' : ''"
              />
            </button>
            <button
              v-if="isInfusionActive(inf.name)"
              class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-destructive transition-colors shrink-0"
              @click="removeActiveInfusionByName(inf.name)"
            >Remove</button>
            <button
              v-else-if="!isInfusionActive(inf.name) && localActiveInfusions.length < infusionSlotsMax"
              class="font-cinzel text-2xs tracking-wider text-primary hover:opacity-80 transition-opacity shrink-0"
              @click="openApplyForm(inf.name)"
            >Apply</button>
          </div>

          <!-- Inline apply form (opens per-row) -->
          <div v-if="pendingApplyName === inf.name" class="mt-2 space-y-2">
            <select
              v-model="pendingInfusionItemId"
              class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No specific item</option>
              <option v-for="item in memberInventoryItems" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
            <div class="flex gap-2">
              <button
                class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                @click="applyInfusion"
              >Confirm</button>
              <button
                class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
                @click="cancelInfusionForm"
              >Cancel</button>
            </div>
          </div>

          <!-- Description -->
          <div
            v-if="expanded.has(`infusion-${inf.name}`)"
            class="mt-2 rounded-md bg-muted/30 border border-border/60 px-3 py-2 font-fell text-sm text-muted-foreground leading-relaxed"
          >
            {{ inf.description }}
          </div>
        </div>
      </div>

      <!-- Learn new infusion -->
      <div v-if="availableInfusionsToLearn.length > 0" class="px-4 py-2.5 border-t border-border">
        <div v-if="!showLearnForm" class="flex justify-start">
          <button
            class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            @click="showLearnForm = true"
          >+ Learn Infusion</button>
        </div>
        <div v-else class="space-y-2">
          <select
            v-model="pendingLearnName"
            class="w-full rounded border border-border bg-muted/40 px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Select infusion to learn…</option>
            <option v-for="inf in availableInfusionsToLearn" :key="inf.name" :value="inf.name">
              {{ inf.name }}{{ inf.min_level > 2 ? ` (Lv ${inf.min_level}+)` : '' }}
            </option>
          </select>
          <div class="flex gap-2">
            <button
              :disabled="!pendingLearnName"
              class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
              @click="learnInfusion"
            >Learn</button>
            <button
              class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              @click="showLearnForm = false; pendingLearnName = ''"
            >Cancel</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { ChevronDown, Sparkles } from "lucide-vue-next";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { METAMAGIC_MAP } from "@/data/metamagic";
import { ARTIFICER_INFUSIONS, ARTIFICER_INFUSIONS_MAP } from "@/data/artificerInfusions";
import { ELDRITCH_INVOCATIONS_MAP } from "@/data/eldritchInvocations";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { featureName, featureDescription, mapFeatureIds, type FeatureEntry } from "@/levelup/types";
import type { CustomStep } from "@/levelup/customTypes";
import { useAllFeatures } from "@/composables/useFeatures";
import { getDefaultSpellSlots, getSlotRecovery, getMulticlassSpellSlots } from "@/types/spell.types";
import { useClassByName, useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useCustomSubclassByClassAndSubclass, useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import type { SystemClass, CustomClass, CustomSubclass } from "@/levelup/customTypes";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useAllSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import type { PartyMember, SpellSlotEntry } from "@/types/party.types";
import type { Monster } from "@/types/monster.types";

const props = defineProps<{ member: PartyMember; showRestButtons?: boolean; wildshapeMonster?: Monster; isOwner?: boolean }>();

const router = useRouter();

function isChoicePlaceholder(s: string): boolean {
  return s.toLowerCase().includes("choice");
}

function isSpellcasting(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("spellcasting") || n === "pact magic";
}

const memberClassRef    = computed(() => props.member.class ?? "");
const memberSubclassRef = computed(() => props.member.subclass ?? "");
const classData = useClassByName(memberClassRef);
const { data: allFeatures } = useAllFeatures();
const { data: customSubclass } = useCustomSubclassByClassAndSubclass(memberClassRef, memberSubclassRef);

const { mutate: updateMember } = useUpdatePartyMember();
const { confirm } = useConfirm();
const { data: allSpecies } = useAllSpecies();
const linkedSpecies = computed(() =>
  (allSpecies.value ?? []).find((s) => s.id === props.member.species_id) ?? null,
);
const linkedSubrace = computed(() =>
  props.member.subrace && linkedSpecies.value?.subraces
    ? (linkedSpecies.value.subraces.find(sr => sr.name === props.member.subrace) ?? null)
    : null,
);

const featureObjectMap = computed(() => new Map((allFeatures.value ?? []).map(f => [f.id, f])));

// ── Multiclass feature grouping ───────────────────────────────────────────────

const memberIdRef = computed(() => props.member.id);
const { data: characterClasses } = useCharacterClasses(memberIdRef);
const { data: allSystemClasses } = useAllSystemClasses();
const { data: allCustomClasses } = useAllCustomClasses();
const { data: allCustomSubclassEntries } = useAllCustomSubclasses();

/** class_name → class data (custom wins over system on name collision). */
const classDataMap = computed(() => {
  const map = new Map<string, SystemClass | CustomClass>();
  for (const c of allSystemClasses.value ?? []) map.set(c.class_name, c);
  for (const c of allCustomClasses.value ?? []) map.set(c.class_name, c);
  return map;
});

/** "ClassName::SubclassName" → subclass data. */
const subclassDataMap = computed(() => {
  const map = new Map<string, CustomSubclass>();
  for (const s of allCustomSubclassEntries.value ?? []) {
    map.set(`${s.class_name}::${s.subclass_name}`, s);
  }
  return map;
});

interface ClassFeatureGroup {
  class_name: string;
  subclass_name: string | null;
  levels: number;
  featuresByLevel: Record<number, FeatureEntry[]>;
  subclassFeaturesByLevel: Record<number, FeatureEntry[]>;
}

function buildFeaturesByLevel(
  cls: { features: Record<string, string[]> } | null | undefined,
  maxLevel: number,
): Record<number, FeatureEntry[]> {
  if (!cls) return {};
  const result: Record<number, FeatureEntry[]> = {};
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const entries = mapFeatureIds(cls.features[lvl.toString()] ?? [], featureObjectMap.value);
    if (entries.length > 0) result[lvl] = entries;
  }
  return result;
}

/** Feature groups keyed by class — one per character_classes row. */
const classFeatureGroups = computed<ClassFeatureGroup[]>(() =>
  (characterClasses.value ?? []).map(cc => ({
    class_name: cc.class_name,
    subclass_name: cc.subclass_name,
    levels: cc.levels,
    featuresByLevel: buildFeaturesByLevel(classDataMap.value.get(cc.class_name), cc.levels),
    subclassFeaturesByLevel: cc.subclass_name
      ? buildFeaturesByLevel(subclassDataMap.value.get(`${cc.class_name}::${cc.subclass_name}`), cc.levels)
      : {},
  }))
);

// ── Local optimistic state ────────────────────────────────────────────────────

interface LocalResource {
  key: string;
  label: string;
  current: number;
  max: number;
  rest: "short" | "long";
}

const localResources = ref<LocalResource[]>([]);

function syncFromProps() {
  localResources.value = Object.entries(props.member.class_resources ?? {}).map(([key, res]) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    current: res.current,
    max: res.max,
    rest: res.rest,
  }));
}

watch(() => [props.member.id, props.member.updated_at], syncFromProps, { immediate: true });

// Spell slots — single source of truth: TanStack Query cache via props.member.spell_slots.
// Falls back to multiclass or per-class defaults when DB has no stored slots yet.
const effectiveSlots = computed((): SpellSlotEntry[] => {
  const m = props.member;
  if (m.spell_slots?.length) return m.spell_slots;
  const list = (characterClasses.value ?? []).map((c) => ({ class_name: c.class_name, levels: c.levels }));
  if (list.length > 0) return getMulticlassSpellSlots(list);
  return getDefaultSpellSlots(m.class, m.level);
});

// ── Persist helpers ───────────────────────────────────────────────────────────

function persistResources() {
  const class_resources = Object.fromEntries(
    localResources.value.map(r => [r.key, { current: r.current, max: r.max, rest: r.rest }]),
  );
  updateMember({ id: props.member.id, update: { class_resources } });
}

// ── Resource controls ─────────────────────────────────────────────────────────

function spendResource(key: string) {
  const r = localResources.value.find(r => r.key === key);
  if (!r || r.current <= 0) return;
  r.current--;
  persistResources();
}

function restoreResource(key: string) {
  const r = localResources.value.find(r => r.key === key);
  if (!r || r.current >= r.max) return;
  r.current++;
  persistResources();
}

// ── Rest ──────────────────────────────────────────────────────────────────────

function shortRest() {
  // Restore short-rest resources
  for (const r of localResources.value) {
    if (r.rest === "short") r.current = r.max;
  }
  persistResources();

  // Restore spell slots if class recharges on short rest (Warlock pact magic)
  if ((classData.value?.slot_recovery ?? getSlotRecovery(props.member.class)) === "short") {
    updateMember({ id: props.member.id, update: { spell_slots: effectiveSlots.value.map(s => ({ ...s, used: 0 })) } });
  }
}

async function longRest() {
  const ok = await confirm(
    "Take a long rest? This will restore all resources and spell slots.",
    { title: "Long Rest", confirmLabel: "Rest", danger: false },
  );
  if (!ok) return;

  for (const r of localResources.value) r.current = r.max;
  persistResources();

  updateMember({ id: props.member.id, update: { spell_slots: effectiveSlots.value.map(s => ({ ...s, used: 0 })) } });
}


const expanded = ref(new Set<string>());
function toggleExpanded(name: string) {
  if (expanded.value.has(name)) expanded.value.delete(name);
  else expanded.value.add(name);
  expanded.value = new Set(expanded.value); // trigger reactivity
}

// ── Spell pick steps ──────────────────────────────────────────────────────────

/** All spell_pick steps from the class and subclass at levels the character has reached. */
const spellPickSteps = computed((): CustomStep[] => {
  const allSteps = [
    ...(classData.value?.steps ?? []),
    ...(customSubclass.value?.steps ?? []),
  ] as CustomStep[];
  return allSteps.filter(s => s.step_type === "spell_pick" && s.level <= props.member.level);
});

function spellChoicesForStep(stepKey: string): string[] {
  const v = (props.member.class_choices ?? {})[stepKey];
  if (!v) return [];
  return Array.isArray(v) ? (v as string[]) : [String(v)];
}

const pendingSpellPicks = ref<Record<string, string>>({});

function confirmSpellPick(stepKey: string) {
  const picked = pendingSpellPicks.value[stepKey];
  if (!picked) return;
  const newChoices = { ...props.member.class_choices, [stepKey]: picked };
  updateMember({ id: props.member.id, update: { class_choices: newChoices } });
}

// ── Class choices (read-only) ─────────────────────────────────────────────────

const CHOICE_LABELS: Record<string, string> = {
  subclass:               "Subclass",
  fighting_style:         "Fighting Style",
  pact_boon:              "Pact Boon",
  expertise:              "Expertise",
  eldritch_invocations:   "Invocations",
  metamagic_options:      "Metamagic",
  infusions_known:        "Infusions",
  favored_enemy:          "Favored Enemy",
  natural_explorer:       "Natural Explorer",
  ranger_conclave:        "Ranger Conclave",
  divine_domain:          "Divine Domain",
  druid_circle:           "Druid Circle",
  arcane_tradition:       "Arcane Tradition",
  sorcerous_origin:       "Sorcerous Origin",
  bardic_college:         "Bardic College",
  monastic_tradition:     "Monastic Tradition",
  roguish_archetype:      "Roguish Archetype",
  martial_archetype:      "Martial Archetype",
  barbarian_path:         "Primal Path",
};

const choiceEntries = computed(() => {
  const choices = props.member.class_choices ?? {};
  return Object.entries(choices)
    .filter(([key, v]) => key !== "metamagic_options" && key !== "infusions_known" && key !== "eldritch_invocations" && v !== null && v !== undefined && v !== "")
    .map(([key, value]) => ({
      key,
      label: CHOICE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      values: Array.isArray(value) ? (value as string[]) : [String(value)],
    }));
});

const knownMetamagic = computed(() => {
  const raw = props.member.class_choices?.metamagic_options;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => METAMAGIC_MAP.get(n)).filter(Boolean) as import("@/data/metamagic").MetamagicOption[];
});

const knownInvocations = computed(() => {
  const raw = props.member.class_choices?.eldritch_invocations;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => ELDRITCH_INVOCATIONS_MAP.get(n)).filter(Boolean) as import("@/data/eldritchInvocations").EldritchInvocation[];
});

// ── Paladin ───────────────────────────────────────────────────────────────────

const isPaladin = computed(() =>
  props.member.class === "Paladin" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Paladin"),
);

const DIVINE_SMITE_TABLE = [
  { slotLevel: 1,   damage: "2d8", special: "3d8" },
  { slotLevel: 2,   damage: "3d8", special: "4d8" },
  { slotLevel: 3,   damage: "4d8", special: "5d8" },
  { slotLevel: "4+", damage: "5d8", special: "6d8" },
] as const;

// ── Variable-spend (Lay on Hands) ─────────────────────────────────────────────

const pendingSpendKey = ref<string | null>(null);
const pendingSpendAmount = ref<number>(1);

function openSpendInput(key: string) {
  pendingSpendKey.value = key;
  pendingSpendAmount.value = 1;
}

function cancelSpend() {
  pendingSpendKey.value = null;
  pendingSpendAmount.value = 1;
}

function confirmSpend() {
  const key = pendingSpendKey.value;
  if (!key) return;
  const r = localResources.value.find(r => r.key === key);
  if (!r) return;
  const amount = Math.min(Math.max(1, pendingSpendAmount.value), r.current);
  r.current = Math.max(0, r.current - amount);
  persistResources();
  cancelSpend();
}

// ── Resources display (hide infusion_slots — shown in Infusions card instead) ─

const displayedResources = computed(() =>
  localResources.value.filter(r => !(r.key === "infusion_slots" && isArtificer.value)),
);

// ── Infusions (Artificer) ─────────────────────────────────────────────────────

const isArtificer = computed(() =>
  props.member.class === "Artificer" ||
  (characterClasses.value ?? []).some(cc => cc.class_name === "Artificer"),
);

const artificerLevel = computed(() =>
  (characterClasses.value ?? []).find(cc => cc.class_name === "Artificer")?.levels ??
  (props.member.class === "Artificer" ? props.member.level : 0),
);

const { data: partyInventory } = usePartyInventory();

const memberInventoryItems = computed(() =>
  (partyInventory.value ?? []).filter(i => i.carried_by === props.member.id),
);

function inventoryItemName(invItemId: string | null): string {
  if (!invItemId) return "";
  return partyInventory.value?.find(i => i.id === invItemId)?.name ?? "";
}

const knownInfusions = computed(() => {
  const raw = props.member.class_choices?.infusions_known;
  const names: string[] = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  return names.map(n => ARTIFICER_INFUSIONS_MAP.get(n)).filter(Boolean) as import("@/data/artificerInfusions").ArtificerInfusion[];
});

const infusionSlotsMax = computed(() =>
  props.member.class_resources?.infusion_slots?.max ?? 0,
);

const localActiveInfusions = ref<{ name: string; inv_item_id: string | null }[]>([]);

watch(
  () => [props.member.id, props.member.updated_at],
  () => { localActiveInfusions.value = [...(props.member.active_infusions ?? [])]; },
  { immediate: true },
);

function isInfusionActive(name: string): boolean {
  return localActiveInfusions.value.some(a => a.name === name);
}

function activeInfusionEntry(name: string) {
  return localActiveInfusions.value.find(a => a.name === name) ?? null;
}

function activeInfusionItemName(name: string): string {
  const entry = activeInfusionEntry(name);
  if (!entry?.inv_item_id) return "";
  return inventoryItemName(entry.inv_item_id);
}

const availableInfusionsToLearn = computed(() => {
  const known = new Set(knownInfusions.value.map(i => i.name));
  return ARTIFICER_INFUSIONS.filter(inf =>
    inf.min_level <= artificerLevel.value && !known.has(inf.name),
  );
});

const showLearnForm = ref(false);
const pendingLearnName = ref("");

function learnInfusion() {
  if (!pendingLearnName.value) return;
  const current = props.member.class_choices?.infusions_known;
  const existing: string[] = Array.isArray(current) ? (current as string[]) : current ? [String(current)] : [];
  const newChoices = { ...props.member.class_choices, infusions_known: [...existing, pendingLearnName.value] };
  updateMember({ id: props.member.id, update: { class_choices: newChoices } });
  showLearnForm.value = false;
  pendingLearnName.value = "";
}

const pendingApplyName = ref("");
const pendingInfusionItemId = ref<string>("");

function openApplyForm(name: string) {
  pendingApplyName.value = name;
  pendingInfusionItemId.value = "";
}

function cancelInfusionForm() {
  pendingApplyName.value = "";
  pendingInfusionItemId.value = "";
}

function persistActiveInfusions() {
  updateMember({ id: props.member.id, update: { active_infusions: localActiveInfusions.value } });
}

function applyInfusion() {
  if (!pendingApplyName.value) return;
  localActiveInfusions.value = [
    ...localActiveInfusions.value,
    { name: pendingApplyName.value, inv_item_id: pendingInfusionItemId.value || null },
  ];
  persistActiveInfusions();
  cancelInfusionForm();
}

function removeActiveInfusionByName(name: string) {
  localActiveInfusions.value = localActiveInfusions.value.filter(a => a.name !== name);
  persistActiveInfusions();
}
</script>
