-- The recipe generator stops writing the workspace as a modifier (#1091).
-- The attempt dialog offers each discipline's workspace bonus as its own
-- checkbox and lists the recipe's modifiers beside it, so a "Proper forge
-- available" modifier lets a player take the same bonus twice. The client
-- also drops such a modifier when it normalises the model's output
-- (src/lib/crafting/recipeAi.ts); this keeps the model from spending a slot on
-- one. replace() touches the line only if it still reads as seeded, so an
-- admin's own edit of the prompt is kept.
update public.ai_system_prompts
   set content = replace(content,
     $o$- modifiers: 0 to 2 optional conditions that make the craft easier, each with a short description and a small integer bonus (usually 1 to 3). Leave the list empty if none suit the concept.$o$,
     $n$- modifiers: 0 to 2 optional conditions that make the craft easier, each with a short description and a small integer bonus (usually 1 to 3). Leave the list empty if none suit the concept.
- Never make a modifier out of having a proper workspace (a forge, lab, workshop, kitchen, studio and the like). Every attempt already offers the discipline's workspace bonus on its own, so a modifier for it is the same bonus twice.$n$)
 where generator_type = 'recipe';
