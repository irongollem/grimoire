# Spellcasting correctness matrix

The campaign `ruleset` (`2014` or `2024`) is the only edition selector. Homebrew is edition-neutral unless it declares a base ruleset. “Automated” below means the app can enforce or resolve the mechanic; “manual” means Grimoire deliberately shows the rules text without treating incomplete data as authoritative.

| Area | 2014 | 2024 | Verification |
|---|---|---|---|
| Full, half, third, Artificer, and Pact slot progressions | Automated | Automated; revised Paladin/Ranger level-1 slots and multiclass rounding | `spellcastingMatrix.test.ts`, `spell.types.test.ts` |
| Spellcasting vs Pact vs temporary vs feature pools | Automated and separate | Automated and separate | `spellSlots.test.ts`, transaction suite |
| Higher-slot casting and pool selection | Automated | Automated | `spellSlots.test.ts`, transaction suite |
| Slot/use/SP/concentration commit | Atomic | Atomic | transaction and concurrency suites |
| Short/Long Rest recovery | Pool-specific | Pool-specific; Sorcerous Restoration tracked separately | `spellSlots.test.ts`, transaction suite |
| Ritual casting | Class/feature-specific | Prepared-spell ritual rule | `spellcastingPolicy.test.ts` |
| Known/prepared/spellbook limits | Class-level formulas/tables | Revised 20-level tables | `spellPreparationPolicy.test.ts`, transaction suite |
| Replacement windows | Level-up or Long Rest by class | Revised per-class timing/count | `spellPreparationPolicy.test.ts`, transaction suite |
| Multiclass spell DC/attack/source | Source-class ability | Source-class ability | `multiclass.types.test.ts`, source validation trigger |
| Race, feat, item, and other innate grants | At-will or limited-use, separate grants | At-will or limited-use, separate grants | shared cast service, transaction suite |
| Attack/save/area/healing outcomes | Target-aware for reviewed structured data | Target-aware for reviewed structured data | `spellEffects.test.ts`, shared resolver |
| Critical, save-half, cantrip, slot scaling | Automated for reviewed structured data | Automated for reviewed structured data | golden resolver tests |
| Multi-phase/persistent effects | Separate phase controls | Separate phase controls | golden resolver tests |
| Unsupported dice or symbolic mechanics | Visible error/manual | Visible error/manual | dice and resolver tests |
| Unreviewed Open5e mechanics | Manual only | Manual only | `open5eSpellImport.test.ts`, `spellcastingPolicy.test.ts` |
| Metamagic/Flexible Casting | Edition costs/options; atomic | Revised costs/options plus Innate Sorcery, Restoration, Sorcery Incarnate, Arcane Apotheosis | Metamagic/Sorcerer policy and transaction suites |

## Deliberate manual-only boundary

Open5e data enters with `mechanics_reviewed = false`. The UI labels it **Manual**, suppresses damage/healing automation, and asks the player to resolve from the spell text. Automation becomes available only after a complete structured effect record is reviewed. Free-form utility outcomes and prose that cannot be represented by the current effect schema remain manual in both editions.

## Required checks

- `npm test -- --run` runs the isolated 2014/2024 policy and golden-effect fixtures.
- `supabase test db` runs direct-API acquisition and transaction assertions.
- `scripts/test-spell-concurrency.sh` races slots, innate uses, Sorcery Points, and Restoration against row locks.
- `npm run build` and `npm run lint` cover the responsive resolver and casting workflow.
