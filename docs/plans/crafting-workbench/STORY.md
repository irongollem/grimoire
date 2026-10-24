# Player crafting: the workbench

Status: design handoff and art planning, 19 October 2026. Proposed experience, not shipped behavior.

## Story

As a player, I want to lay my recipe's materials out on a workbench suited to my craft, so attempting a recipe feels like making something with those materials.

The existing crafting system already supplies recipes, ingredient and output artwork, inventory checks, tool requirements, modifiers and server-resolved outcomes. The opportunity is the interaction surface: an anvil for a smith, vessels for an alchemist, a cutting surface for a leatherworker. Ingredients should feel placed into that workspace rather than displayed as portrait cards above a button.

The maintainer's direction: “an anvil for a smith etc. something to ‘slot’ the ingredients in etc. to give that makey crafting-table feeling.” After the first example: “we'd need sprites for the ingredients that fit within the bowls to make it visually work.”

## Requested next step

Claude Code and Claude Design should inspect the current crafting implementation and design the complete player workbench experience together. Return a comprehensive, deduplicated art manifest and generation briefs to the maintainer, who will bring them back to this image-generation session. This handoff requests design and asset planning; it does not authorize a bulk generation run or production implementation.

Use the smithing examples as an exploration of the idea, not a fixed layout or a requirement that every craft use four bowls. Resolve the interaction and responsive composition before commissioning all the art.

## Example assets

All three were made with the built-in image-generation tool. These are local concept assets, not published application assets.

- [Empty smithing workbench](smithing-empty.png): anvil, forge, tools and four empty dishes.
- [Transparent ingredient sheet](ingredient-sprites.png): iron ingots, leather strips, charcoal and blue crystal fragments.
- [Populated smithing preview](smithing-populated-preview.png): illustrates the intended visual relationship of materials resting inside dishes.

The populated preview is an AI-composited illustration, not evidence of actual sprite placement or working UI. The sprite sheet still needs alpha/edge inspection, slicing and sizing before use. Treat its four materials as test subjects, not verified ingredients for a particular live recipe. The current art is quite detailed; evaluate whether quieter surfaces improve UI readability.

## Experience to design

Keep recipe discovery fast and scannable. Opening a crafting attempt brings the player to the discipline's workspace, with the chosen recipe, materials and requirements immediately understandable.

1. The workspace presents each required ingredient in a physical receptacle or placement area. Available materials appear as separate sprites resting on the surface. Labels state the ingredient, required amount and available amount.
2. Tapping a slot can inspect the requirement and, where the existing mechanics permit a choice, choose a matching inventory material. Tag-based requirements need an explicit design for showing eligible alternatives and the selected material. Do not imply player-controlled consumption choices that the current server cannot honor; identify any necessary mechanics change separately.
3. Missing, insufficient and locked states stay legible through text and shape as well as colour. An empty slot is a useful visual cue, but must explain what is missing. Tool and proficiency restrictions remain visible.
4. The player can review crafting time, DC, applicable proficiency, disadvantage and optional modifiers without hunting around the scene. Illustration does not obscure these facts.
5. One deliberate action submits the existing crafting attempt. Optional brief visual feedback can give heat, mixing or making a sense of motion, while the server remains authoritative. Avoid repeated submissions and unnecessary waiting.
6. Show the actual roll and outcome clearly, including success, failure, ruin, consumption and returned ruined materials. Preserve the existing chat result. Do not make an already-spent ingredient look like a newly unmet requirement after the attempt.

Dragging may supplement tapping, but cannot be required. Design touch, keyboard, screen-reader and reduced-motion behavior. On small screens, slots and controls must remain readable rather than shrinking a complete desktop scene into a tiny picture.

## Components and art boundaries

| Layer/component | Responsibility |
| --- | --- |
| Discipline workspace | Illustrated working surface and characteristic apparatus: anvil, vessels, loom, desk, etc. |
| Ingredient receptacle / placement slot | Reusable slot with stable geometry and a clear placement anchor; may be a dish, tray, mat or unadorned area appropriate to the craft. |
| Ingredient sprite | Transparent isolated material with consistent view angle, scale rules and lighting. No baked-in bowl, labels, background or external cast shadow. |
| Contact shadow / occlusion | Makes the material sit on or inside the surface. Decide whether a reusable shadow and foreground rim layer are needed. |
| Ingredient controls | Real UI for name, quantities, availability, selection, focus and disabled state. |
| Recipe / result area | Clear place for the recipe's existing output art and the eventual outcome. Avoid generating duplicate output art. |
| Attempt controls and feedback | Existing requirements, modifiers, submit action, roll and outcome, with optional restrained effects. |

Separate reusable art from dynamic UI. Do not bake labels, quantities, buttons, statuses or recipe-specific contents into a background. Prefer sprites reusable across recipes and compatible workspaces over one full illustration per recipe. A fixed four-dish background may fail recipes with other ingredient counts: explicitly solve one, several, and many ingredients, including manual recipes beyond AI generation's five-ingredient cap.

