-- Migration: artificer_infusion_steps_replicate
-- Expands Artificer level-up step options to include Replicate Magic Item variants.

update system_classes set
  steps = '[
    {
      "level": 2,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 4 infusions to learn. You can have a number of active infusions equal to your Infusion Slots resource.",
      "options": [
        "Armor of Magical Strength","Enhanced Arcane Focus","Enhanced Defense","Enhanced Weapon",
        "Homunculus Servant","Mind Sharpener","Repeating Shot","Returning Weapon",
        "Replicate Magic Item: Alchemy Jug","Replicate Magic Item: Bag of Holding",
        "Replicate Magic Item: Goggles of Night","Replicate Magic Item: Rope of Climbing",
        "Replicate Magic Item: Sending Stones","Replicate Magic Item: Wand of Magic Detection"
      ],
      "count": 4
    },
    {
      "level": 6,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 2 additional infusions to learn.",
      "options": [
        "Armor of Magical Strength","Boots of the Winding Path","Enhanced Arcane Focus",
        "Enhanced Defense","Enhanced Weapon","Homunculus Servant","Many-Handed Pouch",
        "Mind Sharpener","Radiant Weapon","Repeating Shot","Repulsion Shield",
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring",
        "Replicate Magic Item: Alchemy Jug","Replicate Magic Item: Bag of Holding",
        "Replicate Magic Item: Boots of Elvenkind","Replicate Magic Item: Cloak of Elvenkind",
        "Replicate Magic Item: Cloak of Protection","Replicate Magic Item: Gloves of Thievery",
        "Replicate Magic Item: Goggles of Night","Replicate Magic Item: Helm of Comprehending Languages",
        "Replicate Magic Item: Lantern of Revealing","Replicate Magic Item: Rope of Climbing",
        "Replicate Magic Item: Sending Stones","Replicate Magic Item: Wand of Magic Detection"
      ],
      "count": 2
    },
    {
      "level": 8,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 2 additional infusions to learn.",
      "options": [
        "Armor of Magical Strength","Boots of the Winding Path","Enhanced Arcane Focus",
        "Enhanced Defense","Enhanced Weapon","Homunculus Servant","Many-Handed Pouch",
        "Mind Sharpener","Radiant Weapon","Repeating Shot","Repulsion Shield",
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring",
        "Replicate Magic Item: Alchemy Jug","Replicate Magic Item: Bag of Holding",
        "Replicate Magic Item: Boots of Elvenkind","Replicate Magic Item: Cloak of Elvenkind",
        "Replicate Magic Item: Cloak of Protection","Replicate Magic Item: Gloves of Thievery",
        "Replicate Magic Item: Goggles of Night","Replicate Magic Item: Helm of Comprehending Languages",
        "Replicate Magic Item: Lantern of Revealing","Replicate Magic Item: Rope of Climbing",
        "Replicate Magic Item: Sending Stones","Replicate Magic Item: Wand of Magic Detection"
      ],
      "count": 2
    },
    {
      "level": 10,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 2 additional infusions to learn.",
      "options": [
        "Armor of Magical Strength","Boots of the Winding Path","Enhanced Arcane Focus",
        "Enhanced Defense","Enhanced Weapon","Homunculus Servant","Many-Handed Pouch",
        "Mind Sharpener","Radiant Weapon","Repeating Shot","Repulsion Shield",
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring",
        "Replicate Magic Item: Alchemy Jug","Replicate Magic Item: Bag of Holding",
        "Replicate Magic Item: Boots of Elvenkind","Replicate Magic Item: Cloak of Elvenkind",
        "Replicate Magic Item: Cloak of Protection","Replicate Magic Item: Gloves of Thievery",
        "Replicate Magic Item: Goggles of Night","Replicate Magic Item: Helm of Comprehending Languages",
        "Replicate Magic Item: Lantern of Revealing","Replicate Magic Item: Rope of Climbing",
        "Replicate Magic Item: Sending Stones","Replicate Magic Item: Wand of Magic Detection"
      ],
      "count": 2
    },
    {
      "level": 12,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 2 additional infusions to learn.",
      "options": [
        "Arcane Propulsion Armor","Armor of Magical Strength","Boots of the Winding Path",
        "Enhanced Arcane Focus","Enhanced Defense","Enhanced Weapon","Homunculus Servant",
        "Many-Handed Pouch","Mind Sharpener","Radiant Weapon","Repeating Shot","Repulsion Shield",
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring",
        "Replicate Magic Item: Alchemy Jug","Replicate Magic Item: Bag of Holding",
        "Replicate Magic Item: Boots of Elvenkind","Replicate Magic Item: Cloak of Elvenkind",
        "Replicate Magic Item: Cloak of Protection","Replicate Magic Item: Gloves of Thievery",
        "Replicate Magic Item: Goggles of Night","Replicate Magic Item: Helm of Comprehending Languages",
        "Replicate Magic Item: Lantern of Revealing","Replicate Magic Item: Rope of Climbing",
        "Replicate Magic Item: Sending Stones","Replicate Magic Item: Wand of Magic Detection"
      ],
      "count": 2
    }
  ]'::jsonb
where class_name = 'Artificer';
