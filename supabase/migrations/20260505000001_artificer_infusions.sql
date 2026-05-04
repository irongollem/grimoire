-- Migration: artificer_infusions
-- Adds active_infusions column to party_members and infusion level-up steps to Artificer.

-- New column for tracking which infusions are currently active and what item they're applied to.
alter table party_members
  add column if not exists active_infusions jsonb not null default '[]'::jsonb;

-- Artificer level-up steps: learn infusions at levels 2, 6, 8, 10, 12.
-- Infusion slots (active count) are already tracked in system_classes.resources.
-- known infusions list grows by 4 at level 2 then +2 at each milestone.
update system_classes set
  steps = '[
    {
      "level": 2,
      "type": "append",
      "step_type": "text_pick",
      "key": "infusions_known",
      "label": "Learn Infusions",
      "description": "Choose 4 infusions to learn. You can apply a number of active infusions equal to your Infusion Slots resource.",
      "options": [
        "Armor of Magical Strength","Enhanced Arcane Focus","Enhanced Defense","Enhanced Weapon",
        "Homunculus Servant","Mind Sharpener","Repeating Shot","Returning Weapon"
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
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring"
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
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring"
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
        "Resistant Armor","Returning Weapon","Spell-Refueling Ring"
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
        "Armor of Magical Strength","Arcane Propulsion Armor","Boots of the Winding Path",
        "Enhanced Arcane Focus","Enhanced Defense","Enhanced Weapon","Homunculus Servant",
        "Many-Handed Pouch","Mind Sharpener","Radiant Weapon","Repeating Shot",
        "Repulsion Shield","Resistant Armor","Returning Weapon","Spell-Refueling Ring"
      ],
      "count": 2
    }
  ]'::jsonb
where class_name = 'Artificer';
