-- Migration: warlock_invocations
-- Adds Eldritch Invocation level-up steps and Pact Boon choice to Warlock.

update system_classes set
  steps = '[
    {
      "level": 2,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocations",
      "description": "Choose 2 Eldritch Invocations to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates"
      ],
      "count": 2
    },
    {
      "level": 3,
      "type": "select",
      "step_type": "text_pick",
      "key": "pact_boon",
      "label": "Pact Boon",
      "description": "Choose your Pact Boon — the form of your warlock''s bond with their patron.",
      "options": ["Pact of the Chain","Pact of the Blade","Pact of the Tome"]
    },
    {
      "level": 5,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade"
      ]
    },
    {
      "level": 7,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade",
        "Bewitching Whispers","Dreadful Word","Sculptor of Flesh"
      ]
    },
    {
      "level": 9,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade",
        "Bewitching Whispers","Dreadful Word","Sculptor of Flesh",
        "Ascendant Step","Minions of Chaos","Otherworldly Leap","Whispers of the Grave"
      ]
    },
    {
      "level": 12,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade",
        "Bewitching Whispers","Dreadful Word","Sculptor of Flesh",
        "Ascendant Step","Minions of Chaos","Otherworldly Leap","Whispers of the Grave",
        "Lifedrinker"
      ]
    },
    {
      "level": 15,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade",
        "Bewitching Whispers","Dreadful Word","Sculptor of Flesh",
        "Ascendant Step","Minions of Chaos","Otherworldly Leap","Whispers of the Grave",
        "Lifedrinker",
        "Master of Myriad Forms","Visions of Distant Realms","Witch Sight"
      ]
    },
    {
      "level": 18,
      "type": "append",
      "step_type": "text_pick",
      "key": "eldritch_invocations",
      "label": "Learn Eldritch Invocation",
      "description": "Choose 1 additional Eldritch Invocation to learn.",
      "options": [
        "Agonizing Blast","Armor of Shadows","Beast Speech","Beguiling Influence",
        "Devil''s Sight","Eldritch Sight","Eldritch Spear","Eyes of the Rune Keeper",
        "Fiendish Vigor","Gaze of Two Minds","Mask of Many Faces","Misty Visions",
        "Repelling Blast","Thief of Five Fates",
        "Mire the Mind","One with Shadows","Sign of Ill Omen","Thirsting Blade",
        "Bewitching Whispers","Dreadful Word","Sculptor of Flesh",
        "Ascendant Step","Minions of Chaos","Otherworldly Leap","Whispers of the Grave",
        "Lifedrinker",
        "Master of Myriad Forms","Visions of Distant Realms","Witch Sight",
        "Beast Master"
      ]
    }
  ]'::jsonb
where class_name = 'Warlock';