A drawn premium forge must not silently claim the character has the workspace bonus. Distinguish the workspace's visual theme from actual tool/workspace availability and modifier selection.

## Discipline coverage

Use `src/lib/crafting/disciplines.ts` as the authoritative inventory. At drafting time it contains 15 disciplines: alchemy, smithing, leathercraft, woodcraft, jewelcrafting, herbalism, poisoncraft, tinkering, cooking, scribing, forgery, brewing, weaving, masonry and painting. Enchanting was a conversational example, not a current discipline to add.

For each discipline propose its work surface, apparatus, material placement scheme and useful feedback. Identify which surfaces, containers, materials and effects can be shared. Cover ordinary materials, specific-item requirements, tag requirements and campaign-created ingredients without demanding new custom art for every possible homebrew item. Design an intentional neutral material presentation for cases without a matching sprite.

## Art direction

The established collection lives at `~/Desktop/art-955/`. Read `gpt-monsters/ITEMS.md` for context and `gpt/PROMPT.md` for the canonical shared STYLE block; `gpt-monsters/next.mjs` loads that block. Do not run the existing batch queue or alter its logs for this story.

Preserve this style block in generation briefs:

> Refined semi-realistic painterly fantasy illustration. Clearly illustrated, polished, and non-photographic. Controlled brushwork, clean shape design, clear form modeling, readable anatomy, expressive faces, strong silhouettes, atmospheric depth, restrained texture, and a cohesive finished surface. Favor stronger value separation, firmer structure, cleaner edge control, sharper facial planes, and clearer focal hierarchy. Keep colors tasteful and moderately muted with selective accents for clarity and emphasis. Prioritize readability, subject clarity, and elegant painterly fantasy over spectacle or realism. Avoid photorealism, cinematic or camera-driven aesthetics, glossy realism, lens blur, pores, oversharpening, noisy micro-detail, muddy rendering, excessive grit, rough sketchiness, cartoon stylization, anime stylization, overly soft diffusion, fuzzy texture overload, and cluttered ornamental detail that weakens the silhouette or focal read.

The examples also use the collection's cold northern palette and a warm local light. Establish a common camera angle and lighting contract for modular sprites. Review whether strong directional lighting limits reuse between disciplines. Existing item-art portrait proportions are specific to the item collection: workspaces and sprites need dimensions chosen for their actual UI roles.

## Required handback

Return these together, ready for review and subsequent image generation:

- Annotated desktop and phone designs showing recipe selection → prepared workbench → requirements unmet → submitting → each outcome. Include a keyboard/focus treatment and wildcard ingredient selection.
- A discipline coverage matrix and explicit decisions on slot count/layout, sprite selection, homebrew coverage, shadows/occlusion and responsive composition.
- A comprehensive asset manifest, preferably structured JSON plus a readable table. Each entry needs a stable asset id and filename, category, disciplines and recipes served, visual subject, dimensions/aspect ratio, transparency, camera angle, lighting, padding/safe area, placement anchor and expected display size. Record required variants, dependencies/reference assets, priority, and whether it reuses existing art or requires generation. Group shared materials and count unique assets rather than per-recipe duplicates.
- Exact generation-ready prompts combining the shared style block with each asset's subject and composition constraints. Include negatives, alpha requirements, references and concrete acceptance checks. State the common sprite scale/perspective contract once and reference it consistently.
- A phased generation order: first a representative end-to-end smithing set, then a contrasting discipline to test reuse, then complete coverage. Separate essential assets from optional decorative/effect variants.
- Implementation notes grounded in the actual code: component boundaries, how recipes/materials map to art, asset loading and memory budget, visibility restrictions, and any backend changes required by proposed selection behavior. Distinguish verified facts from proposals.

## Code context and acceptance

Start with `context/features/items-spells-crafting.md`, `context/features/player-portal.md`, `src/views/player/PlayerCraftingView.vue`, `src/components/crafting/`, `src/composables/crafting/`, `src/types/crafting.types.ts` and `src/lib/crafting/disciplines.ts`. Read the existing attempt flow rather than redesigning its rules from this brief. Use `context/compliance/ai-act.md` for the existing image provenance/disclosure path when assets eventually enter the app.

There was active uncommitted recipe-art work during this exploration, including `RecipePictureField.vue`, `useRecipeArt.ts`, `recipeArt.ts` and player crafting changes. Inspect current state and coordinate with its owner before editing. This proposal builds on the existing item/recipe art, which the maintainer considers sufficient.

The design is ready for generation when it demonstrates that the ingredients look physically placed, the crafting facts remain readable on a phone, every current discipline has a coverage plan, variable recipes fit, and the manifest is precise enough for another session to generate assets without inventing missing layout or style decisions. No changes to recipe visibility, inventory authority, crafting probabilities or rewards are implied by this visual enhancement.
