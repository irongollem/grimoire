-- Migrate existing items to the new 'provision' item_type.
-- Previously these were split across 'gear', 'trade_good', and 'service'.
-- Matches by name so only known static items are affected.

update items
set item_type = 'provision'
where name in (
  -- From SRD gear (previously item_type = 'gear')
  'Rations (1 day)',
  -- From mundaneGear trade_good drinks
  'Ale (mug)',
  'Mead (bottle)',
  'Fruit Brandy (flask)',
  'Elven Ferment (vial)',
  -- From mundaneGear cooked food / Workshop outputs
  'Grilled Meat',
  'Roast Meat',
  'Smoked Meat (Jerky)',
  'Grilled Fish',
  'Pot of Stew',
  -- From SRD services food and drink (previously item_type = 'service')
  'Ale, Gallon',
  'Ale, Mug',
  'Banquet (per person)',
  'Bread, Loaf',
  'Cheese, Hunk',
  'Meat, Chunk',
  'Wine, Common (pitcher)',
  'Wine, Fine (bottle)',
  'Mead, Mug',
  'Mead, Gallon'
);
