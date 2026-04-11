-- ── Seed: Hall of Heroes ──────────────────────────────────────────────────────
-- One-time bulk insert of all setting-defined heroes.
-- Uses ON CONFLICT to upsert: updates lore fields, preserves portrait/card art
-- if already set so manually-added artwork is never overwritten.

-- Unique index for conflict resolution (setting + normalised name)
create unique index if not exists hall_of_heroes_setting_name_key
  on public.hall_of_heroes (setting, lower(name));

-- Temp helper: wrap plain text in a minimal Tiptap doc JSON blob
create function public._tiptap(t text) returns text language sql as $$
  select case when t is null or t = '' then null
    else '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":' || to_json(t) || '}]}]}'
  end;
$$;

do $$
declare
  v_uid uuid;
begin
  select id into v_uid
  from auth.users
  where (raw_app_meta_data->>'role') = 'admin'
  limit 1;

  if v_uid is null then
    raise notice 'Hall of Heroes seed: no admin user found — skipping.';
    return;
  end if;

  insert into public.hall_of_heroes (
    user_id, name, setting, race, alignment, occupation,
    personality, backstory, status, relationship,
    portrait_url, is_revealed, tags
  ) values

  -- ── FORGOTTEN REALMS ──────────────────────────────────────────────────────

  (v_uid,'Drizzt Do''Urden','faerun','Drow Elf','Chaotic Good','Ranger',
   public._tiptap('Introspective and principled — Drizzt carries the weight of his dark heritage while striving to prove that one''s nature is not one''s destiny. Speaks rarely, but with conviction. Loyal to his companions above all.'),
   public._tiptap('Born in Menzoberranzan to the noble House Do''Urden, Drizzt rejected the cruel ways of drow society and fled to the surface. After years of surviving alone in the Underdark and then in the Forgotten Realms, he found a second family among the Companions of the Hall.'),
   'alive','ally',null,true,ARRAY['companion of the hall','menzoberranzan','north','ranger','scimitars']),

  (v_uid,'Elminster Aumar','faerun','Human','Chaotic Good','Archmage / Chosen of Mystra',
   public._tiptap('Ancient, eccentric, and often infuriatingly cryptic. Elminster has lived for over a millennium and treats most crises as mildly interesting puzzles. Fond of pipe-weed, good wine, and testing people''s mettle.'),
   public._tiptap('A simple shepherd''s son who became the most powerful wizard in Faerûn through centuries of study and favour from Mystra herself. He has personally shaped the history of the Realms — and carries the burden of knowing it.'),
   'alive','ally',null,true,ARRAY['shadowdale','mystra','chosen','sage','archmage']),

  (v_uid,'Jarlaxle Baenre','faerun','Drow Elf','Chaotic Neutral','Mercenary Leader / Schemer',
   public._tiptap('Flamboyant, charming, and utterly self-interested — but possessed of a strange honour toward those who earn his respect. Jarlaxle wears an enormous feathered hat and collects magic items obsessively. He always has a plan within a plan.'),
   public._tiptap('Leader of Bregan D''aerthe, a drow mercenary band that operates above and below the surface. Jarlaxle is the illegitimate son of Matron Baenre and has survived longer than any male drow in Menzoberranzan through sheer cunning.'),
   'alive','neutral',null,true,ARRAY['bregan d''aerthe','menzoberranzan','mercenary','schemer']),

  (v_uid,'Artemis Entreri','faerun','Human','Lawful Evil','Assassin',
   public._tiptap('Cold, exacting, and completely without illusion about himself or anyone else. Entreri is the finest assassin in the Realms and he knows it. He does not enjoy killing — he simply excels at it, which is somehow worse.'),
   public._tiptap('Born in the slums of Calimport, Entreri clawed his way to the top of the assassin''s guild through pure ruthless competence. He became Drizzt Do''Urden''s greatest rival — not out of hatred but because Drizzt is the only person who can match him, and that is something Entreri cannot accept.'),
   'alive','neutral',null,true,ARRAY['calimport','assassin','companion of the hall','entreri']),

  (v_uid,'Bruenor Battlehammer','faerun','Dwarf','Lawful Good','King of Mithral Hall',
   public._tiptap('Gruff, stubborn, and fiercely loyal — Bruenor shows his love through insults and actions, rarely words. He has a dwarf''s pride in craftsmanship and a king''s hatred of injustice.'),
   public._tiptap('Orphaned survivor of the sacking of Mithral Hall, Bruenor was raised in Icewind Dale where he adopted the human girl Catti-brie and befriended Drizzt Do''Urden. He eventually reclaimed Mithral Hall and restored his clan.'),
   'alive','ally',null,true,ARRAY['mithral hall','companion of the hall','battlehammer clan','dwarf king']),

  (v_uid,'Catti-brie','faerun','Human','Chaotic Good','Archer / Mage',
   public._tiptap('Spirited, warm, and far more perceptive than people expect from someone that charming. Catti-brie has her adoptive father''s stubbornness but a human''s adaptability. She is capable of extraordinary compassion and equally extraordinary accuracy with a bow.'),
   public._tiptap('Adopted by Bruenor Battlehammer after her family was killed by gnolls, Catti-brie grew up among dwarves and adventurers. She is one of the Companions of the Hall and wields the magical bow Taulmaril. In her later life she became a formidable wizard as well.'),
   'alive','ally',null,true,ARRAY['companion of the hall','archer','mithral hall','taulmaril']),

  (v_uid,'Wulfgar','faerun','Human','Chaotic Good','Warrior / Chieftain',
   public._tiptap('Huge, honourable, and carrying deep scars from years imprisoned in the Abyss. Wulfgar is working to rebuild himself after trauma — he is brave and kind but struggles with rage he has not yet mastered.'),
   public._tiptap('A barbarian of the Icewind Dale who was captured by Bruenor and raised as a son. He wields the warhammer Aegis-fang, crafted for him by Bruenor. After years of imprisonment by the demon Errtu, Wulfgar has rejoined the Companions changed but unbroken.'),
   'alive','ally',null,true,ARRAY['companion of the hall','icewind dale','barbarian','aegis-fang']),

  (v_uid,'Regis','faerun','Halfling','Neutral Good','Rogue / Diplomat',
   public._tiptap('Lazy, charming, and far more clever than his comfortable demeanour suggests. Regis would rather talk his way out of trouble than fight his way through it, which has led to some surprisingly elegant solutions. He is genuinely kind beneath the scheming.'),
   public._tiptap('A halfling thief from Calimport who fled his criminal past to Ten-Towns in Icewind Dale. He carries a ruby pendant of hypnosis that he stole from the thieves'' guild master Pasha Pook — which is why a guild assassin keeps being sent to find him.'),
   'alive','ally',null,true,ARRAY['companion of the hall','halfling','icewind dale','rogue','ten-towns']),

  (v_uid,'Laeral Silverhand','faerun','Human','Neutral Good','Open Lord of Waterdeep / Chosen of Mystra',
   public._tiptap('Measured, intelligent, and politically astute. Laeral carries the weight of centuries and the painful memory of being corrupted by the Crown of Horns. She balances the needs of Waterdeep''s common folk against the schemes of the nobility.'),
   public._tiptap('One of the Seven Sisters, the Chosen of Mystra. She was the Lady Mage of Waterdeep and Blackstaff for many years before becoming Open Lord after Dagult Neverember''s fall from grace.'),
   'alive','ally',null,true,ARRAY['waterdeep','open lord','seven sisters','mystra','chosen']),

  (v_uid,'Vajra Safahr','faerun','Human','Neutral Good','Blackstaff of Waterdeep',
   public._tiptap('Direct, serious, and somewhat overwhelmed by an office that carries seven centuries of accumulated magical obligation. Vajra wields the Blackstaff — a sentient artifact — and must navigate its advice, which is not always welcome.'),
   public._tiptap('The current Blackstaff of Waterdeep, keeper of the city''s most powerful magical defences. She was chosen by the previous Blackstaff Khelben Arunsun and is still growing into the role''s full weight. The staff itself is semi-sentient and does not always agree with her decisions.'),
   'alive','ally',null,true,ARRAY['waterdeep','blackstaff','archmage','wizard tower','defender']),

  (v_uid,'Dagult Neverember','faerun','Human','Lawful Neutral','Lord Protector of Neverwinter / Former Open Lord',
   public._tiptap('Charismatic, ruthlessly ambitious, and genuinely talented at governance — which makes him all the more dangerous. Neverember never does anything without a self-serving angle, but his angles often align with what his subjects actually need.'),
   public._tiptap('Once the Open Lord of Waterdeep, Neverember was removed from power when the city''s hidden Lords concluded his ambitions had outgrown his usefulness. He relocated to Neverwinter, which he is rebuilding as Lord Protector. He nurses grievances and long-term plans in equal measure.'),
   'alive','neutral',null,true,ARRAY['neverwinter','waterdeep','lord protector','politician','ambitious']),

  (v_uid,'Grand Duke Ulder Ravengard','faerun','Human','Lawful Good','Grand Duke of Baldur''s Gate / Marshal of the Flaming Fist',
   public._tiptap('Hard, principled, and uncomfortable with politics. Ravengard built his career through military competence and still prefers a direct order to a diplomatic manoeuvre. He is honest to a fault and deeply suspicious of anyone who isn''t.'),
   public._tiptap('Rose from common soldier to Marshal of the Flaming Fist through sheer ability and force of will. He was then elevated to Grand Duke of Baldur''s Gate — a political office he finds genuinely baffling. He is one of the few Grand Dukes who is not visibly corrupt, which makes him either admirable or naive depending on who you ask.'),
   'alive','ally',null,true,ARRAY['baldur''s gate','flaming fist','grand duke','military','lawful']),

  (v_uid,'Halaster Blackcloak','faerun','Human','Chaotic Evil','Mad Wizard / Master of Undermountain',
   public._tiptap('Brilliantly, comprehensively insane. Halaster has spent so many centuries warping the laws of magic inside Undermountain that he has lost his grip on consensus reality. He is delighted by adventurers — as test subjects, entertainment, and occasional dinner guests.'),
   public._tiptap('The legendary archmage who carved Undermountain beneath Waterdeep over a thousand years ago. He lured seven wizards as apprentices, trapped them in the dungeon when they tried to leave, and has been sealing and stocking his megadungeon ever since. He is functionally immortal and thoroughly mad.'),
   'alive','enemy',null,true,ARRAY['undermountain','waterdeep','mad wizard','megadungeon','archmage']),

  (v_uid,'Lolth','faerun','Deity','Chaotic Evil','Demon Queen of Spiders / Goddess of the Drow',
   public._tiptap('Mercurial, sadistic, and addicted to chaos as an aesthetic principle. Lolth demands absolute devotion and rewards it with tests of loyalty that amount to elaborate cruelty. She genuinely enjoys watching her followers destroy each other.'),
   public._tiptap('The Spider Queen who rules from the Demonweb Pits in the Abyss. Lolth remade drow society in her image — matriarchal, violent, and perpetually at war with itself — because an ordered society wouldn''t need her. Every house war, every assassination, every betrayal in Menzoberranzan feeds her power.'),
   'alive','enemy',null,true,ARRAY['drow','menzoberranzan','spider queen','abyss','deity']),

  (v_uid,'Szass Tam','faerun','Lich','Neutral Evil','Regent of Thay / Zulkir of Necromancy',
   public._tiptap('Patient, brilliant, and operating on timelines that make other powerful mages look like they are running to stand still. Szass Tam is the most dangerous undead spellcaster in Faerûn — not because of raw power but because he has been outmanoeuvring enemies for centuries and has never stopped improving.'),
   public._tiptap('The ancient lich who rules Thay after a bloody internal coup against the other Zulkirs. He sacrificed his mortality for perfect undeath long ago and has used his unnatural patience to convert Thay into a necrocracy — a nation run by and for the undead. He exports Red Wizard enclaves as intelligence networks across the continent.'),
   'alive','enemy',null,true,ARRAY['thay','lich','red wizards','necromancy','zulkir']),

  (v_uid,'Manshoon','faerun','Human (Clone)','Lawful Evil','Zhentarim Leader / Clone-Mage',
   public._tiptap('Cold, controlling, and obsessed with hierarchy. Manshoon believes the world would function better if he were in charge of it — not out of ego but out of a genuine conviction that lesser minds create the chaos he despises. He is charming when he needs to be and lethal when he doesn''t.'),
   public._tiptap('The original founder of the Zhentarim, Manshoon died many times — the result of a Clone spell catastrophe — and multiple copies of him roam the Realms with conflicting memories and agendas. The one based in Waterdeep has rebuilt his power carefully and quietly from the city''s criminal underground.'),
   'alive','enemy',null,true,ARRAY['zhentarim','wizard','clone','waterdeep','villain']),

  (v_uid,'Mordenkainen','faerun','Human','True Neutral','Archmage / Multiplanar Traveller',
   public._tiptap('Brilliant, calculating, and utterly convinced that balance is the only philosophy worth holding. Mordenkainen visits the Realms as he visits every other world — to observe, influence, and leave. He is not cold exactly, but he is always performing a calculation you cannot see.'),
   public._tiptap('Greyhawk''s greatest archmage who travels the planes and visits multiple worlds including Faerûn. He authored many famous spells that bear his name. On Faerûn he maintains a loose network of allies and information, convinced that no power should be allowed to dominate the world — including the ones he likes.'),
   'alive','neutral',null,true,ARRAY['archmage','planar traveller','balance','spells','greyhawk']),

  (v_uid,'Volo (Volothamp Geddarm)','faerun','Human','Chaotic Good','Author / Explorer / Guidebook Writer',
   public._tiptap('Enthusiastic, boastful, and often wrong in memorable ways. Volo has a gift for finding himself at the centre of events he is completely unprepared for. He is genuinely brave in the way that people who don''t quite grasp danger can be.'),
   public._tiptap('Faerûn''s most famous travel writer and author of numerous guides to the Realms. He has survived encounters that should have killed him through luck, charm, and the sheer narrative force of being exactly the kind of person who should not survive. He is also frequently banned from specific cities for specific reasons.'),
   'alive','ally',null,true,ARRAY['author','explorer','waterdeep','traveller','guidebooks']),

  (v_uid,'Tasha (Iggwilv)','faerun','Human','Chaotic Evil','Archmage / Demonologist / Witch Queen',
   public._tiptap('Brilliant, terrifying, and completely amoral. Iggwilv views everyone as a tool or an obstacle. She has enslaved demon lords, toppled kingdoms, and outlived most of her enemies — and she finds this delightful. Her current demeanour as ''Tasha'' is a somewhat more playful performance of the same fundamental ruthlessness.'),
   public._tiptap('Known by many names: Natasha, Tasha, Iggwilv. An apprentice of Zagig Yragerne who surpassed her master and conquered Perrenland. She authored the Demonomicon of Iggwilv, imprisoned the demon lord Graz''zt, and took him as a consort before eventually moving to Faerûn''s broader stage.'),
   'alive','enemy',null,true,ARRAY['witch queen','demonologist','demonomicon','archmage','graz''zt']),

  (v_uid,'Larloch','faerun','Lich','Neutral Evil','The Shadow King / Ancient Lich',
   public._tiptap('Ancient beyond measure and alien in his patience. Larloch has existed so long that most of what he once cared about is dust, and what remains is a cold obsession with power for its own sake. He does not hate; he simply categorises.'),
   public._tiptap('One of the oldest liches in Faerûn, Larloch rules from Warlock''s Crypt in the Anauroch desert. He is older than Thay, older than most nations, and his sheer accumulated magical power is rivalled by very few living beings. He endures because accumulation is its own purpose.'),
   'alive','enemy',null,true,ARRAY['lich','anauroch','ancient','warlock''s crypt','necromancy']),

  -- ── EBERRON ───────────────────────────────────────────────────────────────

  (v_uid,'Jaela Daran','eberron','Human','Lawful Good','Keeper of the Flame',
   public._tiptap('Serene and wise far beyond her apparent age — Jaela was chosen as the spiritual leader of the Church of the Silver Flame at age six and has served as Keeper ever since. She is compassionate but resolute when the Flame demands difficult decisions.'),
   public._tiptap('The spiritual leader of the Church of the Silver Flame and de facto ruler of Thrane. Though she appears as a young girl, she is centuries older in accumulated spiritual experience. The Silver Flame speaks through her directly.'),
   'alive','ally',null,true,ARRAY['thrane','silver flame','keeper','theocracy']),

  (v_uid,'King Boranel ir''Wynarn','eberron','Human','Neutral Good','King of Breland',
   public._tiptap('Warm, beloved, and aware that his death will be a catastrophe. Boranel is an old man who has ruled with unusual wisdom and genuine care for his people. He knows his heirs are not ready. He worries about this constantly while never letting it show.'),
   public._tiptap('The aging king of Breland — the largest and most prosperous of the Five Nations. Boranel has kept Breland together through the Last War and the peace after it. His health is failing, his succession is uncertain, and every political faction in Khorvaire is making contingency plans.'),
   'alive','ally',null,true,ARRAY['breland','king','wroat','court','royalty']),

  (v_uid,'Merrix d''Cannith','eberron','Human','Lawful Neutral','House Cannith Patriarch (South) / Artificer',
   public._tiptap('Cold, brilliant, and utterly pragmatic. Merrix views the world as a problem to be engineered. He created the modern warforged and has plans few others can anticipate. Not evil — but not warm either.'),
   public._tiptap('Head of House Cannith South and grandson of the man who first built the warforged. He secretly continued warforged production after the Treaty of Thronehold banned it, and his interests in the Day of Mourning go deeper than anyone knows.'),
   'alive','neutral',null,true,ARRAY['house cannith','artificer','warforged','dragonmark']),

  (v_uid,'Lady Elaydren d''Vown','eberron','Half-Elf','Neutral Good','House Cannith Agent',
   public._tiptap('Charming and genuinely warm, but carrying deep secrets about House Cannith''s hidden agenda. She cares about doing the right thing even when her House obligations make that complicated.'),
   public._tiptap('A Cannith agent tasked with recovering schema fragments tied to the Creation Pattern — an ancient Cannith design of unknown but terrifying power. She recruits adventurers when her House''s own agents cannot be trusted.'),
   'alive','ally',null,true,ARRAY['house cannith','eberron','creation pattern','schema']),

  (v_uid,'The Lord of Blades','eberron','Warforged','Lawful Evil','Warlord / Warforged Separatist',
   public._tiptap('Charismatic, hateful of ''fleshlings'', and utterly convinced that warforged are the next stage of civilization. He speaks with cold precision and has never lost a debate with an enemy he later allowed to live.'),
   public._tiptap('An enigmatic warforged warlord who leads a nation of warforged in the Mournland. He rejects the Treaty of Thronehold and seeks to build a warforged homeland — by conquest if necessary. His true name and origins are unknown.'),
   'alive','enemy',null,true,ARRAY['warforged','mournland','separatist','villain']),

  (v_uid,'Sora Kell','eberron','Hag (Green Hag)','Neutral Evil','Ruler of Droaam / Daughter of Sora Kell',
   public._tiptap('Darkly maternal, politically shrewd, and patient in the way that creatures who have lived centuries learn to be. Sora Kell is the most capable politician of the three sisters — she talks where Sora Maenya breaks and Sora Teraza sees.'),
   public._tiptap('One of the three hag sisters who created the monster nation of Droaam. The Daughters of Sora Kell united the monster clans that no one else could control and established a functioning government west of Breland. Whether this represents progress or a subtler threat is a question the Five Nations have not yet answered.'),
   'alive','neutral',null,true,ARRAY['droaam','hag','daughters of sora kell','monster nation','ruler']),

  (v_uid,'Sora Maenya','eberron','Hag (Annis Hag)','Chaotic Evil','Warlord of Droaam / Daughter of Sora Kell',
   public._tiptap('Enormous, brutal, and genuinely delighted by physical violence. Sora Maenya is Droaam''s enforcer — the sister you send when you want something destroyed. She is not stupid but she would rather act than negotiate.'),
   public._tiptap('The muscle of the three Daughters. She commands Droaam''s military forces with a warlord''s instinct and a hag''s cruelty. Her opponents tend not to survive to discuss her strategic limitations.'),
   'alive','enemy',null,true,ARRAY['droaam','hag','daughters of sora kell','warlord','brute']),

  (v_uid,'Sora Teraza','eberron','Hag (Dusk Hag)','True Neutral','Oracle of Droaam / Daughter of Sora Kell',
   public._tiptap('Ancient and alien even by hag standards. Sora Teraza sees fragments of the future and speaks in riddles that only become clear in retrospect. She is not unkind — she simply operates on a timeline that makes her hard to read.'),
   public._tiptap('The eldest and most mysterious of the three Daughters. She sees the future with unsettling clarity and guided her sisters to build Droaam in accordance with what she has seen. She is the most dangerous of the three — not because of power but because she already knows what you are going to do.'),
   'alive','neutral',null,true,ARRAY['droaam','hag','daughters of sora kell','oracle','seer']),

  (v_uid,'Daine','eberron','Human','Chaotic Good','Veteran Soldier / Mercenary',
   public._tiptap('Gruff, haunted by the Last War, and deeply protective of those he calls his own. Daine distrusts authority but will go to any length for his comrades. He drinks too much and sleeps too little.'),
   public._tiptap('A veteran of the Last War who survived the Day of Mourning by being away from Cyre on a mission. The loss of his nation, his family, and most of his regiment has left him without roots — he wanders, takes mercenary work, and tries not to think about what he lost.'),
   'alive','ally',null,true,ARRAY['cyre','veteran','last war','mercenary']),

  (v_uid,'Viorr Maelak','eberron','Human','Lawful Neutral','Captain of the Dark Lanterns',
   public._tiptap('Quiet, methodical, and deeply uncomfortable in conversation with anyone who doesn''t share his clearance level. Maelak is Breland''s spymaster in all but name and he treats information the way other men treat gold — you spend it carefully and you never give it away.'),
   public._tiptap('The current head of the Dark Lanterns, Breland''s covert intelligence service. He has kept Breland ahead of its rivals through a combination of careful tradecraft and the willingness to make decisions that cannot be discussed afterward.'),
   'alive','neutral',null,true,ARRAY['breland','dark lanterns','spymaster','intelligence','citadel']),

  (v_uid,'Mordain the Fleshweaver','eberron','Human (Transmuted)','Neutral Evil','Renegade Wizard / Flesh Sculptor',
   public._tiptap('Utterly detached from normal human feeling, Mordain regards living bodies as raw material for artistic expression. He is not cruel in the way that people who enjoy pain are cruel — he is worse. He is indifferent.'),
   public._tiptap('A Jorasco-born wizard who was excoriated from House Phiarlan for experiments that horrified even his peers. He retreated to a tower in the Shadow Marches where he has been sculpting living creatures into new forms for decades. Dragonmarked Houses occasionally hire him when no one else will take the contract.'),
   'alive','enemy',null,true,ARRAY['shadow marches','flesh sculptor','renegade','transmutation','horror']),

  (v_uid,'Demise','eberron','Elf (Lich)','Lawful Evil','Order of the Emerald Claw Lich / Undead Agent',
   public._tiptap('Coldly fanatical. Demise serves the Order of the Emerald Claw and its masters with a lich''s perfect patience and an ideologue''s conviction. She does not bargain. She delivers ultimatums and consequences.'),
   public._tiptap('A former Blood of Vol priest who achieved lichdom in pursuit of the Divinity Within — the Vol doctrine that mortals can transcend death through their own power. She now serves as one of the Emerald Claw''s most powerful agents, pursuing ancient artefacts and eliminating threats to the Order''s agenda.'),
   'alive','enemy',null,true,ARRAY['emerald claw','lich','blood of vol','undead','karrnath']),

  (v_uid,'Tirashana','eberron','Human (Inspired)','Lawful Evil','Dreaming Dark Agent / Inspired',
   public._tiptap('Elegant, composed, and absolutely not the person she appears to be. Tirashana''s human host was chosen for her social access and her willingness. The quori spirit within is the true occupant — calculating, psionic, and pursuing an agenda that operates on a continental scale.'),
   public._tiptap('An agent of the Dreaming Dark operating deep cover in Khorvaire. The quori spirit possessing her has been infiltrating the dream-landscape of the Five Nations for years, seeding nightmares, corrupting dreams, and building toward the conditions that will allow the quori''s nightmare age to spread westward from Sarlona.'),
   'alive','enemy',null,true,ARRAY['dreaming dark','inspired','quori','psionic','sarlona']),

  -- ── GREYHAWK ──────────────────────────────────────────────────────────────

  (v_uid,'Mordenkainen','greyhawk','Human','True Neutral','Archmage',
   public._tiptap('Aloof, calculating, and utterly devoted to maintaining the balance of power between good and evil — not because he favours goodness, but because he believes imbalance leads to ruin. He is brilliant, condescending, and occasionally more dangerous than the problems he claims to solve.'),
   public._tiptap('The most powerful wizard in the Flanaess and leader of the Circle of Eight — a group of archmages who work behind the scenes to prevent any single power from dominating the world. Mordenkainen''s famous spells bear his name across every world.'),
   'alive','neutral',null,true,ARRAY['circle of eight','archmage','balance','city of greyhawk']),

  (v_uid,'Bigby','greyhawk','Human','Neutral Good','Archmage / Circle of Eight',
   public._tiptap('More warmly human than his master Mordenkainen — Bigby genuinely cares about the people affected by the Circle''s abstract power games. He is thoughtful and reluctant to use his terrible power, but formidable when pushed.'),
   public._tiptap('Once a thief''s apprentice and then a servant of the evil wizard Leomund, Bigby was freed and mentored by Mordenkainen. He created his famous series of hand spells. Now a member of the Circle of Eight, he quietly advocates for more direct action against evil.'),
   'alive','ally',null,true,ARRAY['circle of eight','archmage','city of greyhawk','bigby''s hand']),

  (v_uid,'Tenser','greyhawk','Human','Neutral Good','Archmage / Circle of Eight',
   public._tiptap('The most idealistic member of the Circle — Tenser genuinely wants to use his power to do good, which puts him in constant philosophical conflict with Mordenkainen''s cold calculus. He has been known to act unilaterally when he believes the balance argument is being used to excuse inaction.'),
   public._tiptap('A powerful archmage and member of the Circle of Eight, Tenser has his own tower and his own agents. He created Tenser''s Transformation, the spell that makes a wizard fight like a fighter. He was once killed and recreated from a clone — an experience that changed his perspective on mortality considerably.'),
   'alive','ally',null,true,ARRAY['circle of eight','archmage','city of greyhawk','tenser''s transformation']),

  (v_uid,'Rary the Traitor','greyhawk','Human','Neutral Evil','Renegade Archmage / Desert Ruler',
   public._tiptap('Brilliant and bitter. Rary spent decades working for a balance he no longer believes in, then chose self-interest at the worst possible moment. He does not apologize. He has built something for himself in the Bright Desert and intends to keep it.'),
   public._tiptap('Once a respected member of the Circle of Eight, Rary betrayed the Circle during the signing of the Greyhawk Peace Treaty — killing Tenser and Otiluke and fleeing with Lord Robilar to the Bright Desert, where he now rules as a desert power. His motives remain partially unclear.'),
   'alive','enemy',null,true,ARRAY['circle of eight','traitor','bright desert','archmage','renegade']),

  (v_uid,'Tasha (Iggwilv)','greyhawk','Human','Chaotic Evil','Archmage / Demonologist / Witch Queen',
   public._tiptap('Brilliant, terrifying, and completely amoral. Iggwilv views everyone as a tool or an obstacle. She has enslaved demon lords, toppled kingdoms, and outlived most of her enemies — and she finds this delightful.'),
   public._tiptap('Known by many names, including Natasha and Tasha. An apprentice of Zagig Yragerne who eventually surpassed her master. Iggwilv conquered Perrenland, authored the Demonomicon, and imprisoned the demon lord Graz''zt — whom she later took as a consort.'),
   'alive','enemy',null,true,ARRAY['witch queen','demonologist','demonomicon','perrenland','graz''zt']),

  (v_uid,'Jallarzi Sallavarian','greyhawk','Human','Neutral Good','Archmage / Circle of Eight',
   public._tiptap('Warm, principled, and the moral compass of the Circle of Eight. Jallarzi is less interested in abstract balance than in the actual wellbeing of people. She is well-loved and deeply trusted — which makes her a target.'),
   public._tiptap('The newest and most idealistic member of the Circle of Eight, Jallarzi represents a more humane approach to arcane power politics. She works to ensure the Circle''s decisions consider the cost to ordinary people.'),
   'alive','ally',null,true,ARRAY['circle of eight','archmage','city of greyhawk']),

  (v_uid,'Iuz the Old','greyhawk','Cambion','Chaotic Evil','Demigod / Tyrant',
   public._tiptap('Ancient, sadistic, and possessed of a demigod''s patience. Iuz delights in cruelty and instability. He is not merely evil — he is invested in suffering as an art form.'),
   public._tiptap('The half-fiend son of the demon lord Graz''zt and the witch Iggwilv, Iuz built a kingdom through conquest and atrocity. He was once imprisoned by Zagig Yragerne but broke free, and his empire now threatens the peace of the entire Flanaess.'),
   'alive','enemy',null,true,ARRAY['demigod','tyrant','cambion','graz''zt','iggwilv']),

  (v_uid,'Zagyg Yragerne','greyhawk','Human (Demigod)','Chaotic Neutral','Mad Archmage / Demigod',
   public._tiptap('Incomprehensible. Zagyg''s madness is not a defect — it is a philosophy. He built Castle Greyhawk as a monument to chaos and trapped several deities in its depths. His humour is real. His cruelty is real. These are not in conflict for him.'),
   public._tiptap('The Mad Archmage of Greyhawk, builder of the legendary Castle Greyhawk megadungeon. He achieved apotheosis — becoming a demigod — through a ritual that may have involved trapping the demigod Iuz in his dungeon. Zagyg vanished long ago but his works are everywhere.'),
   'missing','neutral',null,true,ARRAY['castle greyhawk','mad archmage','demigod','greyhawk city','chaotic']),

  (v_uid,'Acererak','greyhawk','Lich (Demilich)','Neutral Evil','Demilich / Tomb Builder',
   public._tiptap('There is very little personality left. Acererak has transcended lichdom and most of what he was is now devoted to power, souls, and architecture. The Tomb of Horrors is the clearest expression of his remaining will: a lethal statement that adventurers are prey.'),
   public._tiptap('Once a cambion wizard who became a lich and then transcended even that — Acererak shed his body and became a demilich, his soul gem floating in the most lethal dungeon in the world. He builds death-trap dungeons across the multiverse for reasons that have become opaque even to those who study him.'),
   'alive','enemy',null,true,ARRAY['demilich','tomb of horrors','lich','death trap','undead']),

  (v_uid,'Keraptis','greyhawk','Human (Lich-like)','Chaotic Evil','Mad Wizard / White Plume Mountain Ruler',
   public._tiptap('Erratic, megalomaniacal, and obsessed with proving his superiority. Keraptis has stolen legendary weapons from their owners not because he needs them but because he can, and because it amuses him to watch people try to get them back.'),
   public._tiptap('An ancient evil wizard who once terrorized a kingdom, disappeared, and recently resurfaced in White Plume Mountain. He has stolen the legendary weapons Blackrazor, Wave, and Whelm from their owners and installed elaborate death-trap chambers around them. He may be immortal. He is definitely not sane.'),
   'alive','enemy',null,true,ARRAY['white plume mountain','mad wizard','villain','evil','weapons']),

  (v_uid,'Robilar','greyhawk','Human','Chaotic Neutral','Fighter / Warlord',
   public._tiptap('Decisive, ambitious, and not especially troubled by the moral weight of his decisions. Robilar adventured with the heroes who first explored Castle Greyhawk and then allied himself with Rary''s betrayal. He is very good at fighting and very bad at allegiances.'),
   public._tiptap('One of the original adventurers to explore Castle Greyhawk alongside Mordenkainen and others. He participated in Rary''s betrayal at the end of the Greyhawk Wars and now holds the Bright Desert as Rary''s military arm. He has few regrets.'),
   'alive','enemy',null,true,ARRAY['fighter','rary','bright desert','traitor','warlord']),

  (v_uid,'Nerof Gasgal','greyhawk','Human','True Neutral','Lord Mayor of the Free City of Greyhawk',
   public._tiptap('Pragmatic, politically dexterous, and deeply invested in the Free City''s neutrality — not out of principle but because neutrality is the most profitable position. He will deal with anyone who can pay or who provides leverage. He is never quite where you expect him.'),
   public._tiptap('The current Lord Mayor of the Free City of Greyhawk, leader of the Directing Oligarchy. He rose through the Thieves'' Guild before transitioning to legitimate politics, and he remembers exactly what he was. The city runs because he keeps every faction just satisfied enough to not burn anything down.'),
   'alive','neutral',null,true,ARRAY['greyhawk city','lord mayor','oligarchy','politics','neutral']),

  -- ── DRAGONLANCE ───────────────────────────────────────────────────────────

  (v_uid,'Tanis Half-Elven','dragonlance','Half-Elf','Neutral Good','Fighter / Leader',
   public._tiptap('Reluctant leader, torn between his elven and human natures. Tanis is compassionate and perceptive, but plagued by self-doubt. He is most effective when protecting those he loves, and most vulnerable when asked to choose between them.'),
   public._tiptap('Born of an elven mother and a human father who was killed before his birth, Tanis Half-Elven grew up on the margins of Qualinesti elven society. He formed the Companions of the Lance with his childhood friends and now finds himself at the centre of the war against the Dragon Highlords.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','half-elf','war of the lance']),

  (v_uid,'Raistlin Majere','dragonlance','Human','Neutral Evil','Wizard (Black Robes)',
   public._tiptap('Brilliant, cold, and consumed by ambition. Raistlin has golden skin and hourglass eyes — the price of his Test at the Tower of Wayreth. He views nearly everyone as a fool or a tool, but occasionally shows a complicated tenderness toward his twin brother Caramon.'),
   public._tiptap('The most powerful mage of his age, Raistlin survived the Test at the Tower of High Sorcery by agreeing to serve the gods of magic — at a terrible price. He chose the Black Robes and walks a razor''s edge between serving the Companions and serving his own ends.'),
   'alive','neutral',null,true,ARRAY['heroes of the lance','black robes','tower of wayreth','ambitious']),

  (v_uid,'Caramon Majere','dragonlance','Human','Neutral Good','Warrior / Fighter',
   public._tiptap('Big-hearted, uncomplicated, and endlessly patient with his brilliant and cruel twin brother. Caramon is the brawn to Raistlin''s brain and knows it — but he has more wisdom than he''s given credit for, and his loyalty is absolute.'),
   public._tiptap('Raistlin''s twin brother and lifelong protector. Caramon has spent his whole life carrying Raistlin''s physical weakness while Raistlin devoured the world''s attention. He is a formidable fighter who has had to survive adventures while watching his brother edge toward genuine darkness.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','warrior','caramon']),

  (v_uid,'Sturm Brightblade','dragonlance','Human','Lawful Good','Knight of Solamnia',
   public._tiptap('Honourable to a fault, courtly, and possessed of a dignity that shames those around him. Sturm follows the Measure even when it costs him everything. He carries his father''s armour and a debt of honour he can never repay.'),
   public._tiptap('A Knight of Solamnia in all but title — he has yet to be formally knighted due to his irregular birth and the Order''s disarray. Sturm fights with an ancient two-handed sword and the full weight of the Solamnic code. He will not survive the War of the Lance.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','knights of solamnia','honour','sacrifice']),

  (v_uid,'Flint Fireforge','dragonlance','Dwarf','Lawful Good','Blacksmith / Warrior',
   public._tiptap('Cantankerous, warm-hearted, and constitutionally unable to tolerate nonsense — especially from Tasslehoff Burrfoot. Flint grumbles about everything and would die for any of his companions. He often does.'),
   public._tiptap('A dwarven craftsman from Hillhome who adventured with the Companions for decades before the War of the Lance. He is one of the oldest of the group and the most reluctant to admit it. His friendship with Tanis is the deepest relationship either of them has.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','dwarf','craftsman']),

  (v_uid,'Tasslehoff Burrfoot','dragonlance','Kender','Chaotic Good','Thief / Adventurer',
   public._tiptap('Irrepressibly curious, absolutely fearless, and constitutionally incapable of understanding why borrowing things without asking is a social problem. Tasslehoff is not malicious — he is a force of nature that happens to interact with pockets.'),
   public._tiptap('The most famous kender in Ansalon and a member of the original Companions. He has wandered everywhere, borrowed from everyone, and been present at more historic moments than anyone has a right to be. He carries a magical device that has allowed him to travel through time, which has caused a variety of problems.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','kender','fearless']),

  (v_uid,'Goldmoon','dragonlance','Human','Neutral Good','Cleric of Mishakal / Chieftain''s Daughter',
   public._tiptap('Deeply principled and quietly fierce. Goldmoon was a princess who gave up everything — title, people, safety — to follow a blue crystal staff she didn''t understand. She embodies genuine faith in a world that had forgotten the gods existed.'),
   public._tiptap('Daughter of the Que-Shu tribal chieftain, Goldmoon carried the blue crystal staff of Mishakal that proved the true gods had returned to Krynn. Her arrival among the Companions marked the beginning of the end for the Dragon Highlords. She became the first cleric of the returned gods.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','cleric','mishakal','que-shu']),

  (v_uid,'Riverwind','dragonlance','Human','Lawful Good','Warrior / Que-Shu Plainsman',
   public._tiptap('Stoic, proud, and deeply suspicious of magic after his quest for the blue crystal staff left him traumatized. Riverwind''s love for Goldmoon is the steadying force of his life. He is a warrior of real quality who struggles with a world that is stranger than he was raised for.'),
   public._tiptap('A Que-Shu warrior of low birth who loved the chieftain''s daughter. His quest to prove himself worthy took him to Xak Tsaroth, where he found the blue crystal staff and was driven nearly mad. He survived to become one of the Companions and Goldmoon''s partner in every sense.'),
   'alive','ally',null,true,ARRAY['heroes of the lance','companions','warrior','que-shu','plainsman']),

  (v_uid,'Kitiara uth Matar','dragonlance','Human','Lawful Evil','Dragon Highlord (Blue Wing) / General',
   public._tiptap('Brilliant, magnetic, and utterly ruthless — Kitiara is everything a Dragon Highlord should be and more. She is also Tanis Half-Elven''s former lover, which makes her one of the most dangerous people in the world.'),
   public._tiptap('The half-sister of Raistlin and Caramon Majere, Kitiara chose power over family. She rose through the Dragon Highlord ranks by defeating rivals and has been granted dominion over the Blue Dragonarmies. She rides the blue dragon Skie.'),
   'alive','enemy',null,true,ARRAY['dragon highlord','blue dragonarmy','villain','skie']),

  (v_uid,'Takhisis','dragonlance','Deity','Lawful Evil','Dark Queen / Goddess of Evil',
   public._tiptap('Magnificent and terrible — Takhisis commands through majesty and the promise of destruction for those who fail. She is not merely evil; she is the principle of dominion. She speaks to her servants in visions and demands nothing less than everything.'),
   public._tiptap('The Dark Queen of Krynn, who brought her war to the world through the Dragon Highlords and their armies. She seeks to complete a dominance over Krynn that has been denied her since the Age of Dreams. The War of the Lance is her most direct attempt to reclaim the world she considers hers.'),
   'alive','enemy',null,true,ARRAY['dark queen','deity','dragonarmies','villain','takhisis']),

  (v_uid,'Dragon Highlord Ariakas','dragonlance','Human','Lawful Evil','Supreme Dragon Highlord',
   public._tiptap('Brutal, strategically gifted, and personally terrifying. Ariakas commands through fear and demonstrated consequence. He has no patience for the complicated internal politics of the Dragonlords — he prefers to solve disputes by removing one of the disputants.'),
   public._tiptap('The supreme commander of all five Dragonarmies, answerable only to Takhisis herself. Ariakas is a fearsome warrior who killed his own father to prove his worth to the Dark Queen. He wears the Crown of Power and commands the Red Dragonarmy, the most powerful of the five wings.'),
   'alive','enemy',null,true,ARRAY['dragon highlord','red dragonarmy','villain','supreme commander']),

  (v_uid,'Laurana Kanan','dragonlance','Elf','Neutral Good','General / The Golden General',
   public._tiptap('Initially sheltered and naive, Laurana has been hardened by war into something extraordinary. She is brave without being reckless, brilliant without being cold, and she carries the grief of people who have died following her orders.'),
   public._tiptap('Princess of the Qualinesti elves, childhood friend and eventual partner to Tanis Half-Elven. She began the war as a young noblewoman who followed the Companions out of heartbreak and grew into the Golden General — the greatest military commander of the Whitestone Forces.'),
   'alive','ally',null,true,ARRAY['qualinesti','golden general','whitestone forces','elf','general']),

  (v_uid,'Fizban the Fabulous','dragonlance','Human (disguised)','Neutral Good','Wandering Wizard / Ancient',
   public._tiptap('Absent-minded, cheerful, and prone to spectacular magical mishaps — or so he seems. Fizban has a way of appearing exactly when he is needed and vanishing before anyone can ask too many questions. He is very fond of hats.'),
   public._tiptap('A bumbling old wizard who traveled with the Companions for a time, Fizban is secretly far more than he appears. Those who meet him rarely forget him — even if they can''t quite explain why.'),
   'alive','ally',null,true,ARRAY['wizard','mysterious','divine','companion']),

  (v_uid,'Lord Soth','dragonlance','Undead (Death Knight)','Lawful Evil','Death Knight / Knight of the Rose',
   public._tiptap('Magnificent in his ruin. Soth was once the noblest of the Rose Knights, and the tragedy of what he chose has calcified into cold contempt for everything he failed to be. He serves Kitiara not out of loyalty but because it suits him — and because she found a use for a horror like him.'),
   public._tiptap('Once the greatest Knight of the Rose in Solamnia''s history, Lord Soth was cursed to undeath after he failed to stop the Cataclysm — a task the gods gave him that he abandoned for petty personal reasons. He is now a death knight of terrible power who commands the undead and serves Kitiara uth Matar.'),
   'alive','enemy',null,true,ARRAY['death knight','villain','undead','kitiara','solamnia']),

  (v_uid,'Berem Everman','dragonlance','Human','Neutral Good','The Everman / Key to Takhisis',
   public._tiptap('Haunted, wandering, and consumed by guilt over his sister''s death. Berem is not quite sane and not quite present. He has been running for decades and does not know how to stop.'),
   public._tiptap('An ordinary man who pulled a green gemstone from a ruined altar, accidentally killing his sister. The gem fused with his chest and made him immortal — and unknowingly became the key Takhisis needs to fully enter the world of Krynn. The Dragon Highlords have been hunting him for years.'),
   'alive','ally',null,true,ARRAY['everman','immortal','key','takhisis','tragic']),

  -- ── RAVENLOFT ─────────────────────────────────────────────────────────────

  (v_uid,'Strahd von Zarovich','ravenloft','Vampire','Lawful Evil','Darklord of Barovia / Count',
   public._tiptap('Ancient, imperious, and consumed by a love he can never fulfil. Strahd is not a simple monster — he is a brilliant general and ruler who has lived with his curse for centuries. He is capable of charm, generosity, and terrible violence, often in the same conversation.'),
   public._tiptap('Once a great conqueror and warlord, Strahd made a pact with Death to claim his brother Sergei''s bride Tatyana. He murdered his brother on Sergei''s wedding day, became the first vampire, and has been imprisoned in Barovia ever since — watching Tatyana''s soul reincarnate again and again, forever out of reach.'),
   'alive','enemy',null,true,ARRAY['darklord','vampire','barovia','strahd','curse of strahd']),

  (v_uid,'Madam Eva','ravenloft','Vistani','True Neutral','Seer / Vistani Elder',
   public._tiptap('Ancient, inscrutable, and radiating an unsettling sense of purpose. Madam Eva does not explain herself. She reads the Tarokka cards, delivers her prophecies, and watches — always watches — to see which fate the players choose.'),
   public._tiptap('The eldest and most powerful Vistani seer in Barovia, Madam Eva has guided countless adventurers to their doom or salvation. Her true nature is debated — some say she is a fragment of the Dark Powers themselves.'),
   'alive','neutral',null,true,ARRAY['vistani','seer','tarokka','barovia','mysterious']),

  (v_uid,'Rudolph van Richten','ravenloft','Human','Lawful Good','Monster Hunter / Scholar',
   public._tiptap('Methodical, haunted, and driven by grief transformed into purpose. Van Richten lost his son to vampires and has spent decades building the knowledge to destroy them. He is brilliantly capable and deeply tragic — a man who has become the thing he hunts in terms of ruthlessness.'),
   public._tiptap('The foremost monster hunter in the Demiplane of Dread, author of the Van Richten''s Guides to various horrors. He travels under assumed identities because his enemies are numerous and his allies few. He carries tremendous guilt.'),
   'alive','ally',null,true,ARRAY['van richten','monster hunter','scholar','barovia','tragic']),

  (v_uid,'Rictavio','ravenloft','Human','Lawful Good','Monster Hunter (Disguised as Carnival Master)',
   public._tiptap('Theatrical, careful, and operating at least two personas at once. When Rictavio lets the mask slip, the grief and steel underneath are unmistakable. He has been at this long enough that the performance is almost comfortable.'),
   public._tiptap('Van Richten''s travelling alias — a jolly carnival master with a covered wagon and a pet saber-toothed tiger. He uses this disguise to move through Barovia without Strahd identifying him. Anyone who looks closely enough will notice the hunter''s eyes behind the showman''s smile.'),
   'alive','ally',null,true,ARRAY['van richten','disguise','monster hunter','barovia','carnival']),

  (v_uid,'Ireena Kolyana','ravenloft','Human','Neutral Good','Nobleman''s Daughter / Fighter',
   public._tiptap('Brave and self-possessed despite living her entire life in the shadow of Castle Ravenloft. Ireena refuses to be a victim. She is stubborn, warm, and somewhat bewildered that anyone has come to help her.'),
   public._tiptap('The adopted daughter of the Burgomaster of the Village of Barovia, Ireena bears the face of Tatyana — the woman Strahd has loved and lost across centuries. She has been bitten twice. The party''s job is to get her somewhere safe before the third bite.'),
   'alive','ally',null,true,ARRAY['barovia','tatyana','strahd','protected']),

  (v_uid,'Ismark the Lesser','ravenloft','Human','Neutral Good','Fighter / Burgomaster''s Son',
   public._tiptap('Earnest, brave, and desperately aware that his nickname ''the Lesser'' is probably accurate. Ismark is trying to do right by his sister and his village without the power or resources to succeed alone. He will accept any help offered.'),
   public._tiptap('Son of the Burgomaster of the Village of Barovia, Ismark has watched his father die and his sister become Strahd''s obsession. He reached out to adventurers because he has no other options. He is ordinary — and the world needs ordinary people to be brave.'),
   'alive','ally',null,true,ARRAY['barovia','village','ireena','burgomaster']),

  (v_uid,'Azalin Rex','ravenloft','Lich','Lawful Evil','Darklord of Darkon / Lich King',
   public._tiptap('Cold, erudite, and possessed of a scholar''s obsession with breaking rules that should not be breakable. Azalin is trapped in the Demiplane just as Strahd is, and he hates it with a methodical, academic fury that has not cooled in centuries.'),
   public._tiptap('Once a powerful wizard-king, Azalin achieved lichdom and was drawn into the Demiplane of Dread, where he rules Darkon. He attempted a ritual called the Requiem to break free — it destroyed his domain''s capital instead, turning Il Aluk into the Necropolis. He is still searching for an exit.'),
   'alive','enemy',null,true,ARRAY['darklord','lich','darkon','necropolis','il aluk']),

  (v_uid,'Vlad Drakov','ravenloft','Human','Lawful Evil','Darklord of Falkovnia / Military Tyrant',
   public._tiptap('A bully who became a warlord who became a tyrant. Drakov is not subtle, not clever, and not interested in being either. He respects only force and interprets every negotiation as an invitation to demonstrate it.'),
   public._tiptap('A mercenary warlord who conquered the domain of Falkovnia through sheer military brutality. He is imprisoned here by the Dark Powers — his curse is that his armies, no matter how large, are perpetually attacked by undead hordes he can never quite defeat. He has never connected these two facts.'),
   'alive','enemy',null,true,ARRAY['darklord','falkovnia','tyrant','military','warlord']),

  (v_uid,'Doctor Viktra Mordenheim','ravenloft','Human','Neutral Evil','Darklord of Lamordia / Scientist',
   public._tiptap('Brilliant and utterly convinced that emotion is a defect to be corrected. Mordenheim works with a surgeon''s precision and an artist''s obsession. She has created the perfect artificial life — and her creation hates her for it.'),
   public._tiptap('The Darklord of Lamordia — a domain of gothic science-horror. She created a flesh golem called Adam, seeking to understand and replicate the miracle of life. Adam''s rejection of her and his subsequent suffering is her prison — she cannot truly rest until she recaptures him, and she cannot capture him while he chooses to flee.'),
   'alive','enemy',null,true,ARRAY['darklord','lamordia','scientist','flesh golem','gothic science']),

  (v_uid,'Adam the Flesh Golem','ravenloft','Flesh Golem','Chaotic Neutral','Mordenheim''s Creation / Fugitive',
   public._tiptap('Wounded, intelligent, and oscillating between grief and rage. Adam did not ask to exist and did not ask to be what he is. He wants only to understand his nature and to be left alone — neither of which the Demiplane is inclined to provide.'),
   public._tiptap('Created by Doctor Mordenheim from cadaver parts as proof that life can be manufactured. Adam''s consciousness awakened fully formed — and with full awareness of what he was. He fled his creator and now wanders Lamordia and beyond, a tragic figure too intelligent to be a monster and too monstrous to be a man.'),
   'alive','neutral',null,true,ARRAY['lamordia','flesh golem','creation','mordenheim','tragic']),

  (v_uid,'Lady Wachter','ravenloft','Human','Lawful Evil','Noble / Devil Cultist',
   public._tiptap('Controlled, patrician, and absolutely convinced that Strahd''s rule is preferable to the chaos that would follow his defeat. Lady Wachter pragmatically worships devils, runs Vallaki''s opposition faction, and views anyone who tries to ''save'' Barovia as a dangerous idiot.'),
   public._tiptap('The matriarch of Wachterhaus in Vallaki and a secret cult leader who communes with a devil familiar. She believes the way to protect her family and city is to cooperate with Strahd rather than oppose him. She is not wrong exactly — she is just operating on a shorter time horizon than the party.'),
   'alive','enemy',null,true,ARRAY['vallaki','noble','cult','devil','pragmatist']),

  (v_uid,'Father Lucian Petrovich','ravenloft','Human','Lawful Good','Priest of the Morning Lord',
   public._tiptap('Gentle, fearful, and clinging to faith the way a drowning man clings to a plank. Father Lucian has never stopped believing but he has often stopped hoping. He will help adventurers because it is right, not because he expects it to work.'),
   public._tiptap('The priest of St. Andral''s Church in Vallaki, keeper of the bones of St. Andral that protect the church from Strahd. He is a decent man in a terrible place, doing what he can. Someone has stolen the bones. He knows he should tell someone. He is afraid of what comes next.'),
   'alive','ally',null,true,ARRAY['vallaki','priest','morning lord','church','st andral']),

  (v_uid,'Esmeralda d''Avenir','ravenloft','Half-Vistani','Neutral Good','Monster Hunter',
   public._tiptap('Fierce, proud, and carrying the particular bitterness of someone who belongs nowhere — too human for the Vistani caravans, too Vistani for most human settlements. She channels this into exceptional competence at killing things that deserve it.'),
   public._tiptap('A half-Vistani monster hunter trained by Van Richten himself. She is one of the most capable monster hunters in the Demiplane of Dread but lacks her mentor''s decades of experience — which she compensates for with aggression. She and Van Richten have a complicated history.'),
   'alive','ally',null,true,ARRAY['monster hunter','vistani','half-vistani','van richten','hunter']),

  (v_uid,'Arturi Radanavich','ravenloft','Vistani','True Neutral','Vistani Traveller / Bearer of a Curse',
   public._tiptap('Tired and carrying something he cannot put down. Arturi is one of Van Richten''s oldest connections to the Vistani — and one of the Vistani who placed a curse on the doctor that he has never quite been able to forgive himself for.'),
   public._tiptap('A Vistani man who participated in the curse placed on Van Richten after the doctor used Vistani knowledge destructively. He travels the Demiplane in atonement — or perhaps just in habit — and has a uniquely complicated relationship with the concept of justice.'),
   'alive','neutral',null,true,ARRAY['vistani','curse','van richten','traveller','atonement']),

  -- ── PLANESCAPE ────────────────────────────────────────────────────────────

  (v_uid,'The Lady of Pain','planescape','Unknown','True Neutral','Ruler of Sigil',
   public._tiptap('The Lady does not speak. She floats silently through Sigil''s streets on her dabus. Those who displease her are mazed — imprisoned in a pocket dimension — or flayed alive where they stand. Her motivations are completely unknowable. Do not pray to her. Do not make eye contact.'),
   public._tiptap('The absolute ruler of Sigil and the most powerful entity in the city. She keeps all gods out of Sigil and maintains the city''s neutrality through sheer terror. Her origins are unknown. Her purpose is unknown. She has existed for as long as Sigil itself.'),
   'alive','neutral',null,true,ARRAY['sigil','ruler','mysterious','unknowable','dabus']),

  (v_uid,'Fall-from-Grace','planescape','Tiefling (Succubus)','Neutral Good','Proprietor of the Brothel for Slaking Intellectual Lusts',
   public._tiptap('Serene, philosophical, and possessing a rare quality in Sigil — genuine kindness. Grace has renounced her fiendish nature and found that wisdom and compassion are more interesting than temptation. She is soft-spoken and absolutely deadly in combat.'),
   public._tiptap('A succubus who rejected the Abyss and took paladin vows — or something close to them. She runs an establishment in Sigil dedicated to satisfying the mind rather than the body. She is a member of the Society of Sensation and a genuine moral force in the city.'),
   'alive','ally',null,true,ARRAY['sigil','succubus','paladin','sensates','tiefling']),

  (v_uid,'Shemeshka the Marauder','planescape','Arcanaloth','Neutral Evil','Information Broker / Crime Lord',
   public._tiptap('Theatrical, vain, and extraordinarily dangerous. Shemeshka presents herself as a gracious and sophisticated merchant of secrets — which she is — while concealing a predator''s patience and a yugoloth''s utter lack of conscience. She knows everyone''s price.'),
   public._tiptap('The most powerful information broker in Sigil, Shemeshka has her fingers in every pie and her claws around every throat. She is old, rich, and paranoid in equal measure. Dealing with her is profitable and extremely risky.'),
   'alive','neutral',null,true,ARRAY['sigil','arcanaloth','information broker','yugoloth','villain']),

  (v_uid,'Factol Rhys of the Transcendent Order','planescape','Human (Tiefling heritage)','True Neutral','Factol of the Transcendent Order (Ciphers)',
   public._tiptap('Swift, decisive, and utterly present — Rhys embodies the Cipher philosophy that thought and action are one. She rarely explains her decisions because her body has already made them. She is not unkind; she simply doesn''t have time for hesitation.'),
   public._tiptap('The leader of the Transcendent Order — Ciphers — who believe that acting without thought is the highest form of consciousness. Rhys reached this enlightenment through decades of rigorous training. She remains one of the deadliest fighters in Sigil.'),
   'alive','neutral',null,true,ARRAY['sigil','ciphers','transcendent order','factol','martial']),

  (v_uid,'Morte','planescape','Undead (Floating Skull)','Chaotic Neutral','Companion / Insult Artist',
   public._tiptap('Wisecracking, cowardly, fiercely loyal, and possessed of an extraordinary vocabulary of barbs. Morte pretends everything is a joke because admitting anything matters is more frightening than the Abyss.'),
   public._tiptap('A floating talking skull of unknown origin who has served as a companion to countless amnesiac travellers through the planes. His true history is darker than his patter suggests. He knows more than he lets on — about everything.'),
   'alive','ally',null,true,ARRAY['sigil','skull','companion','undead','nameless one']),

  (v_uid,'The Nameless One','planescape','Human (Immortal)','Unknown','Amnesiac Immortal / Seeker',
   public._tiptap('Every incarnation is different — the Nameless One''s personality shifts with each death and resurrection. The current version is curious, haunted by scars he cannot explain, and driven by a question he cannot quite remember formulating: what can change the nature of a man?'),
   public._tiptap('An immortal being who has died and been reborn so many times that his identity has fractured across his incarnations. Each rebirth costs him his memories. He wanders Sigil and the planes trying to piece together who he was, who he is, and what it would mean to finally die. His story is the central tragedy of the Planescape setting.'),
   'alive','ally',null,true,ARRAY['sigil','immortal','amnesiac','nameless one','torment']),

  (v_uid,'Factol Sarin','planescape','Human','Lawful Neutral','Factol of the Harmonium',
   public._tiptap('Earnest, idealistic, and convinced that peace is achievable if everyone would simply agree on the correct approach. Sarin is not stupid — he is genuinely persuasive, and the fact that his philosophy curdles into authoritarianism at scale is a thing he is working very hard not to notice.'),
   public._tiptap('The current leader of the Harmonium — Sigil''s primary law enforcement faction, who believe universal peace is achievable when everyone agrees with them. Sarin is a true believer rather than a cynical power-seeker, which in some ways makes him more dangerous.'),
   'alive','neutral',null,true,ARRAY['sigil','harmonium','hardheads','factol','lawful']),

  (v_uid,'Factol Skall','planescape','Undead (Wight)','True Neutral','Factol of the Dustmen',
   public._tiptap('Quiet, measured, and possessed of the infinite patience of the already-dead. Skall does not argue — he waits. He has found something most find disturbing: genuine contentment. The Dead philosophy says life as we know it is the aberration, and Skall has stopped finding this sad.'),
   public._tiptap('The undead leader of the Dustmen — the faction that believes all living beings are undead who haven''t accepted it yet. Skall runs Sigil''s Mortuary with quiet efficiency and advocates for the Dead philosophy with the serene certainty of someone who has personally crossed the threshold and found it agreeable.'),
   'alive','neutral',null,true,ARRAY['sigil','dustmen','undead','factol','mortuary']),

  (v_uid,'Duke Rowan Darkwood','planescape','Human','Chaotic Neutral','Factol of the Fated',
   public._tiptap('Supremely self-assured, ambitious, and operating under the sincere conviction that the multiverse''s resources belong to whoever can claim them. Darkwood is charming when that serves him and ruthless when charm runs out. He considers this intellectual consistency.'),
   public._tiptap('The factol of the Fated — the Takers — who control Sigil''s Hall of Records and tax collection. Darkwood rose to the top through a combination of political brilliance and the willingness to use every advantage available to him. He views anyone who criticises this as someone who hasn''t won yet.'),
   'alive','neutral',null,true,ARRAY['sigil','fated','takers','factol','ambitious']),

  (v_uid,'Lothar the Old','planescape','Human (Lich-like)','True Neutral','Master of Bones / Skull Keeper',
   public._tiptap('Ancient, calm, and operating in a register of time that makes normal conversation feel slightly rushed. Lothar collects skulls of the notable dead and can converse with them. He is not threatening exactly, but his hobby is unsettling and his knowledge is extraordinary.'),
   public._tiptap('An ancient man who operates the City of Skulls — a collection of skulls of the famous dead preserved in Sigil''s lower wards. He can speak with any skull in his collection, making him one of the most remarkable information resources in the planes. His own nature is uncertain; he has been here longer than most recall.'),
   'alive','neutral',null,true,ARRAY['sigil','skulls','lore keeper','undead','ancient']),

  (v_uid,'Alluvius Ruskin','planescape','Tiefling','True Neutral','Information Broker / Lens Merchant',
   public._tiptap('Cheerfully mercantile and utterly without sentiment about the information trade. Alluvius sells what she has to whoever can pay, and she considers this a public service. She is not dishonest — she simply does not volunteer information that wasn''t purchased.'),
   public._tiptap('A tiefling who runs a lens and optical goods shop in Sigil as cover for an extensive information brokerage. She competes with Shemeshka in the information trade but specializes in a different tier of client — useful intelligence for people who can''t afford an arcanaloth.'),
   'alive','neutral',null,true,ARRAY['sigil','information broker','tiefling','merchant','lens shop']),

  (v_uid,'Zadara the Titan','planescape','Titan','Chaotic Good','Planar Traveller / Titan Warrior',
   public._tiptap('Enormous in personality as in body — Zadara is passionate, protective of those she considers under her wing, and completely indifferent to the factional politics that consume smaller beings. She has her own agenda, which operates on a scale most find difficult to track.'),
   public._tiptap('A titan who travels the planes and has established a presence in the Outlands. She is not a Sigil native but visits frequently and has alliances across several factions. Her true purposes are her own, but she has helped travellers who impressed her and harmed those who insulted her in about equal measure.'),
   'alive','neutral',null,true,ARRAY['titan','outlands','planar traveller','powerful','chaotic good']),

  -- ── SPELLJAMMER ───────────────────────────────────────────────────────────

  (v_uid,'Prince Anton of Bral','spelljammer','Human','Neutral','Prince / Administrator of the Rock of Bral',
   public._tiptap('Pragmatic, politically savvy, and genuinely committed to the Rock''s neutrality. Anton knows everyone who matters in Bral and uses that knowledge to keep the asteroid from becoming a battlefield. He is neither warm nor cold — just practical.'),
   public._tiptap('The ruling prince of the Rock of Bral, the most important port in Wildspace. He has held the city together through pirate attacks, neogi trade wars, and githyanki territorial disputes. He maintains peace through favours owed and promises carefully kept.'),
   'alive','neutral',null,true,ARRAY['rock of bral','administrator','prince','neutral']),

  (v_uid,'Aelrindel','spelljammer','Astral Elf','Lawful Neutral','Navigator / Spelljammer Pilot',
   public._tiptap('Precise, patient, and slightly contemptuous of those who cannot read the stars. Aelrindel has sailed the Astral Sea for centuries and carries herself with the quiet authority of someone who has never been truly lost.'),
   public._tiptap('A veteran astral elf navigator who now hires out her expertise to merchantmen and explorers. She left the Astral Elves'' silver citadels after a disagreement about a route that got half a crew killed — an event she has never fully forgiven herself for.'),
   'alive','ally',null,true,ARRAY['astral elf','navigator','pilot','spelljammer']),

  (v_uid,'Commodore Kreel','spelljammer','Giff','Lawful Neutral','Mercenary Captain',
   public._tiptap('Thunderously loud, obsessed with firearms and military protocol, and possessed of an honour code that would shame a paladin. Kreel keeps his word to the letter even when it costs him. He is not subtle. He is extremely effective.'),
   public._tiptap('The commander of a giff mercenary company that takes contracts across Wildspace — escort, security, retrieval, and the occasional ''liberation''. His company has an impeccable record and rates to match. He is distantly searching for the Giff homeworld, which no living giff has ever seen.'),
   'alive','neutral',null,true,ARRAY['giff','mercenary','captain','firearms']),

  (v_uid,'Sserket','spelljammer','Thri-kreen','True Neutral','Merchant / Void Trader',
   public._tiptap('Patient on a scale humans find unsettling. Sserket communicates through clicks, gesture, and a translator-stone; she finds most conversations refreshingly short. She is scrupulously honest in trade and will not tolerate deception from others.'),
   public._tiptap('A thri-kreen merchant who operates a trading vessel called the Carapace between several crystal spheres, specialising in biological curiosities and alchemical supplies. She travels with a small crew of her clutch-kin and has no interest in politics unless they affect trade routes.'),
   'alive','neutral',null,true,ARRAY['thri-kreen','merchant','trader','wildspace']),

  (v_uid,'Mirt the Moneylender','spelljammer','Human','Chaotic Good','Merchant / Harper Agent',
   public._tiptap('Corpulent, jolly, and far more dangerous than he looks. Mirt made his fortune in Waterdeep and now spreads it across the spheres, always keeping one eye out for Harper interests and one eye on the bottom line.'),
   public._tiptap('A legendary figure from Waterdeep who discovered Spelljammer travel late in life and found it to his liking. He operates as a trader and Harper informant across Realmspace and beyond, financing expeditions he considers worthwhile.'),
   'alive','ally',null,true,ARRAY['waterdeep','harper','merchant','realmspace']),

  (v_uid,'Admiral Icarus Bloodstar','spelljammer','Scro','Lawful Evil','Scro Admiral / Fleet Commander',
   public._tiptap('Disciplined, intelligent, and carrying the entire philosophical weight of the Scro project — proving that orcs rebuilt from the ground up can surpass the species that defeated them. He is not cruel for pleasure; cruelty is for amateurs. He is thorough.'),
   public._tiptap('A senior commander in the Scro Empire''s Wildspace fleet, devoted to the long-term strategic goal of revenge against the Elven Imperial Fleet. He coordinates operations across multiple crystal spheres and has the patience to plan campaigns that will outlast his current command.'),
   'alive','enemy',null,true,ARRAY['scro','admiral','fleet','villain','unhuman wars']),

  (v_uid,'Vocath','spelljammer','Mercane','True Neutral','Mercane Trade Factor',
   public._tiptap('Polite, unhurried, and possessed of the specific kind of neutrality that comes from never needing anything from anyone. Vocath will deal with anyone, sell to anyone, and betray anyone — not from malice but from the absolute conviction that trade is more important than allegiance.'),
   public._tiptap('A senior mercane trade factor who operates across multiple crystal spheres, dealing in goods that other merchants cannot obtain and navigating between hostile factions with practiced ease. He has dealt with heroes, villains, Arcane, pirates, and worse — and has lived because everyone found him useful.'),
   'alive','neutral',null,true,ARRAY['mercane','merchant','trade factor','neutral','wildspace']),

  (v_uid,'Zikta the Neogi Mistress','spelljammer','Neogi','Lawful Evil','Neogi Slavemaster / Deathspider Captain',
   public._tiptap('Coldly contemptuous of all non-neogi life and genuinely puzzled by the concept of freedom. Zikta regards her slaves as property in the same philosophical register that most people regard their furniture — not cruelly, exactly, just without attribution of moral status.'),
   public._tiptap('Captain of a Deathspider vessel operating through three crystal spheres, Zikta runs one of the more successful neogi slaving operations in the known void. She is not exceptional by neogi standards — which means she is extraordinary by everyone else''s. Her ship is a standing target for the Elven Imperial Fleet.'),
   'alive','enemy',null,true,ARRAY['neogi','slaver','captain','deathspider','villain']),

  (v_uid,'Captain Aramis','spelljammer','Human','Chaotic Neutral','Void Pirate / Captain',
   public._tiptap('Theatrical, charming, and operating on a personal moral code that makes sense only to him. Aramis steals from the wealthy, keeps the interesting bits, and distributes the rest according to whims that seem arbitrary but have produced a loyal crew.'),
   public._tiptap('The most famous pirate in Realmspace — famous enough that his name is used to frighten cargo manifests into paying protection fees. He captains a converted merchantman called the Absent Star and has evaded the Elven Imperial Fleet long enough that some suspect he has an inside contact.'),
   'alive','neutral',null,true,ARRAY['pirate','captain','realmspace','wildspace','notorious']),

  -- ── DARK SUN ──────────────────────────────────────────────────────────────

  (v_uid,'Rikus','darksun','Mul (Dwarf-Human Half-Breed)','Chaotic Good','Gladiator / Hero of Tyr',
   public._tiptap('Explosive, brave to the point of recklessness, and consumed by righteous fury at a world that made him a slave. Rikus leads with his body and rarely pauses to think. When he does think, he surprises people.'),
   public._tiptap('The greatest gladiator in Tyr''s arena, Rikus played a central role in killing the sorcerer-king Kalak and freeing the city. He fights for Tyr''s republic with the same savage efficiency he once used to survive the arena — and he is deeply uncertain what freedom is supposed to feel like.'),
   'alive','ally',null,true,ARRAY['tyr','gladiator','mul','hero of tyr','free tyr']),

  (v_uid,'Sadira of Tyr','darksun','Half-Elf','Neutral Good','Preserver Wizard / Revolutionary',
   public._tiptap('Principled, intelligent, and carrying the weight of a terrible power she did not ask for. Sadira chose the preserving path when it was dangerous to do so — she refuses to use defiling magic even when it would be easier.'),
   public._tiptap('A preserver wizard from Tyr''s underclass who helped bring down Kalak. She later underwent a ritual that granted her the Sun Wizard''s power — fuelled by sunlight rather than life, making her the most powerful non-defiling wizard on Athas. The power terrifies her.'),
   'alive','ally',null,true,ARRAY['tyr','preserver','wizard','sun wizard','revolutionary']),

  (v_uid,'Agis of Asticles','darksun','Human','Lawful Good','Senator of Tyr / Psionicist',
   public._tiptap('Thoughtful, idealistic, and genuinely committed to building something good from Tyr''s ruins. Agis approaches politics with the same disciplined calm he brings to psionics. He is the conscience of the free city.'),
   public._tiptap('A Tyrian noble and senator who was one of the key figures in the conspiracy against Kalak. Agis uses his psychic gifts and political influence to build Tyr''s fragile republic. He believes — perhaps naively — that it can work.'),
   'alive','ally',null,true,ARRAY['tyr','senator','psionicist','noble','republic']),

  (v_uid,'Neeva','darksun','Mul (Dwarf-Human Half-Breed)','Chaotic Good','Gladiator / Warrior',
   public._tiptap('Fierce, pragmatic, and deeply loyal to Rikus in a way she would never put into words. Neeva approaches everything the way she approaches a fight — directly, efficiently, and without apology. She has strong opinions about almost everything and states them without softening.'),
   public._tiptap('A mul gladiator from Tyr who fought alongside Rikus and participated in the uprising against Kalak. She is one of the finest warriors in the city and has struggled with what to do with her skills in a world that is supposedly at peace.'),
   'alive','ally',null,true,ARRAY['tyr','gladiator','mul','warrior','hero of tyr']),

  (v_uid,'Tithian of Mericles','darksun','Human','Neutral Evil','High Templar / King of Tyr',
   public._tiptap('Charming, treacherous, and driven by ambitions that always exceed what the current situation can satisfy. Tithian helped kill Kalak because he wanted the throne — not freedom. He smiles easily and means almost none of it.'),
   public._tiptap('A high templar of Tyr who facilitated the assassination of Sorcerer-King Kalak and then claimed the throne for himself. He is not a liberator — he is an opportunist who correctly identified where the leverage was. He wants power, not justice, and he is very good at looking like he wants the latter.'),
   'alive','neutral',null,true,ARRAY['tyr','king','templar','traitor','ambitious']),

  (v_uid,'Hamanu','darksun','Human (Sorcerer-King)','Lawful Evil','Sorcerer-King of Urik / Dragon-Metamorph',
   public._tiptap('Cold, calculating, and utterly convinced of his own superiority — because he may well be right. Hamanu views everything and everyone as a resource. He is not capricious like some sorcerer-kings. He is systematic.'),
   public._tiptap('The immortal sorcerer-king of Urik, Hamanu has ruled for thousands of years through discipline and terror. He is secretly a dragon-metamorph in mid-transformation. He watched Kalak fall with contempt — not grief. He does not intend to make the same mistakes.'),
   'alive','enemy',null,true,ARRAY['urik','sorcerer-king','dragon metamorph','villain','immortal']),

  (v_uid,'Tectuktitlay','darksun','Human (Sorcerer-King)','Lawful Evil','Sorcerer-King of Draj / Divine Emperor',
   public._tiptap('Theatrical, grandiose, and entirely convinced of his own divine status — the blood sacrifice demands are not cruelty but piety, in his theology. He performs godhood with complete conviction. Whether he believes it is the interesting question.'),
   public._tiptap('The sorcerer-king of Draj who rules through the religion he constructed around himself, demanding blood sacrifice at the twin pyramids to ''feed'' the crimson sun and keep it rising. His templars are simultaneously priests and soldiers. His city is simultaneously terrified and fanatically devoted.'),
   'alive','enemy',null,true,ARRAY['draj','sorcerer-king','sacrifice','divine emperor','villain']),

  (v_uid,'Andropinis','darksun','Human (Sorcerer-King)','Lawful Evil','Dictator of Balic / Sorcerer-King',
   public._tiptap('The most politically sophisticated of the sorcerer-kings — Andropinis runs Balic as an elected dictator with a functioning Senate, which is window dressing he maintains because it is useful. He is patient, cultured, and lethal in the specific way of people who have had centuries to perfect lethal.'),
   public._tiptap('The sorcerer-king of Balic, a city of silt-sailors and senatorial tradition. Andropinis has maintained his power through a combination of genuine administrative competence and the same ageless sorcery that sustains all his peers. He is the most diplomatically predictable of the sorcerer-kings — which is not the same as trustworthy.'),
   'alive','enemy',null,true,ARRAY['balic','sorcerer-king','dictator','senate','villain']),

  (v_uid,'Lalali-Puy the Oba','darksun','Human (Sorcerer-Queen)','Lawful Evil','Sorcerer-Queen of Gulg / The Oba',
   public._tiptap('Primal, intense, and genuinely connected to a spiritual framework that gives her rule a coherent theology. Lalali-Puy is not performing godhood the way Tectuktitlay is — she believes it. This makes her both more sincere and more dangerous.'),
   public._tiptap('The divine ruler of Gulg, the Forest City — the most spiritual of the city-states. Her Judaga templars combine the roles of priest, soldier, and judge. She draws power from primal magic as well as defiling, which gives Gulg a different flavour of brutality than its peers.'),
   'alive','enemy',null,true,ARRAY['gulg','sorcerer-queen','oba','primal','villain']),

  (v_uid,'Nibenay the Shadow King','darksun','Human (Sorcerer-King)','Neutral Evil','Sorcerer-King of Nibenay / Scholar',
   public._tiptap('Reclusive, intellectual, and genuinely more interested in his arcane research than in governance — which he has delegated entirely to his Shadow Brides. When he does appear, it is always for something important, and it is always unsettling.'),
   public._tiptap('The enigmatic sorcerer-king of Nibenay, named after his own city. He has retreated into his palace-complex and emerges only rarely, leaving his all-female templar corps — the Shadow Brides — to administer the city. What he is studying in his isolation is a question no one has been able to answer.'),
   'alive','enemy',null,true,ARRAY['nibenay','shadow king','sorcerer-king','reclusive','villain']),

  (v_uid,'Nok','darksun','Halfling','Chaotic Neutral','Halfling Elder / Forest Chief',
   public._tiptap('Ancient, utterly alien in his values, and operating under a halfling philosophy that predates the destruction of Athas''s ecology by millennia. Nok is not hostile exactly — but his species remembers when they were the apex predators, and that memory shapes everything.'),
   public._tiptap('The leader of a halfling community in the Forest Ridge, one of the few remaining green places on Athas. Athasian halflings are not the gentle folk of other worlds — they are hunters, ritual cannibals by tradition, and the original inhabitants of a world that was ruined after their time.'),
   'alive','neutral',null,true,ARRAY['halfling','forest ridge','elder','ancient','primal']),

  (v_uid,'The Dragon of Athas (Borys)','darksun','Dragon (formerly Human)','Neutral Evil','The Dragon / Enforcer of the Sorcerer-Kings',
   public._tiptap('Ancient beyond measure and alien in his thinking. Borys is no longer fully conscious of his humanity. He communicates in demands and demonstrates power in ways that leave craters. He is the reason the Tablelands has stayed relatively stable — and the reason it continues to die.'),
   public._tiptap('Once a great champion who became the first sorcerer-king to complete the dragon metamorphosis. The other kings made a pact: they feed him a thousand lives each year to keep him docile. In exchange he enforces the status quo. The Dragon is the apex predator of Athas — and also its greatest unsolved problem.'),
   'alive','enemy',null,true,ARRAY['dragon','borys','sorcerer-king','apex predator','athas']),

  -- ── MYSTARA ───────────────────────────────────────────────────────────────

  (v_uid,'Duke Stefan Karameikos','mystara','Human','Lawful Good','Duke / Ruler of Karameikos',
   public._tiptap('Idealistic, honourable, and occasionally naive about the entrenched resentments his colonisation of Traladaran lands has created. Stefan genuinely wants to build a just and prosperous duchy — he is simply doing it on top of someone else''s home.'),
   public._tiptap('A Thyatian noble who traded his family lands in Thyatis for the territory of Traladara, which he renamed Karameikos. He imported Thyatian colonists and has been trying ever since to build a unified duchy that respects both Thyatian and Traladan cultures — with mixed results.'),
   'alive','ally',null,true,ARRAY['karameikos','duke','thyatian','ruler','frontier']),

  (v_uid,'Aleena','mystara','Human','Lawful Good','Cleric of Halav',
   public._tiptap('Warm, brave, and utterly committed to the wellbeing of those around her. Aleena is the kind of person who runs toward trouble rather than away from it. She has excellent healing spells and a quick laugh.'),
   public._tiptap('A young cleric who adventured alongside a beginning adventurer in the ruins near Threshold. She is patient with newcomers to the adventuring life and has a gift for explaining the basics of dungeon survival without making people feel foolish for not knowing.'),
   'alive','ally',null,true,ARRAY['cleric','halav','karameikos','classic','threshold']),

  (v_uid,'Bargle the Infamous','mystara','Human','Chaotic Evil','Wizard / Outlaw',
   public._tiptap('Clever, vain, and utterly convinced that his intellect entitles him to whatever he wants. Bargle is not stupid — he is dangerous. He is also deeply petty and will pursue a grudge long past the point of reason.'),
   public._tiptap('A renegade wizard who operates out of the Caves of Chaos near Threshold. He is responsible for the death of at least one beloved NPC and has evaded justice for years through a combination of cunning and teleportation. He serves a Thyatian noble faction that finds his chaos useful.'),
   'alive','enemy',null,true,ARRAY['wizard','outlaw','karameikos','villain','classic']),

  (v_uid,'Princess Adriana Karameikos','mystara','Human','Neutral Good','Princess / Adventurer',
   public._tiptap('Sharp, politically aware, and frustrated by the constraints placed on her as a royal woman. Adriana has more military ability than most of her father''s knights and is quietly determined to prove it.'),
   public._tiptap('The daughter of Duke Stefan Karameikos, raised between two cultures (Thyatian nobility and Traladan tradition). She secretly admires adventurers and has been known to disguise herself to go on expeditions — a fact that gives the palace guard grey hair.'),
   'alive','ally',null,true,ARRAY['karameikos','princess','royal','adventurer']),

  (v_uid,'Retameron Antonic','mystara','Human','Lawful Good','Knight / Caravan Guard Captain',
   public._tiptap('Steady, professional, and deeply loyal to those who have earned his trust. Retameron is not exciting. He is dependable in the way that a good sword or a well-built bridge is dependable. In Karameikos, that is worth more than excitement.'),
   public._tiptap('A veteran Thyatian knight who came to Karameikos in Duke Stefan''s first wave of colonists. He has since become a respected caravan guard captain and maintains a fighting school in Specularum. He knows every safe road and every dangerous one.'),
   'alive','ally',null,true,ARRAY['karameikos','knight','thyatian','veteran','guard captain']),

  (v_uid,'Empress Eriadna','mystara','Human','Lawful Neutral','Empress of Alphatia',
   public._tiptap('Regal, deliberate, and accustomed to being the most powerful person in any room — which in the Alphatian court means the most powerful wizard in any room. She rules an empire of arcane supremacists with the careful authority of someone who must balance genuine power against genuine arrogance.'),
   public._tiptap('The ruler of the Alphatian Empire — the great rival power to Thyatis. Alphatia is a society where wizards are the ruling class, and Eriadna sits at its apex. She has maintained Alphatian superiority through a combination of diplomatic acuity and the implicit threat of the Empire''s magical firepower.'),
   'alive','neutral',null,true,ARRAY['alphatia','empress','wizard','empire','rival']),

  (v_uid,'Emperor Thincol Torion','mystara','Human','Lawful Neutral','Emperor of Thyatis',
   public._tiptap('Blunt, pragmatic, and carrying the specific ego of a man who won the throne in the arena and has never forgotten what that required. Thincol leads with action and tolerates abstraction only when it pays.'),
   public._tiptap('A gladiator who rose through Thyatian politics by winning the right of imperial acclamation in the arena. He now rules the Thyatian Empire with the strategic instincts of a fighter who has survived everything the empire could throw at him — including its nobles.'),
   'alive','neutral',null,true,ARRAY['thyatis','emperor','gladiator','empire','ruler']),

  (v_uid,'Prince Morphail Gorevitch-Woszlany','mystara','Vampire','Lawful Evil','Vampire Prince of Boldavia / Glantrian Noble',
   public._tiptap('Old-world courtly manner over something very cold and very patient. Morphail has survived Glantrian politics for centuries by being exactly as treacherous as everyone expects and slightly more capable than anyone accounts for.'),
   public._tiptap('The vampire Prince of Boldavia and one of Glantri''s most powerful nobles. He is an open secret — everyone knows what he is; no one can prove it to the legal standards of the Glantrian courts, which is exactly as he has arranged it. He rules his principality through fear and political manoeuvre in equal measure.'),
   'alive','enemy',null,true,ARRAY['glantri','vampire','boldavia','noble','villain']),

  (v_uid,'Rad (Etienne d''Ambreville)','mystara','Human (Immortal)','Lawful Neutral','Immortal / Patron of Glantri',
   public._tiptap('Distant, benevolent in a hands-off way, and operating on a timeline that makes most conversations feel slightly pointless. Rad watches over Glantri without intervening directly — which is precisely what his Immortal status requires and precisely what his former subjects find frustrating.'),
   public._tiptap('Once the archmage Etienne d''Ambreville, head of Glantri''s most powerful noble family, who achieved Immortality and now serves as Rad — the Immortal patron of magic in the Glantrian calendar. His relationship with Glantri''s current rulers is complicated by the fact that he cannot interfere directly.'),
   'alive','neutral',null,true,ARRAY['glantri','immortal','archmage','d''ambreville','patron']),

  (v_uid,'Jaggar von Drachenfels','mystara','Human','Lawful Neutral','Prince of Aalban / War-Wizard',
   public._tiptap('Militaristic, technically brilliant, and possessing the specific competence of a wizard who has also studied military engineering. Von Drachenfels is not a schemer — he is a strategist, which is different. He solves problems with force and precision rather than politics.'),
   public._tiptap('One of Glantri''s most powerful princes and its foremost military wizard. He rules Aalban with an iron hand and is responsible for much of Glantri''s conventional military capability. His expertise in siege magic and battlefield enchantment makes him invaluable — and politically dangerous because he cannot be easily outmanoeuvred.'),
   'alive','neutral',null,true,ARRAY['glantri','prince','war wizard','military','aalban']),

  (v_uid,'Brannart McGregor','mystara','Human (Lich)','Neutral Evil','Lich-Prince of Klantyre / Glantrian Noble',
   public._tiptap('Caustic, intellectually proud, and genuinely not concerned with the social discomfort his undead status creates for others. Brannart achieved lichdom as a scholarly experiment and considers the political complications a minor inconvenience.'),
   public._tiptap('The undead prince of Klantyre in Glantri — a lich who holds noble rank and a seat on the Council of Princes. His lichdom is technically illegal under Glantrian law but he has the power to make enforcement unpleasant, and the other princes have pragmatically chosen to look elsewhere.'),
   'alive','enemy',null,true,ARRAY['glantri','lich','klantyre','noble','undead']),

  (v_uid,'The Master of Hule','mystara','Human','Lawful Evil','Theocratic Dictator of Hule',
   public._tiptap('Patient, dogmatic, and operating a long-horizon infiltration of the Known World that most of its targets haven''t noticed yet. The Master presents a face of religious reasonableness while deploying agents, mercenaries, and religious subversion in every neighbouring nation.'),
   public._tiptap('The ruler of Hule, a theocratic empire beyond the Known World''s western edge. He pursues the conquest and religious conversion of the Known World through proxy wars, cultural infiltration, and occasional direct military pressure when the opportunity arises. He has been doing this longer than most of his opponents have been alive.'),
   'alive','enemy',null,true,ARRAY['hule','master','theocracy','villain','distant']),

  (v_uid,'Thar','mystara','Orc','Chaotic Evil','Orc King',
   public._tiptap('Brutal, ambitious, and possessed of enough strategic intelligence to make him genuinely dangerous. Thar is not merely a raider — he wants to build something. Exactly what is unclear, but the process involves a lot of destruction of everything that currently exists.'),
   public._tiptap('The self-styled king of the various orc and goblinoid tribes in the region north of Karameikos. He has united more humanoid tribes than anyone expected and leads periodic massive raids against the Known World''s northern borders. The difference between Thar and previous orc warlords is that Thar thinks ahead.'),
   'alive','enemy',null,true,ARRAY['orc','warlord','king','humanoid','villain'])

  on conflict (setting, lower(name)) do update set
    race         = excluded.race,
    alignment    = excluded.alignment,
    occupation   = excluded.occupation,
    personality  = excluded.personality,
    backstory    = excluded.backstory,
    status       = excluded.status,
    relationship = excluded.relationship,
    tags         = excluded.tags,
    -- Preserve existing portrait/card art; only fill in if currently null
    portrait_url = coalesce(hall_of_heroes.portrait_url, excluded.portrait_url),
    card_art_url = coalesce(hall_of_heroes.card_art_url, excluded.card_art_url);

end $$;

-- Clean up temp helper
drop function if exists public._tiptap(text);
