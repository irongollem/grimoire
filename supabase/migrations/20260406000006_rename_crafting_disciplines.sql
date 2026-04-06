-- Rename crafting disciplines to broader names and preserve existing recipe data.
-- leatherworking → leathercraft (now covers Cobbler's Tools too)
-- woodcarving    → woodcraft    (now covers Carpenter's + Shipwright's Tools too)

update crafting_recipes set discipline = 'leathercraft' where discipline = 'leatherworking';
update crafting_recipes set discipline = 'woodcraft'    where discipline = 'woodcarving';
