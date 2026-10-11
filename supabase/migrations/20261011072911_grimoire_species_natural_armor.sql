-- Grimoire Loxodon, Lizardfolk and Shellfolk (20261009215703) describe a
-- natural armour trait ("Thick Hide": 12 + Con, "Scaled Hide": 13 + Dex,
-- "Carapace": a flat 17) but were inserted with natural_armor_ac null, so the
-- character form seeded their natural AC formula at 10. The column is the base
-- number only; the ability rider is picked in the AC field (natural:N,
-- natural:N+con, natural:N+dex).
update library_species set natural_armor_ac = 12
where id in ('grimoire_loxodon', 'grimoire_2024_loxodon');

update library_species set natural_armor_ac = 13
where id in ('grimoire_lizardfolk', 'grimoire_2024_lizardfolk');

update library_species set natural_armor_ac = 17
where id in ('grimoire_shellfolk', 'grimoire_2024_shellfolk');
