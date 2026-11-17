(() => {
  "use strict";

  const SAVE_KEY = "ashfall-covenant-save-v1";
  const ATTRS = ["might", "finesse", "wits", "spirit", "guile", "resolve"];
  const ATTR_LABELS = {
    might: "Might",
    finesse: "Finesse",
    wits: "Wits",
    spirit: "Spirit",
    guile: "Guile",
    resolve: "Resolve"
  };

  const byId = (list) => Object.fromEntries(list.map((entry) => [entry.id, entry]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const title = (id) => ATTR_LABELS[id] || id;

  const origins = [
    { id: "ash_heir", name: "Ash-Sworn Heir", bonus: { resolve: 1, spirit: 1 }, tag: "noble", desc: "Last scion of a house that guarded oath-fires before the sky burned.", hook: "Concord officers treat your name like a weapon still in its sheath." },
    { id: "reedborn", name: "Reedborn Outcast", bonus: { finesse: 1, guile: 1 }, tag: "fen", desc: "Raised on marsh boats, exiled for stealing a relic that screamed in your sleep.", hook: "Fen villagers know your accent before you give your name." },
    { id: "clock_adept", name: "Clocktower Adept", bonus: { wits: 2 }, tag: "scholar", desc: "A failed artificer who can hear old engines counting down beneath the ash.", hook: "Machines and sealed vaults answer you in ticks and heat." },
    { id: "saltroad_envoy", name: "Saltroad Envoy", bonus: { spirit: 1, guile: 1 }, tag: "envoy", desc: "A road diplomat trained to make peace between hungry people with sharp knives.", hook: "Traders, refugees, and smugglers give you one more minute than most." },
    { id: "grave_choir", name: "Grave Choir Novice", bonus: { spirit: 1, resolve: 1 }, tag: "choir", desc: "You sang names into funeral ash until the dead began singing back.", hook: "Spirits recognize the pauses in your voice." },
    { id: "starless_urchin", name: "Starless Urchin", bonus: { guile: 2 }, tag: "street", desc: "A child of roof gutters, coin games, and alleys where the stars never reached.", hook: "Blackglass contacts remember old favors and older debts." }
  ];

  const archetypes = [
    { id: "ember_warden", name: "Ember Warden", hp: 34, bonus: { might: 1, resolve: 1 }, gear: ["ember_iron_sword", "ash_mantle"], abilities: ["guarded_strike", "ember_cleave"], desc: "A front-line protector who turns pain into heat." },
    { id: "thorn_hexer", name: "Thorn Hexer", hp: 26, bonus: { spirit: 1, guile: 1 }, gear: ["reedhook_dagger", "bark_mail"], abilities: ["thorn_snare", "venom_hex"], desc: "A curse-weaver who pins enemies down and lets the fen do the rest." },
    { id: "glassbow_scout", name: "Glassbow Scout", hp: 28, bonus: { finesse: 1, wits: 1 }, gear: ["reefglass_bow", "blackthread_coat"], abilities: ["glass_shot", "tripwire"], desc: "A careful ranged hunter with traps and impossible angles." },
    { id: "covenant_cantor", name: "Covenant Cantor", hp: 29, bonus: { spirit: 2 }, gear: ["cantor_bell_mace", "pilgrim_vest"], abilities: ["hymn_mend", "radiant_chord"], desc: "A battle-singer who mends flesh and steadies frightened hearts." },
    { id: "bone_scribe", name: "Bone Scribe", hp: 27, bonus: { wits: 1, spirit: 1 }, gear: ["bone_stylus", "quiet_ring"], abilities: ["bone_mark", "grave_whisper"], desc: "A scholar of remains who writes commands the dead still understand." },
    { id: "tempest_duelist", name: "Tempest Duelist", hp: 30, bonus: { finesse: 1, resolve: 1 }, gear: ["stormneedle_rapier", "weather_vane_charm"], abilities: ["storm_step", "lightning_lunge"], desc: "A mobile duelist who makes weather out of footwork." }
  ];

  const styles = [
    { id: "embermark", name: "Embermark", desc: "Burnt gold tattoos and a cloak dusted with warm ash." },
    { id: "reedcloak", name: "Reedcloak", desc: "Layered green-gray cloth, river beads, and a hooked travel knife." },
    { id: "brassmask", name: "Brassmask", desc: "A half-mask of old brass, soot gloves, and clocktower thread." },
    { id: "moonveil", name: "Moonveil", desc: "Pale linen, silver pins, and soft funeral bells at the wrist." },
    { id: "inkbrand", name: "Inkbrand", desc: "Blackglass ink, patched leather, and hidden pockets everywhere." },
    { id: "stormscar", name: "Stormscar", desc: "White scars, blue cord, and a coat cut for sudden movement." }
  ];

  const abilities = {
    strike: { id: "strike", name: "Strike", attr: "might", range: 1, power: 6, target: "enemy", type: "damage", desc: "A close attack with your equipped weapon." },
    guarded_strike: { id: "guarded_strike", name: "Guarded Strike", attr: "might", range: 1, power: 7, target: "enemy", type: "damage", selfStatus: "guarded", desc: "Deal damage and brace behind a warding stance." },
    ember_cleave: { id: "ember_cleave", name: "Ember Cleave", attr: "might", range: 1, power: 9, target: "enemy", type: "damage", status: "burning", once: true, desc: "A heavy cut that leaves the target burning." },
    thorn_snare: { id: "thorn_snare", name: "Thorn Snare", attr: "spirit", range: 4, power: 4, target: "enemy", type: "damage", status: "rooted", desc: "Fen-thorns lash out and root a target." },
    venom_hex: { id: "venom_hex", name: "Venom Hex", attr: "guile", range: 4, power: 5, target: "enemy", type: "damage", status: "poisoned", desc: "Curse blood and breath with a slow poison." },
    glass_shot: { id: "glass_shot", name: "Glass Shot", attr: "finesse", range: 5, power: 8, target: "enemy", type: "damage", desc: "A precise shot that loves height and clear lanes." },
    tripwire: { id: "tripwire", name: "Tripwire", attr: "wits", range: 3, power: 3, target: "enemy", type: "damage", status: "rooted", desc: "A snap-trap that arrests movement." },
    hymn_mend: { id: "hymn_mend", name: "Hymn Mend", attr: "spirit", range: 4, power: 10, target: "ally", type: "heal", desc: "Restore an ally with a low battlefield chant." },
    radiant_chord: { id: "radiant_chord", name: "Radiant Chord", attr: "spirit", range: 4, power: 6, target: "enemy", type: "damage", status: "weakened", desc: "A bright note that rattles hostile intent." },
    bone_mark: { id: "bone_mark", name: "Bone Mark", attr: "wits", range: 4, power: 6, target: "enemy", type: "damage", status: "marked", desc: "Write a fracture-sign only weapons can read." },
    grave_whisper: { id: "grave_whisper", name: "Grave Whisper", attr: "spirit", range: 3, power: 5, target: "enemy", type: "damage", status: "weakened", desc: "Borrow the hush of a grave and press it into a foe." },
    storm_step: { id: "storm_step", name: "Storm Step", attr: "finesse", range: 3, power: 5, target: "enemy", type: "damage", selfStatus: "inspired", desc: "Flash across wet air and strike from a new angle." },
    lightning_lunge: { id: "lightning_lunge", name: "Lightning Lunge", attr: "finesse", range: 2, power: 9, target: "enemy", type: "damage", status: "shocked", once: true, desc: "Commit to a crackling thrust that disrupts the target." },
    oath_guard: { id: "oath_guard", name: "Oath Guard", attr: "resolve", range: 3, power: 0, target: "ally", type: "buff", status: "guarded", desc: "Nyra imposes herself between an ally and harm." },
    bright_flask: { id: "bright_flask", name: "Bright Flask", attr: "wits", range: 3, power: 7, target: "enemy", type: "damage", status: "burning", desc: "Pell throws a lively flame in a bottle." },
    shadow_cut: { id: "shadow_cut", name: "Shadow Cut", attr: "guile", range: 1, power: 10, target: "enemy", type: "damage", status: "marked", desc: "Sable strikes where the armor forgot to be armor." },
    quiet_bell: { id: "quiet_bell", name: "Quiet Bell", attr: "spirit", range: 4, power: 6, target: "enemy", type: "damage", status: "weakened", desc: "Oryn rings a sound that makes violence remember its cost." },
    duelist_mark: { id: "duelist_mark", name: "Duelist Mark", attr: "finesse", range: 2, power: 8, target: "enemy", type: "damage", status: "marked", desc: "Vex names a foe and cuts toward the answer." },
    claw: { id: "claw", name: "Claw", attr: "might", range: 1, power: 5, target: "enemy", type: "damage", desc: "A brutal close attack." },
    ash_spit: { id: "ash_spit", name: "Ash Spit", attr: "finesse", range: 3, power: 4, target: "enemy", type: "damage", status: "burning", desc: "A gobbet of hot ash." },
    pike_drive: { id: "pike_drive", name: "Pike Drive", attr: "might", range: 2, power: 6, target: "enemy", type: "damage", desc: "A disciplined thrust." },
    bramble_hex: { id: "bramble_hex", name: "Bramble Hex", attr: "spirit", range: 4, power: 5, target: "enemy", type: "damage", status: "rooted", desc: "Hostile roots grab ankles." },
    wisp_lash: { id: "wisp_lash", name: "Wisp Lash", attr: "spirit", range: 4, power: 5, target: "enemy", type: "damage", status: "weakened", desc: "Cold memory lashes the living." },
    avatar_flare: { id: "avatar_flare", name: "Avatar Flare", attr: "spirit", range: 5, power: 9, target: "enemy", type: "damage", status: "burning", desc: "The Heart-Cinder answers with terrible light." }
  };

  const items = [
    { id: "ember_iron_sword", name: "Ember-Iron Sword", type: "equipment", slot: "weapon", mod: { might: 1 }, damage: 2, value: 42, desc: "A heat-dark blade from the old wardens." },
    { id: "reefglass_bow", name: "Reefglass Bow", type: "equipment", slot: "weapon", mod: { finesse: 1 }, damage: 2, value: 46, desc: "A bow strung with glassreef fiber." },
    { id: "reedhook_dagger", name: "Reedhook Dagger", type: "equipment", slot: "weapon", mod: { guile: 1 }, damage: 1, value: 31, desc: "Small, curved, and hard to notice until too late." },
    { id: "cantor_bell_mace", name: "Cantor Bell-Mace", type: "equipment", slot: "weapon", mod: { spirit: 1 }, damage: 1, value: 35, desc: "It hums softly near the dying." },
    { id: "bone_stylus", name: "Bone Stylus", type: "equipment", slot: "weapon", mod: { wits: 1 }, damage: 1, value: 38, desc: "A writing tool that leaves marks on more than paper." },
    { id: "stormneedle_rapier", name: "Stormneedle Rapier", type: "equipment", slot: "weapon", mod: { finesse: 1, resolve: 1 }, damage: 1, value: 50, desc: "A flexible blade that tastes of rain." },
    { id: "ash_mantle", name: "Ash Mantle", type: "equipment", slot: "armor", armor: 2, mod: { resolve: 1 }, value: 40, desc: "A gray mantle quilted with oath-thread." },
    { id: "bark_mail", name: "Bark Mail", type: "equipment", slot: "armor", armor: 1, mod: { spirit: 1 }, value: 36, desc: "Living bark plates that bend like leather." },
    { id: "glassguard_cuirass", name: "Glassguard Cuirass", type: "equipment", slot: "armor", armor: 3, mod: {}, value: 62, desc: "Transparent black plates over old bronze." },
    { id: "pilgrim_vest", name: "Pilgrim Vest", type: "equipment", slot: "armor", armor: 1, mod: { spirit: 1 }, value: 30, desc: "Many pockets, each smelling faintly of clean smoke." },
    { id: "blackthread_coat", name: "Blackthread Coat", type: "equipment", slot: "armor", armor: 1, mod: { guile: 1 }, value: 44, desc: "Dark cloth sewn to swallow lamplight." },
    { id: "brass_splint", name: "Brass Splint Harness", type: "equipment", slot: "armor", armor: 2, mod: { wits: 1 }, value: 52, desc: "Clocktower braces repurposed as armor." },
    { id: "oath_bead", name: "Oath Bead", type: "equipment", slot: "charm", mod: { resolve: 1 }, value: 28, desc: "Warm when a promise is kept." },
    { id: "moth_lantern", name: "Moth Lantern", type: "equipment", slot: "charm", mod: { wits: 1 }, value: 33, desc: "Its flame leans toward hidden doors." },
    { id: "quiet_ring", name: "Quiet Ring", type: "equipment", slot: "charm", mod: { spirit: 1 }, value: 30, desc: "A funeral band that muffles panic." },
    { id: "ledger_pin", name: "Ledger Pin", type: "equipment", slot: "charm", mod: { guile: 1 }, value: 30, desc: "The Gloam Compact uses it to mark silent partners." },
    { id: "weather_vane_charm", name: "Weather-Vane Charm", type: "equipment", slot: "charm", mod: { finesse: 1 }, value: 29, desc: "Always points toward the next argument." },
    { id: "heart_shard", name: "Heart-Cinder Shard", type: "equipment", slot: "charm", mod: { might: 1, spirit: 1 }, value: 0, desc: "A living ember. It dreams against your palm." },
    { id: "healing_draught", name: "Healing Draught", type: "consumable", heal: 12, value: 18, desc: "Restores 12 health to the most wounded party member." },
    { id: "greater_draught", name: "Greater Healing Draught", type: "consumable", heal: 24, value: 40, desc: "Restores 24 health to the most wounded party member." },
    { id: "ash_salve", name: "Ash Salve", type: "consumable", heal: 8, remove: "burning", value: 14, desc: "Soothes burns and closes shallow cuts." },
    { id: "bramble_bomb", name: "Bramble Bomb", type: "consumable", prep: "bramble", value: 22, desc: "Prepare it to root the first enemy you strike next battle." },
    { id: "ember_flask", name: "Ember Flask", type: "consumable", prep: "ember", value: 24, desc: "Prepare it to add burning to your next damaging hit." },
    { id: "reed_smoke", name: "Reed Smoke", type: "consumable", prep: "guarded", value: 18, desc: "Prepare smoke to guard the party at the start of next battle." },
    { id: "focus_tea", name: "Focus Tea", type: "consumable", buff: { wits: 1 }, value: 12, desc: "Adds a temporary Wits edge until the next rest." },
    { id: "courage_tincture", name: "Courage Tincture", type: "consumable", buff: { resolve: 1 }, value: 12, desc: "Adds a temporary Resolve edge until the next rest." },
    { id: "cleanse_salt", name: "Cleanse Salt", type: "consumable", remove: "poisoned", value: 10, desc: "Clears poison from the party." },
    { id: "thunder_jar", name: "Thunder Jar", type: "consumable", prep: "shocked", value: 26, desc: "Prepare it to shock the first enemy you strike next battle." },
    { id: "root_poultice", name: "Root Poultice", type: "consumable", heal: 10, remove: "rooted", value: 13, desc: "Heals and frees cramped joints." },
    { id: "moonwater_vial", name: "Moonwater Vial", type: "consumable", heal: 16, value: 25, desc: "Cold silver water used by grave choirs." },
    { id: "covenant_shard", name: "Covenant Shard", type: "quest", value: 0, desc: "A shard of the Heart-Cinder that remembers your touch." },
    { id: "glassreef_bell", name: "Glassreef Bell", type: "quest", value: 0, desc: "A cracked bell able to call drowned witnesses." },
    { id: "gloam_ledger", name: "Gloam Ledger", type: "quest", value: 0, desc: "A coded account of betrayals, bribes, and rescues." },
    { id: "quiet_clapper", name: "Quiet Bell Clapper", type: "quest", value: 0, desc: "Oryn says it rings only for the dead who are ready." },
    { id: "veyr_signet", name: "Veyr Signet", type: "quest", value: 0, desc: "A signet from a house erased from public stones." },
    { id: "seed_reliquary", name: "Seed Reliquary", type: "quest", value: 0, desc: "A living seed sealed in transparent resin." },
    { id: "concord_writ", name: "Concord Writ", type: "quest", value: 0, desc: "A lawful order whose seal has been burned and restored." },
    { id: "compact_cipher", name: "Compact Cipher", type: "quest", value: 0, desc: "A rotating cipher wheel with nine false alphabets." },
    { id: "star_map", name: "Starless Map", type: "quest", value: 0, desc: "A city map drawn by people who never saw the sky." },
    { id: "last_weather_vane", name: "Last Weather-Vane", type: "quest", value: 0, desc: "A little brass vane that points at approaching endings." },
    { id: "charred_lullaby", name: "Charred Lullaby", type: "curio", value: 8, lore: "lullaby", desc: "A child's song burned into thin cedar." },
    { id: "brass_saint_icon", name: "Brass Saint Icon", type: "curio", value: 14, lore: "brass_saints", desc: "A clockwork saint with one hand missing." },
    { id: "mirror_seed", name: "Mirror Seed", type: "curio", value: 16, lore: "mirror_seed", desc: "It shows the tree it might have been." },
    { id: "faceless_coin", name: "Faceless Coin", type: "curio", value: 5, lore: "gloam_compact", desc: "Currency of a market that officially never opens." },
    { id: "old_map_tile", name: "Old Map Tile", type: "curio", value: 9, lore: "blackglass", desc: "A ceramic city tile from before the ash." },
    { id: "salt_rook", name: "Salt-Carved Rook", type: "curio", value: 7, lore: "saltroad", desc: "A game piece carved during a siege." },
    { id: "silver_reed", name: "Silver Reed", type: "curio", value: 11, lore: "wyrdroot", desc: "A reed that chimes when lies are nearby." },
    { id: "blackglass_die", name: "Blackglass Die", type: "curio", value: 13, lore: "heart_cinder", desc: "No matter how it lands, one face remains warm." }
  ];

  const companions = {
    nyra: {
      id: "nyra",
      name: "Nyra Vale",
      role: "Oath deserter",
      stats: { might: 14, finesse: 11, wits: 10, spirit: 10, guile: 9, resolve: 15 },
      hp: 34,
      armor: 2,
      abilities: ["strike", "oath_guard", "ember_cleave"],
      personality: "Blunt, protective, allergic to easy heroics.",
      secret: "She broke a lawful retreat to save refugees, leaving her squad to die in the ash.",
      quest: "c01",
      campScene: "camp_nyra",
      likes: "Keeping promises, protecting refugees, refusing cruelty.",
      dislikes: "Selling people out, swaggering about noble blood.",
      epilogues: {
        high: "Nyra rebuilt the broken oath companies into shield circles sworn to villages instead of thrones.",
        mid: "Nyra kept traveling, still hard to love and harder to break, with your name carved inside her shield.",
        low: "Nyra left before dawn, returning to the ash roads where no one could ask her to forgive herself."
      }
    },
    pell: {
      id: "pell",
      name: "Pell Cindermoth",
      role: "Alchemist",
      stats: { might: 8, finesse: 12, wits: 15, spirit: 11, guile: 13, resolve: 9 },
      hp: 26,
      armor: 1,
      abilities: ["strike", "bright_flask", "tripwire"],
      personality: "Funny, brilliant, and one accident away from sainthood or disaster.",
      secret: "A living cinder parasite in Pell's lung burns hotter whenever lies are told nearby.",
      quest: "c02",
      campScene: "camp_pell",
      likes: "Mercy, curiosity, letting strange things live long enough to explain themselves.",
      dislikes: "Purges, closed books, people who say alchemy is just soup with ambition.",
      epilogues: {
        high: "Pell founded a clinic-laboratory where dangerous miracles had labels, locks, and friends.",
        mid: "Pell survived, mostly, and mailed you bottles that glowed when shaken and apologized when opened.",
        low: "Pell vanished into a chain of small explosions and unsigned medical pamphlets."
      }
    },
    sable: {
      id: "sable",
      name: "Sable Renn",
      role: "Information broker",
      stats: { might: 9, finesse: 14, wits: 13, spirit: 9, guile: 16, resolve: 10 },
      hp: 28,
      armor: 1,
      abilities: ["strike", "shadow_cut", "glass_shot"],
      personality: "Dry, watchful, loyal in ways that look suspicious from a distance.",
      secret: "Sable is heir to the Gloam ledger and can ruin half the Compact by opening one book.",
      quest: "c03",
      campScene: "camp_sable",
      likes: "Clever bargains, helping the powerless quietly, refusing obvious traps.",
      dislikes: "Naive honesty that gets people killed, public speeches, unpaid debts.",
      epilogues: {
        high: "Sable turned the old ledger into a public court of debts and made blackmail unfashionable for a generation.",
        mid: "Sable kept one copy of every secret and one chair empty for you in the safest unsafe room in Blackglass.",
        low: "Sable sold three truths, bought a ship, and left you a note that may have been a warning or a joke."
      }
    },
    oryn: {
      id: "oryn",
      name: "Brother Oryn",
      role: "Doubting healer",
      stats: { might: 10, finesse: 9, wits: 12, spirit: 16, guile: 9, resolve: 13 },
      hp: 30,
      armor: 1,
      abilities: ["strike", "hymn_mend", "quiet_bell"],
      personality: "Gentle, stubborn, and quietly furious at institutions that confuse pain for proof.",
      secret: "The dead speak to him because he once refused to send one soul onward.",
      quest: "c04",
      campScene: "camp_oryn",
      likes: "Mercy with a spine, honest grief, letting the dead be more than tools.",
      dislikes: "Desecration, cynical cruelty, jokes at funerals before the family laughs first.",
      epilogues: {
        high: "Oryn made the Quiet Bell a rite of consent between living cities and their dead.",
        mid: "Oryn kept healing, blessing no banners, and listening only when the dead asked kindly.",
        low: "Oryn returned to his order and never again admitted when a corpse spoke your name."
      }
    },
    vex: {
      id: "vex",
      name: "Vex Ardent",
      role: "Disgraced duelist",
      stats: { might: 11, finesse: 16, wits: 11, spirit: 9, guile: 12, resolve: 14 },
      hp: 31,
      armor: 1,
      abilities: ["strike", "duelist_mark", "lightning_lunge"],
      personality: "Elegant, wounded, brave at exactly the wrong times.",
      secret: "Vex carries the true name of the first family that bound the Heart-Cinder.",
      quest: "c05",
      campScene: "camp_vex",
      likes: "Courage, style, refusing inherited shame.",
      dislikes: "Cowardice dressed as strategy, cruelty to defeated foes.",
      epilogues: {
        high: "Vex retired the Ardent name in public and used it privately only for letters to people worth trusting.",
        mid: "Vex became a blade instructor whose first lesson was always how to walk away.",
        low: "Vex won three famous duels and lost every quiet chance to become someone else."
      }
    }
  };

  const factions = {
    concord: { id: "concord", name: "Ashen Concord", goal: "Seal the Heart-Cinder under law and wardenship.", color: "warn" },
    synod: { id: "synod", name: "Verdant Synod", goal: "Break the ash cycle and let root and rain reclaim the realm.", color: "good" },
    compact: { id: "compact", name: "Gloam Compact", goal: "Keep power decentralized so free cities can survive.", color: "" }
  };

  const quests = {
    m01: { id: "m01", type: "Main", act: 1, title: "The Falling Ember", desc: "A living shard fell at Cinderfall Coast and answered your blood." },
    m02: { id: "m02", type: "Main", act: 1, title: "Witnesses at Cinderfall", desc: "Find who saw the shard fall and why three factions are hunting it." },
    m03: { id: "m03", type: "Main", act: 2, title: "Roads Through the Fen", desc: "Cross Wyrdroot Fen before the roads drown and the factions harden." },
    m04: { id: "m04", type: "Main", act: 2, title: "The Three Claims", desc: "Hear the Concord, Synod, and Compact claims over the Heart-Cinder." },
    m05: { id: "m05", type: "Main", act: 3, title: "Blackglass Opens", desc: "Enter the ruined capital and reach the Heart-Cinder chamber." },
    m06: { id: "m06", type: "Main", act: 3, title: "The Covenant Choice", desc: "Decide what the Heart-Cinder will become." },
    c01: { id: "c01", type: "Companion", act: 1, title: "Ashes Owed", desc: "Nyra needs proof that saving refugees was not treason by another name." },
    c02: { id: "c02", type: "Companion", act: 1, title: "The Moth in the Flask", desc: "Pell's living cinder parasite is changing faster than expected." },
    c03: { id: "c03", type: "Companion", act: 2, title: "Debts in Blackglass", desc: "Sable's ledger could free people or crown a new tyrant of secrets." },
    c04: { id: "c04", type: "Companion", act: 3, title: "The Quiet Bell", desc: "Oryn must learn whether the dead want release, rule, or revenge." },
    c05: { id: "c05", type: "Companion", act: 3, title: "The Name Beneath the Blade", desc: "Vex carries a family name that can open or doom the final chamber." },
    s01: { id: "s01", type: "Side", act: 1, title: "Salt for the Refugees", desc: "A stockade needs salt, medicine, and someone willing to shame hoarders." },
    s02: { id: "s02", type: "Side", act: 1, title: "The Glassreef Bell", desc: "A drowned bell can call witnesses from the surf." },
    s03: { id: "s03", type: "Side", act: 2, title: "A Garden That Remembers", desc: "A living garden stores memories of those who died under ash." },
    s04: { id: "s04", type: "Side", act: 2, title: "Ledger of Little Treasons", desc: "A ledger can expose tyrants or endanger everyone who trusted Sable." },
    s05: { id: "s05", type: "Side", act: 2, title: "The Last Weather-Vane", desc: "A brass vane can predict which road into Blackglass still exists." }
  };

  const lore = {
    heart_cinder: { title: "Heart-Cinder", text: "A living ember beneath Blackglass that stores oaths, deaths, and the heat of every broken promise." },
    ash_memory: { title: "Ash Memory", text: "In Veyr, ash can preserve memories so strongly that touching it can change a life." },
    concord: { title: "Ashen Concord", text: "A martial order born after the first ashfall, convinced that survival requires law with teeth." },
    synod: { title: "Verdant Synod", text: "Root-seers who believe the ash age must end, even if old cities become soil." },
    gloam_compact: { title: "Gloam Compact", text: "A hidden civic network of smugglers, printers, nurses, and spies who distrust all crowns." },
    cinderfall: { title: "Cinderfall Coast", text: "A coastline of hot gray beaches where glass reefs sing during storms." },
    wyrdroot: { title: "Wyrdroot Fen", text: "A flooded green maze where roots grow through memories as easily as mud." },
    blackglass: { title: "Blackglass Citadel", text: "The broken capital of Veyr, glazed by ancient heat into reflective black stone." },
    brass_saints: { title: "Brass Saints", text: "Clockwork martyrs built to remember civic laws after every library burned." },
    mirror_seed: { title: "Mirror Seeds", text: "Verdant relics that show possible forests, possible graves, and possible forgiveness." },
    saltroad: { title: "Saltroad Custom", text: "Saltroad envoys settle disputes by sharing salt before either side draws steel." },
    lullaby: { title: "Charred Lullaby", text: "The lullaby names stars no living child in Blackglass has seen." },
    nyra_secret: { title: "Nyra's Broken Retreat", text: "Nyra disobeyed orders to save refugees. The Concord called it treason; the refugees called it sunrise." },
    pell_secret: { title: "Pell's Cinder Moth", text: "The parasite in Pell's lung may be a newborn oath-spirit, not a disease." },
    sable_secret: { title: "The Renn Ledger", text: "Sable's ledger records every powerful person who bought safety with someone else's suffering." },
    oryn_secret: { title: "The Dead Who Ask", text: "Oryn is not haunted by ghosts. He is haunted by consent." },
    vex_secret: { title: "The Ardent Name", text: "The Ardent line first bound the Heart-Cinder and then spent centuries pretending it had not." }
  };

  const enemies = {
    ash_husk: { id: "ash_husk", name: "Ash Husk", hp: 16, armor: 0, stats: { might: 12, finesse: 8, wits: 6, spirit: 8, guile: 6, resolve: 10 }, abilities: ["claw"], loot: ["ash_salve"] },
    cinder_wolf: { id: "cinder_wolf", name: "Cinder Wolf", hp: 18, armor: 0, stats: { might: 12, finesse: 14, wits: 6, spirit: 8, guile: 8, resolve: 9 }, abilities: ["claw", "ash_spit"], loot: ["ember_flask"] },
    reed_stalker: { id: "reed_stalker", name: "Reed Stalker", hp: 20, armor: 1, stats: { might: 10, finesse: 14, wits: 10, spirit: 10, guile: 12, resolve: 9 }, abilities: ["claw"], loot: ["root_poultice"] },
    glass_cultist: { id: "glass_cultist", name: "Glass Cultist", hp: 22, armor: 1, stats: { might: 9, finesse: 12, wits: 12, spirit: 13, guile: 10, resolve: 11 }, abilities: ["ash_spit", "wisp_lash"], loot: ["blackglass_die"] },
    concord_pike: { id: "concord_pike", name: "Concord Pike", hp: 24, armor: 2, stats: { might: 13, finesse: 10, wits: 10, spirit: 9, guile: 8, resolve: 13 }, abilities: ["pike_drive"], loot: ["concord_writ"] },
    synod_briarwitch: { id: "synod_briarwitch", name: "Synod Briarwitch", hp: 24, armor: 1, stats: { might: 8, finesse: 10, wits: 13, spirit: 15, guile: 11, resolve: 12 }, abilities: ["bramble_hex", "wisp_lash"], loot: ["mirror_seed"] },
    gloam_cutpurse: { id: "gloam_cutpurse", name: "Gloam Cutpurse", hp: 20, armor: 1, stats: { might: 9, finesse: 15, wits: 12, spirit: 8, guile: 15, resolve: 9 }, abilities: ["claw", "glass_shot"], loot: ["faceless_coin"] },
    blackglass_sentinel: { id: "blackglass_sentinel", name: "Blackglass Sentinel", hp: 30, armor: 3, stats: { might: 15, finesse: 9, wits: 10, spirit: 12, guile: 6, resolve: 15 }, abilities: ["pike_drive", "ash_spit"], loot: ["old_map_tile"] },
    mourning_wisp: { id: "mourning_wisp", name: "Mourning Wisp", hp: 18, armor: 0, stats: { might: 6, finesse: 14, wits: 12, spirit: 15, guile: 10, resolve: 8 }, abilities: ["wisp_lash"], loot: ["moonwater_vial"] },
    ember_drakelet: { id: "ember_drakelet", name: "Ember Drakelet", hp: 32, armor: 2, stats: { might: 15, finesse: 12, wits: 8, spirit: 13, guile: 7, resolve: 14 }, abilities: ["claw", "ash_spit"], loot: ["heart_shard"] },
    oathbound_captain: { id: "oathbound_captain", name: "Oathbound Captain", hp: 38, armor: 3, stats: { might: 15, finesse: 12, wits: 12, spirit: 10, guile: 10, resolve: 16 }, abilities: ["pike_drive", "guarded_strike"], loot: ["glassguard_cuirass"] },
    heart_avatar: { id: "heart_avatar", name: "Heart-Cinder Avatar", hp: 54, armor: 2, stats: { might: 16, finesse: 12, wits: 14, spirit: 18, guile: 12, resolve: 18 }, abilities: ["avatar_flare", "wisp_lash", "claw"], loot: ["heart_shard"] }
  };

  const encounters = {
    beach_raid: { id: "beach_raid", name: "Ash Beach Raid", terrain: "coast", enemies: ["ash_husk", "cinder_wolf"], loot: ["healing_draught", "oath_bead"], xp: 4, winFlags: ["beach_raid_won"], quest: { id: "m01", status: "completed", stage: "You survived the first hunt for the shard." } },
    glassreef: { id: "glassreef", name: "Glassreef Ambush", terrain: "reef", enemies: ["cinder_wolf", "glass_cultist", "mourning_wisp"], loot: ["glassreef_bell", "reefglass_bow"], xp: 6, winFlags: ["glassreef_cleared"], quest: { id: "s02", status: "completed", stage: "The drowned bell is yours." } },
    fen_ambush: { id: "fen_ambush", name: "Drowned Road Ambush", terrain: "fen", enemies: ["reed_stalker", "reed_stalker", "synod_briarwitch"], loot: ["seed_reliquary", "root_poultice"], xp: 7, winFlags: ["drowned_road_safe"], quest: { id: "m03", status: "active", stage: "The fen road is open enough to risk the tribunal." } },
    ledger_knives: { id: "ledger_knives", name: "Ledger Knives", terrain: "market", enemies: ["gloam_cutpurse", "gloam_cutpurse", "glass_cultist"], loot: ["gloam_ledger", "ledger_pin"], xp: 7, winFlags: ["ledger_taken"], quest: { id: "s04", status: "completed", stage: "The ledger is no longer in hostile hands." } },
    concord_gate: { id: "concord_gate", name: "Concord Gate Trial", terrain: "citadel", enemies: ["concord_pike", "concord_pike", "oathbound_captain"], loot: ["concord_writ", "glassguard_cuirass"], xp: 9, winFlags: ["concord_gate_cleared"], quest: { id: "m05", status: "active", stage: "The Blackglass gate has opened by force." } },
    skybridge: { id: "skybridge", name: "Skybridge Sentinels", terrain: "citadel", enemies: ["blackglass_sentinel", "mourning_wisp", "ember_drakelet"], loot: ["veyr_signet", "greater_draught"], xp: 10, winFlags: ["skybridge_cleared"], quest: { id: "m05", status: "active", stage: "The way to the Heart-Cinder is clear." } },
    final_avatar: { id: "final_avatar", name: "Heart-Cinder Avatar", terrain: "heart", enemies: ["heart_avatar", "mourning_wisp", "blackglass_sentinel"], loot: ["heart_shard"], xp: 12, winFlags: ["avatar_defeated"], quest: { id: "m06", status: "active", stage: "The Heart-Cinder is listening." } }
  };

  const regions = {
    cinderfall: {
      id: "cinderfall",
      name: "Cinderfall Coast",
      act: 1,
      desc: "Hot ash beaches, refugee fires, glass reefs, and the first lies about the shard.",
      lore: "cinderfall",
      locations: ["ash_beach", "refugee_stockade", "salt_market", "concord_picket", "glassreef_bell", "lighthouse_watch"]
    },
    wyrdroot: {
      id: "wyrdroot",
      name: "Wyrdroot Fen",
      act: 2,
      desc: "Flooded roads and green courts where roots remember crimes better than judges do.",
      lore: "wyrdroot",
      locations: ["fen_crossing", "reed_village", "fungus_garden", "drowned_road", "root_tribunal", "weather_vane"]
    },
    blackglass: {
      id: "blackglass",
      name: "Blackglass Citadel",
      act: 3,
      desc: "A ruined capital made reflective by ancient fire, full of locked names and listening ash.",
      lore: "blackglass",
      locations: ["blackglass_gate", "compact_den", "choir_vault", "skybridge", "ardent_gallery", "heart_chamber"]
    }
  };

  const locations = {
    ash_beach: { id: "ash_beach", region: "cinderfall", name: "Ash Beach", scene: "intro_ash_beach", encounter: "beach_raid", desc: "A fresh crater steams at the tideline. The shard is still singing." },
    refugee_stockade: { id: "refugee_stockade", region: "cinderfall", name: "Refugee Stockade", scene: "refugee_stockade", desc: "Families crowd behind patched palisades and watch faction banners approach." },
    salt_market: { id: "salt_market", region: "cinderfall", name: "Salt Market", scene: "salt_market", desc: "A market of medicine, salt, rumors, and prices that rise when people suffer." },
    concord_picket: { id: "concord_picket", region: "cinderfall", name: "Concord Picket", scene: "concord_picket", desc: "Ashen Concord soldiers count arrows, refugees, and excuses." },
    glassreef_bell: { id: "glassreef_bell", region: "cinderfall", name: "Glassreef Bell", scene: "glassreef_bell_scene", encounter: "glassreef", desc: "The drowned bell waits under surf that cuts like a knife." },
    lighthouse_watch: { id: "lighthouse_watch", region: "cinderfall", name: "Lighthouse Watch", scene: "lighthouse_watch", desc: "An old lens points inland, where no lighthouse should look." },
    fen_crossing: { id: "fen_crossing", region: "wyrdroot", name: "Fen Crossing", scene: "fen_crossing", desc: "The road sinks politely while asking for your boots." },
    reed_village: { id: "reed_village", region: "wyrdroot", name: "Reed Village", scene: "reed_village", desc: "Homes on stilts lean together like people sharing a secret." },
    fungus_garden: { id: "fungus_garden", region: "wyrdroot", name: "Memory Garden", scene: "fungus_garden", desc: "Huge pale caps glow with remembered last words." },
    drowned_road: { id: "drowned_road", region: "wyrdroot", name: "Drowned Road", scene: "drowned_road", encounter: "fen_ambush", desc: "A road appears only when the water agrees with your destination." },
    root_tribunal: { id: "root_tribunal", region: "wyrdroot", name: "Root Tribunal", scene: "root_tribunal", desc: "Synod judges sit among roots braided through old skulls." },
    weather_vane: { id: "weather_vane", region: "wyrdroot", name: "Last Weather-Vane", scene: "weather_vane", desc: "A brass vane spins without wind at the roof of a drowned chapel." },
    blackglass_gate: { id: "blackglass_gate", region: "blackglass", name: "Gate of Shards", scene: "blackglass_gate", encounter: "concord_gate", desc: "The gate reflects the person you almost became." },
    compact_den: { id: "compact_den", region: "blackglass", name: "Compact Den", scene: "compact_den", encounter: "ledger_knives", desc: "A hidden civic room under a collapsed counting house." },
    choir_vault: { id: "choir_vault", region: "blackglass", name: "Choir Vault", scene: "choir_vault", desc: "A vault where the dead kept minutes no living council wanted recorded." },
    skybridge: { id: "skybridge", region: "blackglass", name: "Skybridge", scene: "skybridge_scene", encounter: "skybridge", desc: "A blackglass bridge arcs through open air and old accusations." },
    ardent_gallery: { id: "ardent_gallery", region: "blackglass", name: "Ardent Gallery", scene: "ardent_gallery", desc: "Portraits have been scratched blank except for the eyes." },
    heart_chamber: { id: "heart_chamber", region: "blackglass", name: "Heart-Cinder Chamber", scene: "heart_chamber", encounter: "final_avatar", desc: "The living ember waits beneath the city like a second sunrise." }
  };

  const worldLayouts = {
    cinderfall: {
      tone: "coast",
      paths: [["ash_beach", "refugee_stockade"], ["refugee_stockade", "salt_market"], ["refugee_stockade", "concord_picket"], ["ash_beach", "glassreef_bell"], ["glassreef_bell", "lighthouse_watch"], ["concord_picket", "lighthouse_watch"]],
      points: {
        ash_beach: { x: 17, y: 62, icon: "crater" },
        refugee_stockade: { x: 37, y: 45, icon: "palisade" },
        salt_market: { x: 59, y: 58, icon: "market" },
        concord_picket: { x: 58, y: 29, icon: "banner" },
        glassreef_bell: { x: 31, y: 78, icon: "bell" },
        lighthouse_watch: { x: 78, y: 38, icon: "lens" }
      }
    },
    wyrdroot: {
      tone: "fen",
      paths: [["fen_crossing", "reed_village"], ["reed_village", "fungus_garden"], ["reed_village", "drowned_road"], ["drowned_road", "root_tribunal"], ["fungus_garden", "root_tribunal"], ["root_tribunal", "weather_vane"]],
      points: {
        fen_crossing: { x: 12, y: 61, icon: "stones" },
        reed_village: { x: 31, y: 42, icon: "huts" },
        fungus_garden: { x: 49, y: 68, icon: "spores" },
        drowned_road: { x: 55, y: 34, icon: "road" },
        root_tribunal: { x: 72, y: 53, icon: "roots" },
        weather_vane: { x: 84, y: 24, icon: "vane" }
      }
    },
    blackglass: {
      tone: "citadel",
      paths: [["blackglass_gate", "compact_den"], ["compact_den", "choir_vault"], ["choir_vault", "skybridge"], ["skybridge", "ardent_gallery"], ["ardent_gallery", "heart_chamber"], ["skybridge", "heart_chamber"]],
      points: {
        blackglass_gate: { x: 11, y: 50, icon: "gate" },
        compact_den: { x: 29, y: 70, icon: "press" },
        choir_vault: { x: 44, y: 41, icon: "choir" },
        skybridge: { x: 62, y: 30, icon: "bridge" },
        ardent_gallery: { x: 72, y: 62, icon: "blade" },
        heart_chamber: { x: 88, y: 46, icon: "heart" }
      }
    }
  };

  const dialogues = {
    intro_ash_beach: {
      id: "intro_ash_beach",
      title: "The Falling Ember",
      speaker: "The Shard",
      nodes: {
        start: {
          text: "The crater breathes heat. A shard no bigger than your thumb floats above black sand, turning in place like an eye. When you reach for it, every oath you ever broke whispers at once.",
          choices: [
            { label: "Take the shard and listen.", next: "listen", effects: [{ addItem: "covenant_shard" }, { addItem: "heart_shard" }, { lore: "heart_cinder" }, { lore: "ash_memory" }, { quest: { id: "m01", status: "active", stage: "The shard chose you on Cinderfall Coast." } }, { flag: "took_shard" }, { corruption: 1 }] },
            { label: "Study the ash pattern first. [Wits DC 12]", check: { attr: "wits", dc: 12, success: "pattern_success", failure: "pattern_fail", successEffects: [{ lore: "ash_memory" }, { flag: "read_ash_pattern" }, { xp: 1 }], failureEffects: [{ flag: "ash_pattern_misread" }, { corruption: 1 }] } },
            { label: "Call out for survivors.", next: "nyra_arrives", effects: [{ flag: "called_survivors" }] }
          ]
        },
        listen: {
          text: "The shard touches your palm and becomes a pulse under your skin. Far inland, a ruined city answers. Nearer, something dead pulls itself out of the surf.",
          choices: [
            { label: "Hold the beach and fight.", close: true, effects: [{ startCombat: "beach_raid" }] },
            { label: "Search for allies before the dead arrive.", next: "nyra_arrives" },
            { label: "Retreat toward the stockade.", close: true, effects: [{ location: "refugee_stockade" }, { quest: { id: "m02", status: "active", stage: "The stockade may know who else saw the fall." } }] }
          ]
        },
        pattern_success: {
          text: "The ash is not random. It maps a covenant: three claimants, one ember, six possible silences. You see enough to know the shard is a key, not a prize.",
          choices: [
            { label: "Take the shard now.", next: "listen", effects: [{ addItem: "covenant_shard" }, { addItem: "heart_shard" }, { quest: { id: "m01", status: "active", stage: "You learned the shard is a key to Blackglass." } }, { flag: "took_shard" }] },
            { label: "Mark the pattern in your journal.", close: true, effects: [{ quest: { id: "m02", status: "active", stage: "Three factions are converging on the shard." } }, { location: "refugee_stockade" }] }
          ]
        },
        pattern_fail: {
          text: "The pattern writhes into a memory that is not yours: a city kneeling in orange light. You stumble back with ash under your tongue.",
          choices: [
            { label: "Grab the shard before the vision worsens.", next: "listen", effects: [{ addItem: "covenant_shard" }, { addItem: "heart_shard" }, { quest: { id: "m01", status: "active", stage: "The shard burned a vision into you." } }, { flag: "took_shard" }] },
            { label: "Run for help.", close: true, effects: [{ location: "refugee_stockade" }, { quest: { id: "m02", status: "active", stage: "The shard's vision points toward witnesses at the stockade." } }] }
          ]
        },
        nyra_arrives: {
          text: "A woman in a split Concord cloak slides down the dune, shield first. 'If that thing chose you, congratulations. Every banner on this coast is about to become your problem.'",
          choices: [
            { label: "Ask her name and offer a place beside you.", next: "nyra_recruit" },
            { label: "Ask what the Concord wants.", next: "concord_warning", effects: [{ lore: "concord" }] },
            { label: "Tell her to protect the refugees while you draw the dead away.", close: true, effects: [{ approval: { nyra: 2 } }, { faction: { concord: -1 } }, { startCombat: "beach_raid" }] }
          ]
        },
        concord_warning: {
          text: "'They want every dangerous miracle sealed, numbered, and guarded by people like I used to be. Sometimes they are right. That is the worst part.'",
          choices: [
            { label: "Then help me keep it from all of them.", next: "nyra_recruit" },
            { label: "I will hear the Concord before judging.", close: true, effects: [{ faction: { concord: 1 } }, { location: "concord_picket" }, { quest: { id: "m02", status: "active", stage: "The Concord picket wants the shard." } }] }
          ]
        },
        nyra_recruit: {
          text: "'Nyra Vale. Deserter, depending who asks. Shield, if you ask someone I saved.' She offers a scarred hand. 'I can walk with you until you make me regret it.'",
          choices: [
            { label: "Recruit Nyra.", close: true, effects: [{ recruit: "nyra" }, { approval: { nyra: 3 } }, { quest: { id: "c01", status: "active", stage: "Nyra wants proof that her broken retreat saved lives." } }, { quest: { id: "m02", status: "active", stage: "Find the coast witnesses before the factions do." } }, { location: "refugee_stockade" }] },
            { label: "Not yet. Meet me at camp if you change your mind.", close: true, effects: [{ flag: "nyra_waits" }, { quest: { id: "m02", status: "active", stage: "Nyra waits near the refugee road." } }] }
          ]
        }
      }
    },
    refugee_stockade: {
      id: "refugee_stockade",
      title: "Witnesses at the Stockade",
      speaker: "Mara of the Palisade",
      nodes: {
        start: {
          text: "Inside the stockade, refugees divide soup with a jeweler's precision. Mara, the quartermaster, points at your ash-stained sleeve. 'If you brought danger, bring salt too.'",
          choices: [
            { label: "Promise to secure salt and medicine.", next: "salt_need", effects: [{ quest: { id: "s01", status: "active", stage: "The stockade needs salt and medicine from the market." } }, { approval: { nyra: 1 } }] },
            { label: "Ask who saw the falling ember.", next: "witness_check" },
            { label: "Rally the scared families. [Spirit DC 13]", check: { attr: "spirit", dc: 13, success: "rally_success", failure: "rally_fail", successEffects: [{ faction: { concord: -1, compact: 1 } }, { approval: { nyra: 2, oryn: 1 } }, { flag: "stockade_rallied" }, { xp: 1 }], failureEffects: [{ flag: "stockade_panic" }, { faction: { concord: 1 } }] } }
          ]
        },
        salt_need: {
          text: "'Salt keeps wounds honest,' Mara says. 'Medicine keeps children breathing. The Salt Market has both and a conscience shortage.'",
          choices: [
            { label: "Go to the Salt Market.", close: true, effects: [{ location: "salt_market" }] },
            { label: "Give what supplies you can spare.", close: true, effects: [{ supplies: -1 }, { faction: { compact: 1 } }, { approval: { nyra: 1 } }, { quest: { id: "s01", status: "active", stage: "You shared supplies, but the stockade still needs more." } }] }
          ]
        },
        witness_check: {
          text: "Mara names three witnesses: a bell-diver at the reef, a Concord scribe, and a lighthouse keeper who has not slept in four days.",
          choices: [
            { label: "Mark the three witnesses.", close: true, effects: [{ flag: "cinderfall_witnesses_named" }, { quest: { id: "m02", status: "active", stage: "Question the reef, Concord picket, and lighthouse witnesses." } }, { location: "glassreef_bell" }] },
            { label: "Ask why she trusts you.", next: "trust" }
          ]
        },
        trust: {
          text: "'I do not. But you asked before taking. We are thin on miracles, so I am counting that.'",
          choices: [
            { label: "That will have to be enough.", close: true, effects: [{ approval: { nyra: 1 } }, { quest: { id: "m02", status: "active", stage: "The stockade gave you three leads." } }] }
          ]
        },
        rally_success: {
          text: "You speak of warm food, watch rotations, and small brave tasks. Fear does not vanish, but it stands up straighter.",
          choices: [
            { label: "Ask for witnesses now that they trust you.", next: "witness_check" }
          ]
        },
        rally_fail: {
          text: "Your words land badly. A child starts crying, then an old man, then half the south wall. Mara grimaces. 'Less speech. More salt.'",
          choices: [
            { label: "Take the practical advice.", close: true, effects: [{ location: "salt_market" }, { quest: { id: "s01", status: "active", stage: "The stockade needs salt after your failed rally." } }] }
          ]
        }
      }
    },
    salt_market: {
      id: "salt_market",
      title: "Salt and Glass",
      speaker: "Pell Cindermoth",
      nodes: {
        start: {
          text: "The Salt Market smells of brine, burned sugar, and panic. A small alchemist stands on a crate arguing with three merchants and a smoking backpack.",
          choices: [
            { label: "Back the alchemist's demand for fair prices. [Resolve DC 12]", check: { attr: "resolve", dc: 12, success: "fair_success", failure: "fair_fail", successEffects: [{ faction: { compact: 1 } }, { approval: { nyra: 1, pell: 2 } }, { addItem: "healing_draught", qty: 2 }, { flag: "market_fair_prices" }, { quest: { id: "s01", status: "completed", stage: "The market released salt and medicine to the refugees." } }], failureEffects: [{ gold: -8 }, { addItem: "healing_draught" }, { flag: "market_paid_too_much" }] } },
            { label: "Ask the alchemist why the backpack is smoking.", next: "pell_intro" },
            { label: "Buy practical supplies.", close: true, effects: [{ gold: -10 }, { supplies: 2 }, { addItem: "ash_salve" }, { quest: { id: "s01", status: "active", stage: "You bought some stockade supplies." } }] }
          ]
        },
        fair_success: {
          text: "You make greed sound embarrassing. The merchants discover civic virtue at knife-point distance from public shame. The alchemist beams at you through soot.",
          choices: [
            { label: "Invite the alchemist to join your road.", next: "pell_recruit" },
            { label: "Send the supplies to the stockade.", close: true, effects: [{ location: "refugee_stockade" }] }
          ]
        },
        fair_fail: {
          text: "The merchants smell your urgency and raise prices with the solemnity of priests. The alchemist kicks the crate. The crate apologizes by exploding softly.",
          choices: [
            { label: "Ask the alchemist to help anyway.", next: "pell_intro" },
            { label: "Leave with what you bought.", close: true, effects: [{ location: "refugee_stockade" }] }
          ]
        },
        pell_intro: {
          text: "'Pell Cindermoth. Licensed in two towns, banned in four, beloved by most surviving patients. The smoke is either a warning or breakfast.' Pell taps your shard. 'Oh. That is worse.'",
          choices: [
            { label: "Recruit Pell.", next: "pell_recruit" },
            { label: "Ask what the shard is doing to the air.", next: "pell_lore", effects: [{ lore: "heart_cinder" }] },
            { label: "Step away from the backpack.", close: true, effects: [{ approval: { pell: -1 } }] }
          ]
        },
        pell_lore: {
          text: "'It is teaching nearby fire to remember being alive. That is medically rude, historically fascinating, and probably contagious.'",
          choices: [
            { label: "That sounds like a reason to travel together.", next: "pell_recruit" },
            { label: "That sounds like a reason to stand farther away.", close: true, effects: [{ approval: { pell: -1 } }] }
          ]
        },
        pell_recruit: {
          text: "Pell salutes with a corkscrew. 'I accept. My rates are fair, my explosions educational, and my secrets only occasionally mobile.'",
          choices: [
            { label: "Recruit Pell.", close: true, effects: [{ recruit: "pell" }, { approval: { pell: 3 } }, { quest: { id: "c02", status: "active", stage: "Pell wants to understand the cinder living in their lung." } }, { addItem: "ember_flask" }, { addItem: "focus_tea" }] }
          ]
        }
      }
    },
    concord_picket: {
      id: "concord_picket",
      title: "The Picket Writ",
      speaker: "Captain Halvek",
      nodes: {
        start: {
          text: "The Concord picket is efficient enough to feel like a threat. Captain Halvek reads your face, then your hands. 'Relic bearer. Surrender the shard for lawful containment.'",
          choices: [
            { label: "Request legal terms before surrendering anything. [Wits DC 13]", check: { attr: "wits", dc: 13, success: "terms_success", failure: "terms_fail", successEffects: [{ faction: { concord: 1 } }, { addItem: "concord_writ" }, { flag: "concord_terms" }, { xp: 1 }], failureEffects: [{ faction: { concord: -1 } }, { flag: "concord_insulted" }] } },
            { label: "Say the refugees are under your protection.", next: "protect_refugees", effects: [{ approval: { nyra: 2 }, faction: { concord: -1 } }] },
            { label: "Ask what the Concord fears.", next: "fear", effects: [{ lore: "concord" }] }
          ]
        },
        terms_success: {
          text: "You find three contradictions in the writ. Halvek exhales through his nose. 'Fine. Provisional custody remains disputed. Bring it to Blackglass and do not make me regret procedure.'",
          choices: [
            { label: "Accept provisional passage.", close: true, effects: [{ quest: { id: "m02", status: "active", stage: "The Concord will not attack unless provoked." } }, { flag: "concord_passage" }] },
            { label: "Ask for soldiers to guard the stockade.", close: true, effects: [{ faction: { concord: 1, compact: -1 } }, { flag: "concord_guards_stockade" }, { approval: { nyra: -1 } }] }
          ]
        },
        terms_fail: {
          text: "Halvek hears defiance where you intended law. 'Then you carry an illegal relic and a poor tongue.' Hands fall to spear hafts.",
          choices: [
            { label: "Back away before steel comes out.", close: true, effects: [{ location: "lighthouse_watch" }] },
            { label: "Stand your ground.", close: true, effects: [{ startCombat: "concord_gate" }] }
          ]
        },
        protect_refugees: {
          text: "'Good,' Halvek says. 'Then you understand why dangerous power must answer to someone.'",
          choices: [
            { label: "Power should answer to the people it endangers.", close: true, effects: [{ faction: { compact: 1, concord: -1 } }, { approval: { sable: 1 } }] },
            { label: "Power should answer to law, but not blindly.", close: true, effects: [{ faction: { concord: 1 } }, { approval: { nyra: 1 } }] }
          ]
        },
        fear: {
          text: "'The first ashfall began with a committee of kind people making exceptions.' Halvek's stare does not move. 'I fear kind people.'",
          choices: [
            { label: "Then fear me carefully.", close: true, effects: [{ faction: { concord: -1 } }, { approval: { vex: 1 } }] },
            { label: "Then help me stay careful.", close: true, effects: [{ faction: { concord: 1 } }, { addItem: "ash_salve" }] }
          ]
        }
      }
    },
    glassreef_bell_scene: {
      id: "glassreef_bell_scene",
      title: "The Drowned Bell",
      speaker: "Bell-Diver Sesh",
      nodes: {
        start: {
          text: "Sesh the bell-diver ties glass weights to his ankles. 'The bell saw your ember fall. Bells see everything. Mostly because they cannot run.'",
          choices: [
            { label: "Dive for the bell with him. [Finesse DC 14]", check: { attr: "finesse", dc: 14, success: "dive_success", failure: "dive_fail", successEffects: [{ addItem: "glassreef_bell" }, { lore: "cinderfall" }, { flag: "bell_recovered" }, { quest: { id: "s02", status: "completed", stage: "You recovered the drowned bell." } }, { xp: 1 }], failureEffects: [{ flag: "reef_cut" }, { addItem: "ash_salve" }] } },
            { label: "Pay Sesh for the bell's testimony.", next: "pay_sesh", effects: [{ gold: -6 }, { faction: { compact: 1 } }] },
            { label: "Fight through the reef things guarding it.", close: true, effects: [{ startCombat: "glassreef" }] }
          ]
        },
        dive_success: {
          text: "The reef cuts your sleeves to ribbons, but the bell rises in your arms. When it rings, you hear a voice say: 'Blackglass remembers the first promise.'",
          choices: [
            { label: "Record the testimony.", close: true, effects: [{ quest: { id: "m02", status: "active", stage: "The bell points toward Blackglass and the first promise." } }, { flag: "witness_bell" }] }
          ]
        },
        dive_fail: {
          text: "The reef opens you like paper. Sesh drags you back before the tide claims more than blood. 'Next time, let the bell be dramatic alone.'",
          choices: [
            { label: "Return armed.", close: true, effects: [{ startCombat: "glassreef" }] },
            { label: "Leave the bell for now.", close: true }
          ]
        },
        pay_sesh: {
          text: "Sesh pockets the coins and rings a tiny handbell. Its note is thin but true. 'The ember fell because something below Blackglass called it home.'",
          choices: [
            { label: "Thank him and mark the testimony.", close: true, effects: [{ flag: "witness_bell" }, { quest: { id: "m02", status: "active", stage: "A bell-diver says the shard was called home to Blackglass." } }] }
          ]
        }
      }
    },
    lighthouse_watch: {
      id: "lighthouse_watch",
      title: "The Inland Lens",
      speaker: "Keeper Lio",
      nodes: {
        start: {
          text: "Keeper Lio has turned the lighthouse lens away from the sea. It points inland, focusing sunset on a distant black mark. 'I saw your star fall upward first.'",
          choices: [
            { label: "Align the lens with the shard. [Wits DC 14]", check: { attr: "wits", dc: 14, success: "lens_success", failure: "lens_fail", successEffects: [{ flag: "lighthouse_signal" }, { lore: "blackglass" }, { quest: { id: "m02", status: "completed", stage: "All Cinderfall witnesses point toward Blackglass." } }, { xp: 2 }], failureEffects: [{ flag: "lens_cracked" }, { corruption: 1 }] } },
            { label: "Ask why he has not slept.", next: "lio_dream" },
            { label: "Let a companion take watch while Lio rests.", close: true, effects: [{ approval: { nyra: 1, oryn: 1 } }, { supplies: -1 }, { flag: "lio_rested" }] }
          ]
        },
        lio_dream: {
          text: "'Every time I close my eyes, a city made of mirrors asks me to choose a jailer.' Lio laughs once. 'I was a fisherman yesterday.'",
          choices: [
            { label: "Promise him this will not be his burden.", close: true, effects: [{ approval: { oryn: 1, nyra: 1 } }, { flag: "lio_comforted" }] },
            { label: "Ask him to describe the city precisely.", next: "lens_success", effects: [{ lore: "blackglass" }] }
          ]
        },
        lens_success: {
          text: "The lens catches the shard-light. For a heartbeat, the coast, fen, and citadel align into one road. The first act of your covenant is over.",
          choices: [
            { label: "Prepare to cross into Wyrdroot.", close: true, effects: [{ flag: "cinderfall_resolved" }, { quest: { id: "m03", status: "active", stage: "The road through Wyrdroot Fen has appeared." } }, { act: 2 }, { region: "wyrdroot" }, { location: "fen_crossing" }] }
          ]
        },
        lens_fail: {
          text: "The lens cracks, splitting the signal into six possible roads. One smells like rain. One smells like a throne. One smells like nothing at all.",
          choices: [
            { label: "Choose the rain road into Wyrdroot.", close: true, effects: [{ flag: "cinderfall_resolved" }, { quest: { id: "m03", status: "active", stage: "Even cracked, the lens revealed a road through Wyrdroot." } }, { act: 2 }, { region: "wyrdroot" }, { location: "fen_crossing" }] }
          ]
        }
      }
    },
    fen_crossing: {
      id: "fen_crossing",
      title: "Roads Through the Fen",
      speaker: "The Road",
      nodes: {
        start: {
          text: "The fen road surfaces one stone at a time. Each stone bears a name. Some are living. Some are yours in handwriting you do not recognize.",
          choices: [
            { label: "Step only on names of the dead. [Spirit DC 13]", check: { attr: "spirit", dc: 13, success: "dead_names", failure: "living_names", successEffects: [{ faction: { synod: 1 } }, { lore: "wyrdroot" }, { flag: "fen_respected" }, { flag: "fen_crossed" }], failureEffects: [{ corruption: 1 }, { flag: "fen_offended" }, { flag: "fen_crossed" }] } },
            { label: "Let the Reedborn method guide you.", next: "reed_method", condition: { origin: "reedborn" }, effects: [{ faction: { synod: 1 }, approval: { sable: 1 } }] },
            { label: "Push ahead before the road sinks.", close: true, effects: [{ flag: "fen_crossed" }, { location: "reed_village" }] }
          ]
        },
        dead_names: {
          text: "The road accepts your care. Pale reeds bow, and a village of lanterns appears through the fog.",
          choices: [
            { label: "Enter the Reed Village.", close: true, effects: [{ flag: "fen_crossed" }, { location: "reed_village" }, { quest: { id: "m03", status: "active", stage: "The fen has allowed passage to the Reed Village." } }] }
          ]
        },
        living_names: {
          text: "A living name cracks under your boot. Somewhere far away, someone forgets a childhood nickname. The fen lets you pass, but charges interest.",
          choices: [
            { label: "Keep moving.", close: true, effects: [{ flag: "fen_crossed" }, { location: "reed_village" }, { quest: { id: "m03", status: "active", stage: "The fen allowed passage after taking a memory." } }] }
          ]
        },
        reed_method: {
          text: "You walk like you were taught: heel on moss, toe on stone, apologize to any name that shifts. The road remembers and forgives.",
          choices: [
            { label: "Enter the Reed Village.", close: true, effects: [{ location: "reed_village" }, { flag: "fen_respected" }, { flag: "fen_crossed" }] }
          ]
        }
      }
    },
    reed_village: {
      id: "reed_village",
      title: "The Village That Floats",
      speaker: "Sable Renn",
      nodes: {
        start: {
          text: "A knife appears at your belt, then a woman appears where the knife should be. 'Relax. If I wanted you robbed, you would be lighter already. Sable Renn. I sell information and occasionally regret.'",
          choices: [
            { label: "Ask what information costs.", next: "price" },
            { label: "Catch her hand before she steals again. [Finesse DC 13]", check: { attr: "finesse", dc: 13, success: "catch_success", failure: "catch_fail", successEffects: [{ approval: { sable: 2 } }, { addItem: "faceless_coin" }, { xp: 1 }], failureEffects: [{ gold: -3 }, { approval: { sable: 1 } }] } },
            { label: "Ask Sable to join the road.", next: "sable_recruit" }
          ]
        },
        price: {
          text: "'For you? One promise not to hand my ledger to the first uniform with clean boots.' She nods toward the fen. 'The factions are not arguing over a relic. They are arguing over who gets to define memory.'",
          choices: [
            { label: "Promise the ledger will not become a weapon for tyrants.", next: "sable_recruit", effects: [{ approval: { sable: 2 }, faction: { compact: 1 } }] },
            { label: "No promises until I know what is in it.", close: true, effects: [{ approval: { sable: -1 }, quest: { id: "s04", status: "active", stage: "Sable's ledger may become important in Blackglass." } }] }
          ]
        },
        catch_success: {
          text: "You catch her wrist. Sable smiles, genuinely delighted. 'Good. I prefer employers with reflexes.'",
          choices: [
            { label: "Recruit Sable.", next: "sable_recruit" },
            { label: "Ask about the Root Tribunal.", close: true, effects: [{ location: "root_tribunal" }, { quest: { id: "m04", status: "active", stage: "The Root Tribunal will state the Synod claim." } }] }
          ]
        },
        catch_fail: {
          text: "Your coin purse returns lighter by three coins and heavier by one note: 'Could be worse. Could be politics.'",
          choices: [
            { label: "Recruit the person who robbed you politely.", next: "sable_recruit" },
            { label: "Head for the tribunal.", close: true, effects: [{ location: "root_tribunal" }] }
          ]
        },
        sable_recruit: {
          text: "'I know shortcuts, ledgers, and which bridges are metaphors. I also know when a doomed expedition has the good snacks.' Sable offers your missing coin back.",
          choices: [
            { label: "Recruit Sable.", close: true, effects: [{ recruit: "sable" }, { approval: { sable: 3 } }, { quest: { id: "c03", status: "active", stage: "Sable needs control of the Gloam ledger before Blackglass." } }, { quest: { id: "s04", status: "active", stage: "Find the ledger knives hunting Sable's inheritance." } }, { addItem: "compact_cipher" }] }
          ]
        }
      }
    },
    fungus_garden: {
      id: "fungus_garden",
      title: "A Garden That Remembers",
      speaker: "Memory Cap",
      nodes: {
        start: {
          text: "Pale fungus caps glow with remembered faces. Each cap offers a final moment: a soldier laughing, a mother lying, a judge begging a root to forget.",
          choices: [
            { label: "Ask the garden for the shard's first memory. [Spirit DC 14]", check: { attr: "spirit", dc: 14, success: "garden_success", failure: "garden_fail", successEffects: [{ lore: "heart_cinder" }, { flag: "garden_memory" }, { quest: { id: "s03", status: "completed", stage: "The garden showed the first covenant." } }, { xp: 2 }], failureEffects: [{ corruption: 1 }, { flag: "garden_overwhelmed" }] } },
            { label: "Collect a mirror seed gently.", close: true, effects: [{ addItem: "mirror_seed" }, { lore: "mirror_seed" }, { faction: { synod: 1 } }, { quest: { id: "s03", status: "active", stage: "A mirror seed may influence the final covenant." } }] },
            { label: "Burn the infected caps.", close: true, effects: [{ faction: { synod: -2, concord: 1 } }, { approval: { pell: -1, oryn: -1 } }, { addItem: "ember_flask" }] }
          ]
        },
        garden_success: {
          text: "You see the first covenant: not a spell, but a promise shared by frightened rivals. It failed only when one side claimed sole custody of memory.",
          choices: [
            { label: "Carry that lesson onward.", close: true, effects: [{ flag: "shared_covenant_known" }, { quest: { id: "m04", status: "active", stage: "A shared covenant may be possible if the factions can be balanced." } }] }
          ]
        },
        garden_fail: {
          text: "The garden pours too many endings into you. Your knees hit mud. Someone else's last breath leaves your mouth.",
          choices: [
            { label: "Let your companions pull you free.", close: true, effects: [{ approval: { oryn: 1, pell: 1 } }] }
          ]
        }
      }
    },
    drowned_road: {
      id: "drowned_road",
      title: "The Drowned Road",
      speaker: "Road-Signs",
      nodes: {
        start: {
          text: "Signs point in seven directions. Four are underwater. One is upside down. One says simply: APOLOGIZE.",
          choices: [
            { label: "Decode the road-signs. [Wits DC 13]", check: { attr: "wits", dc: 13, success: "road_success", failure: "road_fail", successEffects: [{ flag: "road_decoded" }, { quest: { id: "m03", status: "active", stage: "You found the dry road to the tribunal." } }, { xp: 1 }], failureEffects: [{ flag: "road_lost" }] } },
            { label: "Clear the ambush by force.", close: true, effects: [{ startCombat: "fen_ambush" }] },
            { label: "Follow the sign that apologizes.", close: true, effects: [{ faction: { synod: 1 } }, { location: "root_tribunal" }] }
          ]
        },
        road_success: {
          text: "The signs are a grammar of tides. You read them as a sentence: 'The court convenes where guilt can breathe.'",
          choices: [
            { label: "Go to the Root Tribunal.", close: true, effects: [{ location: "root_tribunal" }] }
          ]
        },
        road_fail: {
          text: "You follow the wrong sign into waist-deep water. Something below grabs a boot and tries to inherit your leg.",
          choices: [
            { label: "Fight free.", close: true, effects: [{ startCombat: "fen_ambush" }] },
            { label: "Spend supplies building a raft.", close: true, effects: [{ supplies: -1 }, { location: "root_tribunal" }] }
          ]
        }
      }
    },
    root_tribunal: {
      id: "root_tribunal",
      title: "The Three Claims",
      speaker: "Root-Seer Ivara",
      nodes: {
        start: {
          text: "Root-Seer Ivara sits with roots braided around her wrists. 'The Heart-Cinder is a dam. Break it, and grief becomes rain again. Seal it, and the realm stays thirsty.'",
          choices: [
            { label: "Hear the Synod claim with respect.", next: "synod_claim", effects: [{ faction: { synod: 1 }, lore: "synod" }] },
            { label: "Challenge the cost of breaking the dam. [Resolve DC 15]", check: { attr: "resolve", dc: 15, success: "challenge_success", failure: "challenge_fail", successEffects: [{ faction: { synod: 1, concord: 1 } }, { flag: "synod_cost_named" }, { xp: 2 }], failureEffects: [{ faction: { synod: -1 } }, { flag: "synod_offended" }] } },
            { label: "Ask for a path to Blackglass.", close: true, effects: [{ flag: "fen_claim_resolved" }, { quest: { id: "m04", status: "active", stage: "The Synod claim is heard. The weather-vane can open Blackglass." } }, { location: "weather_vane" }] }
          ]
        },
        synod_claim: {
          text: "'A sealed wound is still a wound,' Ivara says. 'The Concord calls rot stability. The Compact calls fear freedom. We call the future hungry.'",
          choices: [
            { label: "Promise to consider renewal.", close: true, effects: [{ flag: "fen_claim_resolved" }, { faction: { synod: 2 } }, { approval: { pell: 1 } }, { quest: { id: "m04", status: "active", stage: "The Synod seeks renewal through the Heart-Cinder." } }] },
            { label: "Say hunger does not excuse sacrifice.", close: true, effects: [{ flag: "fen_claim_resolved" }, { faction: { synod: -1, concord: 1 } }, { approval: { nyra: 1, oryn: 1 } }] }
          ]
        },
        challenge_success: {
          text: "You name the villages downstream, the dead whose names roots wear, the living who did not vote to become soil. Ivara bows her head. 'Then carry our hope with our shame.'",
          choices: [
            { label: "Accept the burden.", close: true, effects: [{ flag: "fen_claim_resolved" }, { quest: { id: "m04", status: "active", stage: "The Synod claim is honest about its cost." } }, { location: "weather_vane" }] }
          ]
        },
        challenge_fail: {
          text: "The roots tighten. Ivara's patience thins. 'You defend a burning age because you are warm in it.'",
          choices: [
            { label: "Leave before the roots vote.", close: true, effects: [{ location: "weather_vane" }] }
          ]
        }
      }
    },
    weather_vane: {
      id: "weather_vane",
      title: "The Last Weather-Vane",
      speaker: "Brass Saint Remnant",
      nodes: {
        start: {
          text: "A brass saint bolted to the chapel roof turns its one remaining hand. 'Forecast: lawful fire, rootstorm, civic knives, shared dawn, crowned ash, perfect silence.'",
          choices: [
            { label: "Repair the vane. [Wits DC 14]", check: { attr: "wits", dc: 14, success: "vane_success", failure: "vane_fail", successEffects: [{ addItem: "last_weather_vane" }, { lore: "brass_saints" }, { flag: "weather_vane_aligned" }, { quest: { id: "s05", status: "completed", stage: "The last weather-vane points to Blackglass." } }, { xp: 2 }], failureEffects: [{ flag: "weather_vane_erratic" }, { addItem: "thunder_jar" }] } },
            { label: "Ask which forecast saves the most people.", next: "forecast" },
            { label: "Take the direct road to Blackglass.", close: true, effects: [{ flag: "fen_claim_resolved" }, { flag: "weather_vane_aligned" }, { act: 3 }, { region: "blackglass" }, { location: "blackglass_gate" }, { quest: { id: "m05", status: "active", stage: "The road to Blackglass has opened." } }] }
          ]
        },
        vane_success: {
          text: "The vane locks north-east. Across the fen, Blackglass rises from fog like a blade remembering a hand.",
          choices: [
            { label: "Enter Act 3: Blackglass.", close: true, effects: [{ flag: "fen_claim_resolved" }, { act: 3 }, { region: "blackglass" }, { location: "blackglass_gate" }, { quest: { id: "m05", status: "active", stage: "The weather-vane opened the safest road to Blackglass." } }] }
          ]
        },
        vane_fail: {
          text: "The vane spins and spits sparks. It still points to Blackglass, but now every storm on the horizon knows your name.",
          choices: [
            { label: "Go before the weather catches up.", close: true, effects: [{ flag: "fen_claim_resolved" }, { act: 3 }, { region: "blackglass" }, { location: "blackglass_gate" }, { corruption: 1 }, { quest: { id: "m05", status: "active", stage: "A dangerous road to Blackglass is open." } }] }
          ]
        },
        forecast: {
          text: "'Insufficient data. Saving people is not a weather pattern. Recommendation: ask people what they mean by saved.'",
          choices: [
            { label: "That is annoyingly wise.", close: true, effects: [{ approval: { pell: 1, oryn: 1 } }, { lore: "brass_saints" }] }
          ]
        }
      }
    },
    blackglass_gate: {
      id: "blackglass_gate",
      title: "Gate of Shards",
      speaker: "The Gate",
      nodes: {
        start: {
          text: "The Blackglass gate reflects a version of you wearing a crown of cooling ash. Three faction envoys arrive at once, each pretending not to be afraid.",
          choices: [
            { label: "Use the shard to open the gate. [Resolve DC 15]", check: { attr: "resolve", dc: 15, success: "gate_success", failure: "gate_fail", successEffects: [{ flag: "gate_opened" }, { flag: "gate_opened_clean" }, { lore: "blackglass" }, { xp: 2 }], failureEffects: [{ corruption: 1 }, { flag: "gate_opened" }, { flag: "gate_opened_blood" }] } },
            { label: "Let the Concord force the gate.", close: true, effects: [{ faction: { concord: 2, compact: -1 } }, { startCombat: "concord_gate" }] },
            { label: "Slip through a Compact sewer chart.", close: true, condition: { companion: "sable" }, effects: [{ faction: { compact: 2 } }, { location: "compact_den" }] }
          ]
        },
        gate_success: {
          text: "The gate opens without breaking. For one impossible moment, the city seems relieved.",
          choices: [
            { label: "Enter Blackglass.", close: true, effects: [{ quest: { id: "m05", status: "active", stage: "You opened Blackglass without surrendering the shard." } }, { location: "compact_den" }] }
          ]
        },
        gate_fail: {
          text: "The shard drinks a drop of your blood and the gate opens like a wound. Every mirror in the city turns toward you.",
          choices: [
            { label: "Step through anyway.", close: true, effects: [{ quest: { id: "m05", status: "active", stage: "Blackglass opened, but the Heart-Cinder took notice." } }, { location: "compact_den" }] }
          ]
        }
      }
    },
    compact_den: {
      id: "compact_den",
      title: "The Civic Room",
      speaker: "Gloam Speaker Tamsin",
      nodes: {
        start: {
          text: "The Compact den is a room of printing presses, soup pots, knives, and voting slates. Tamsin nods to Sable if present. 'Free cities do not need a new god. They need no one holding the only key.'",
          choices: [
            { label: "Support the Compact claim.", close: true, effects: [{ faction: { compact: 2 } }, { lore: "gloam_compact" }, { quest: { id: "m04", status: "active", stage: "The Compact wants the Heart-Cinder decentralized." } }] },
            { label: "Demand the hidden ledger. [Guile DC 14]", check: { attr: "guile", dc: 14, success: "ledger_success", failure: "ledger_fail", successEffects: [{ addItem: "gloam_ledger" }, { flag: "ledger_taken" }, { approval: { sable: 2 } }, { quest: { id: "s04", status: "completed", stage: "You secured the Gloam ledger." } }, { xp: 2 }], failureEffects: [{ startCombat: "ledger_knives" }, { approval: { sable: -1 } }] } },
            { label: "Ask where the dead keep their records.", close: true, effects: [{ location: "choir_vault" }] }
          ]
        },
        ledger_success: {
          text: "You do not threaten. You describe exactly who benefits if the ledger stays hidden. Tamsin hates that you are right and hands it over.",
          choices: [
            { label: "Give Sable custody.", close: true, condition: { companion: "sable" }, effects: [{ approval: { sable: 3 }, flag: "sable_controls_ledger", lore: "sable_secret" }, { quest: { id: "c03", status: "completed", stage: "Sable controls the ledger without becoming its prisoner." } }] },
            { label: "Seal it until the final covenant.", close: true, effects: [{ flag: "ledger_sealed" }, { faction: { compact: 1, concord: 1 } }] }
          ]
        },
        ledger_fail: {
          text: "The room goes quiet in the old undercity way. Knives appear from sleeves, bowls, and one loaf of bread.",
          choices: [
            { label: "Fight for the ledger.", close: true, effects: [{ startCombat: "ledger_knives" }] }
          ]
        }
      }
    },
    choir_vault: {
      id: "choir_vault",
      title: "The Quiet Bell",
      speaker: "Brother Oryn",
      nodes: {
        start: {
          text: "In the Choir Vault, names hang from copper wires. Brother Oryn kneels among them, palms bleeding from bell-rope. 'Please do not step on the petitions. Some of them waited centuries.'",
          choices: [
            { label: "Help Oryn ring only for the willing dead. [Spirit DC 14]", check: { attr: "spirit", dc: 14, success: "bell_success", failure: "bell_fail", successEffects: [{ recruit: "oryn" }, { approval: { oryn: 3 } }, { addItem: "quiet_clapper" }, { lore: "oryn_secret" }, { quest: { id: "c04", status: "completed", stage: "Oryn learned to ask the dead for consent." } }, { xp: 2 }], failureEffects: [{ recruit: "oryn" }, { approval: { oryn: 1 } }, { corruption: 1 }] } },
            { label: "Recruit Oryn and leave the vault quiet.", close: true, effects: [{ recruit: "oryn" }, { flag: "quiet_bell_resolved" }, { quest: { id: "c04", status: "active", stage: "Oryn needs the Quiet Bell clapper before the end." } }, { approval: { oryn: 2 } }, { location: "skybridge" }] },
            { label: "Ask the dead about the Heart-Cinder.", next: "dead_answer", effects: [{ lore: "heart_cinder" }] }
          ]
        },
        bell_success: {
          text: "The bell rings once. Some names brighten. Some go dark. Oryn cries because no one screamed.",
          choices: [
            { label: "Invite Oryn to walk with you.", close: true, effects: [{ recruit: "oryn" }, { flag: "quiet_bell_resolved" }, { location: "skybridge" }] }
          ]
        },
        bell_fail: {
          text: "Too many voices answer. Oryn catches the rope before the vault becomes a court. 'I will come. Someone must keep asking what we are allowed to use.'",
          choices: [
            { label: "Recruit Oryn.", close: true, effects: [{ recruit: "oryn" }, { location: "skybridge" }] }
          ]
        },
        dead_answer: {
          text: "A hundred dead whisper: 'It is not a heart. It is a witness. Beware anyone who wants the witness alone.'",
          choices: [
            { label: "Carry the warning.", close: true, effects: [{ flag: "dead_warned_shared" }, { quest: { id: "m06", status: "active", stage: "The dead warn against sole custody of the Heart-Cinder." } }] }
          ]
        }
      }
    },
    skybridge_scene: {
      id: "skybridge_scene",
      title: "Sentinels on the Skybridge",
      speaker: "Blackglass Sentinel",
      nodes: {
        start: {
          text: "The skybridge groans. Sentinels unfold from the railings, each with a civic law etched where a face should be.",
          choices: [
            { label: "Quote the law back at them. [Wits DC 15]", check: { attr: "wits", dc: 15, success: "law_success", failure: "law_fail", successEffects: [{ flag: "sentinels_answered" }, { xp: 2 }, { quest: { id: "m05", status: "active", stage: "You passed the skybridge by law." } }], failureEffects: [{ startCombat: "skybridge" }] } },
            { label: "Fight through.", close: true, effects: [{ startCombat: "skybridge" }] },
            { label: "Look for a duelist's side passage.", close: true, effects: [{ location: "ardent_gallery" }] }
          ]
        },
        law_success: {
          text: "The sentinels decide you are not innocent, merely authorized. In Blackglass, that seems to be enough.",
          choices: [
            { label: "Cross to the Ardent Gallery.", close: true, effects: [{ location: "ardent_gallery" }] }
          ]
        },
        law_fail: {
          text: "The law you quote was repealed during the third famine. The sentinels correct you with halberds.",
          choices: [
            { label: "Defend yourselves.", close: true, effects: [{ startCombat: "skybridge" }] }
          ]
        }
      }
    },
    ardent_gallery: {
      id: "ardent_gallery",
      title: "The Name Beneath the Blade",
      speaker: "Vex Ardent",
      nodes: {
        start: {
          text: "A duelist in a torn formal coat salutes a wall of scratched portraits. 'I am Vex. If you are here to kill the past, take a number. If you are here to understand it, draw steel gently.'",
          choices: [
            { label: "Duel Vex with honor. [Finesse DC 14]", check: { attr: "finesse", dc: 14, success: "duel_success", failure: "duel_fail", successEffects: [{ recruit: "vex" }, { approval: { vex: 3 } }, { lore: "vex_secret" }, { addItem: "veyr_signet" }, { quest: { id: "c05", status: "completed", stage: "Vex reclaimed the Ardent name without kneeling to it." } }, { xp: 2 }], failureEffects: [{ recruit: "vex" }, { approval: { vex: 1 } }] } },
            { label: "Ask what the Ardent name opens.", next: "ardent_name", effects: [{ lore: "vex_secret" }] },
            { label: "Recruit Vex without ceremony.", close: true, effects: [{ recruit: "vex" }, { flag: "ardent_name_ready" }, { quest: { id: "c05", status: "active", stage: "Vex's family name may open the Heart-Cinder chamber." } }, { location: "heart_chamber" }] }
          ]
        },
        duel_success: {
          text: "You touch Vex's shoulder with the flat before the final cut. Vex laughs, relieved and furious. 'Good. I needed proof the name could lose and survive.'",
          choices: [
            { label: "Walk together to the heart.", close: true, effects: [{ flag: "ardent_name_ready" }, { location: "heart_chamber" }] }
          ]
        },
        duel_fail: {
          text: "Vex disarms you with a move too beautiful to hate. 'You are not ready for my family's sins. Fortunately, I am.'",
          choices: [
            { label: "Recruit Vex.", close: true, effects: [{ recruit: "vex" }, { location: "heart_chamber" }] }
          ]
        },
        ardent_name: {
          text: "'The first lock. The first lie. The first family that mistook stewardship for ownership.' Vex looks at the portraits. 'I am trying to become an ending they did not plan.'",
          choices: [
            { label: "Help Vex become that ending.", close: true, effects: [{ recruit: "vex" }, { approval: { vex: 3 } }, { flag: "ardent_name_ready" }, { quest: { id: "c05", status: "completed", stage: "Vex chose a future beyond inherited shame." } }, { location: "heart_chamber" }] }
          ]
        }
      }
    },
    heart_chamber: {
      id: "heart_chamber",
      title: "The Covenant Choice",
      speaker: "Heart-Cinder",
      nodes: {
        start: {
          text: "The Heart-Cinder fills the chamber without filling it, a second sun folded into witness. It shows you six futures and asks for a hand steady enough to choose.",
          choices: [
            { label: "Face the avatar before deciding.", close: true, condition: { notFlag: "avatar_defeated" }, effects: [{ startCombat: "final_avatar" }] },
            { label: "Seal it under the Ashen Concord.", next: "ending_concord", effects: [{ ending: "concord_seal" }] },
            { label: "Break the dam for the Verdant Synod.", next: "ending_synod", effects: [{ ending: "synod_renewal" }] },
            { label: "Give every free city a shard-key.", next: "ending_compact", effects: [{ ending: "compact_dawn" }] },
            { label: "Forge a shared covenant among all claims.", next: "ending_shared", condition: { flag: "shared_covenant_known" }, effects: [{ ending: "shared_covenant" }] },
            { label: "Crown yourself witness and ruler.", next: "ending_crown", effects: [{ ending: "heart_crown" }, { corruption: 2 }] },
            { label: "Shatter the Heart-Cinder into silence.", next: "ending_silence", effects: [{ ending: "ashfall_silence" }] }
          ]
        },
        ending_concord: { text: "You give the Heart-Cinder to law, locks, and wardens. It becomes safer. It also becomes quieter when frightened people knock.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] },
        ending_synod: { text: "You break the ash dam. Rain falls upward first, then properly. Roots split old streets. Some homes drown. Some graves bloom.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] },
        ending_compact: { text: "You divide the key until no one hand can close around it. Messy councils inherit a miracle too large for clean answers.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] },
        ending_shared: { text: "You bind law, root, and free city into a covenant that can be broken only by all three together. The Heart-Cinder finally stops flinching.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] },
        ending_crown: { text: "You take the witness into yourself. Every oath warms behind your eyes. People kneel because history itself is watching from your mouth.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] },
        ending_silence: { text: "You shatter the witness. The ash forgets. The dead release their grip. The living inherit mercy and a terrible lack of proof.", choices: [{ label: "Read the ending.", close: true, effects: [{ viewEnding: true }] }] }
      }
    },
    camp_nyra: {
      id: "camp_nyra",
      title: "Camp: The Broken Retreat",
      speaker: "Nyra",
      nodes: {
        start: {
          text: "Nyra oils her shield with mechanical care. 'My squad died because I turned left instead of right. The refugees lived for the same reason. Tell me which fact matters more.'",
          choices: [
            { label: "The living do, but the dead still deserve truth.", close: true, effects: [{ approval: { nyra: 3 } }, { lore: "nyra_secret" }, { flag: "nyra_secret_revealed" }, { quest: { id: "c01", status: "completed", stage: "Nyra accepted truth without surrendering the refugees she saved." } }] },
            { label: "You made the only honorable choice.", close: true, effects: [{ approval: { nyra: 2 } }, { lore: "nyra_secret" }, { flag: "nyra_comforted" }] },
            { label: "You need to stop asking me to absolve you.", close: true, effects: [{ approval: { nyra: -2 } }, { lore: "nyra_secret" }] }
          ]
        }
      }
    },
    camp_pell: {
      id: "camp_pell",
      title: "Camp: The Moth in the Flask",
      speaker: "Pell",
      nodes: {
        start: {
          text: "Pell coughs sparks into a jar. The sparks arrange themselves into a tiny moth. 'Good news: not tuberculosis. Bad news: the moth has opinions.'",
          choices: [
            { label: "Treat it as a patient, not a monster.", close: true, effects: [{ approval: { pell: 3 }, oryn: 1 }, { lore: "pell_secret" }, { flag: "pell_moth_spared" }, { quest: { id: "c02", status: "completed", stage: "Pell chose care over panic." } }] },
            { label: "Study it carefully with Pell.", close: true, effects: [{ approval: { pell: 2 } }, { lore: "pell_secret" }, { addItem: "ember_flask" }] },
            { label: "It is too dangerous. Burn it out.", close: true, effects: [{ approval: { pell: -3, oryn: -1 } }, { flag: "pell_moth_harmed" }] }
          ]
        }
      }
    },
    camp_sable: {
      id: "camp_sable",
      title: "Camp: Ledger Fire",
      speaker: "Sable",
      nodes: {
        start: {
          text: "Sable lays coded pages around the fire. 'Every name here bought survival with someone else's winter. If I publish it all, good people die with monsters.'",
          choices: [
            { label: "Use the ledger to protect victims first.", close: true, effects: [{ approval: { sable: 3, nyra: 1 } }, { lore: "sable_secret" }, { flag: "sable_secret_revealed" }, { quest: { id: "c03", status: "completed", stage: "Sable chose protection before revenge." } }] },
            { label: "Truth first. Let the city bleed clean.", close: true, effects: [{ approval: { sable: -1, vex: 1 } }, { faction: { compact: -1 }, flag: "ledger_published_hard" }] },
            { label: "Keep one secret for yourself.", close: true, effects: [{ approval: { sable: 1 } }, { flag: "ledger_bargain" }] }
          ]
        }
      }
    },
    camp_oryn: {
      id: "camp_oryn",
      title: "Camp: The Listening Prayer",
      speaker: "Oryn",
      nodes: {
        start: {
          text: "Oryn asks everyone at camp to sit silently for one minute. When it ends, he whispers, 'The dead do not want vengeance tonight. They want us to stop making them useful.'",
          choices: [
            { label: "Promise not to use the dead without consent.", close: true, effects: [{ approval: { oryn: 3 } }, { lore: "oryn_secret" }, { flag: "oryn_secret_revealed" }] },
            { label: "Some wars require every ally.", close: true, effects: [{ approval: { oryn: -2, nyra: 1 } }, { corruption: 1 }] },
            { label: "Ask Oryn what he wants after this.", close: true, effects: [{ approval: { oryn: 2 } }, { flag: "oryn_friendship" }] }
          ]
        }
      }
    },
    camp_vex: {
      id: "camp_vex",
      title: "Camp: A Name Laid Down",
      speaker: "Vex",
      nodes: {
        start: {
          text: "Vex polishes a blade that has no reflection. 'If a name is a cage, why does losing it feel like falling?'",
          choices: [
            { label: "Because falling is also how flight begins.", close: true, effects: [{ approval: { vex: 3 } }, { lore: "vex_secret" }, { flag: "vex_secret_revealed" }] },
            { label: "Keep the name. Make it answer to you.", close: true, effects: [{ approval: { vex: 2 } }, { flag: "vex_keeps_name" }] },
            { label: "Names are tools. Use it and discard it.", close: true, effects: [{ approval: { vex: -1, sable: 1 } }] }
          ]
        }
      }
    }
  };

  const endings = {
    concord_seal: { id: "concord_seal", name: "Concord Seal", text: "The Ashen Concord builds seven lawful doors around the Heart-Cinder. The realm stabilizes. Refugee roads become safer, but petitions vanish inside procedures built to outlive grief." },
    synod_renewal: { id: "synod_renewal", name: "Synod Renewal", text: "The Verdant Synod breaks the ash cycle. Rain returns, roots split Blackglass, and a generation learns to plant gardens where courts once stood. The cost is real, and so is the green." },
    compact_dawn: { id: "compact_dawn", name: "Compact Dawn", text: "The Gloam Compact scatters shard-keys among free cities. No ruler can command memory alone. Councils become louder, messier, harder to conquer, and much harder to predict." },
    shared_covenant: { id: "shared_covenant", name: "Shared Covenant", text: "You bind the Heart-Cinder to a threefold covenant: law to restrain, root to renew, and free city to question. It is fragile because people are fragile. It works because no one can own it alone." },
    heart_crown: { id: "heart_crown", name: "Heart-Cinder Crown", text: "You crown yourself witness. Lies burn out near you. So do some choices. The realm becomes honest, terrified, and very still when you enter a room." },
    ashfall_silence: { id: "ashfall_silence", name: "Ashfall Silence", text: "You shatter the Heart-Cinder. Ash becomes ash again. The dead stop testifying. The living must build justice without proof from ghosts, and some discover that mercy is heavier without witnesses." }
  };

  const DB = {
    origins,
    originsById: byId(origins),
    archetypes,
    archetypesById: byId(archetypes),
    styles,
    stylesById: byId(styles),
    abilities,
    items,
    itemsById: byId(items),
    companions,
    factions,
    quests,
    lore,
    enemies,
    encounters,
    regions,
    locations,
    dialogues,
    endings
  };

  let state = null;
  const ui = {
    view: "start",
    dialogue: null,
    combat: null,
    selectedAbility: null,
    builder: null,
    saveText: "",
    importText: "",
    lastRoll: null,
    message: "",
    fx: []
  };

  function freshBuilder() {
    return {
      name: "Cinder",
      origin: "ash_heir",
      archetype: "ember_warden",
      style: "embermark",
      points: 8,
      attrs: { might: 10, finesse: 10, wits: 10, spirit: 10, guile: 10, resolve: 10 }
    };
  }

  function createState(builder) {
    const origin = DB.originsById[builder.origin];
    const arch = DB.archetypesById[builder.archetype];
    const attrs = { ...builder.attrs };
    ATTRS.forEach((attr) => {
      attrs[attr] += (origin.bonus[attr] || 0) + (arch.bonus[attr] || 0);
    });
    const companionState = {};
    Object.keys(DB.companions).forEach((id) => {
      companionState[id] = { recruited: false, approval: 0, secret: false, romance: false, campSeen: false };
    });
    const newState = {
      version: 1,
      started: true,
      player: {
        name: builder.name.trim() || "Cinder",
        origin: builder.origin,
        archetype: builder.archetype,
        style: builder.style,
        attrs,
        level: 1,
        xp: 0,
        hp: arch.hp,
        maxHp: arch.hp,
        tempBuffs: {}
      },
      act: 1,
      day: 1,
      region: "cinderfall",
      location: "ash_beach",
      gold: 22,
      supplies: 4,
      corruption: 0,
      faction: { concord: 0, synod: 0, compact: 0 },
      companions: companionState,
      party: ["player"],
      quests: { m01: { status: "active", stage: "Reach the smoking crater on Ash Beach." } },
      flags: {},
      inventory: [],
      equipment: { weapon: null, armor: null, charm: null },
      codex: ["heart_cinder"],
      chronicle: [],
      completedEncounters: [],
      searched: {},
      ending: null
    };
    arch.gear.forEach((itemId) => addItemTo(newState, itemId, 1));
    ["healing_draught", "ash_salve", "charred_lullaby"].forEach((itemId) => addItemTo(newState, itemId, 1));
    newState.equipment.weapon = arch.gear.find((id) => DB.itemsById[id]?.slot === "weapon") || null;
    newState.equipment.armor = arch.gear.find((id) => DB.itemsById[id]?.slot === "armor") || null;
    chronicle(newState, `Created ${newState.player.name}, ${origin.name} ${arch.name}.`);
    return newState;
  }

  function addItemTo(target, itemId, qty = 1) {
    const item = DB.itemsById[itemId];
    if (!item) return;
    const stackable = item.type !== "equipment";
    const found = target.inventory.find((entry) => entry.id === itemId && stackable);
    if (found) found.qty += qty;
    else target.inventory.push({ id: itemId, qty });
  }

  function removeItem(itemId, qty = 1) {
    const entry = state.inventory.find((item) => item.id === itemId);
    if (!entry) return false;
    entry.qty -= qty;
    if (entry.qty <= 0) state.inventory = state.inventory.filter((item) => item !== entry);
    return true;
  }

  function chronicle(target, text) {
    target.chronicle.unshift({ day: target.day, act: target.act, text });
    target.chronicle = target.chronicle.slice(0, 80);
  }

  function pushFx(text, type = "note") {
    ui.fx.unshift({ id: Date.now() + Math.random(), text, type });
    ui.fx = ui.fx.slice(0, 5);
  }

  function log(text) {
    chronicle(state, text);
    ui.message = text;
    pushFx(text, "note");
  }

  function attrMod(value) {
    return Math.floor((value - 10) / 2);
  }

  function equipmentMods() {
    const mods = { armor: 0, damage: 0 };
    ATTRS.forEach((attr) => { mods[attr] = 0; });
    Object.values(state.equipment).forEach((itemId) => {
      const item = DB.itemsById[itemId];
      if (!item) return;
      if (item.mod) Object.entries(item.mod).forEach(([attr, value]) => { mods[attr] += value; });
      if (item.armor) mods.armor += item.armor;
      if (item.damage) mods.damage += item.damage;
    });
    Object.entries(state.player.tempBuffs || {}).forEach(([attr, value]) => { mods[attr] += value; });
    return mods;
  }

  function playerAttr(attr) {
    return state.player.attrs[attr] + (equipmentMods()[attr] || 0);
  }

  function checkBonus(attr) {
    const origin = DB.originsById[state.player.origin];
    const archetype = DB.archetypesById[state.player.archetype];
    let bonus = attrMod(playerAttr(attr));
    if ((origin.bonus[attr] || 0) > 0) bonus += 1;
    if ((archetype.bonus[attr] || 0) > 0) bonus += 1;
    return bonus;
  }

  function rollCheck(attr, dc, label) {
    const die = Math.floor(Math.random() * 20) + 1;
    const bonus = checkBonus(attr);
    const total = die + bonus;
    const passed = die === 20 || (die !== 1 && total >= dc);
    ui.lastRoll = { attr, dc, die, bonus, total, passed, label };
    log(`${label || "Check"}: d20 ${die} + ${bonus} ${title(attr)} = ${total} vs DC ${dc}. ${passed ? "Success." : "Failure."}`);
    return passed;
  }

  function setQuest(id, status, stage) {
    if (!DB.quests[id]) return;
    const current = state.quests[id] || {};
    state.quests[id] = {
      status: status || current.status || "active",
      stage: stage || current.stage || DB.quests[id].desc
    };
  }

  function addXP(amount) {
    if (!amount) return;
    state.player.xp += amount;
    const next = state.player.level * 8;
    if (state.player.xp >= next) {
      state.player.xp -= next;
      state.player.level += 1;
      state.player.maxHp += 5;
      state.player.hp = state.player.maxHp;
      log(`${state.player.name} reached level ${state.player.level}.`);
    }
  }

  function discoverLore(id) {
    if (!DB.lore[id]) return;
    if (!state.codex.includes(id)) {
      state.codex.push(id);
      log(`Lore added: ${DB.lore[id].title}.`);
    }
  }

  function recruit(id) {
    const comp = state.companions[id];
    const data = DB.companions[id];
    if (!comp || !data) return;
    if (!comp.recruited) {
      comp.recruited = true;
      state.party.push(id);
      log(`${data.name} joined the party.`);
    }
    setQuest(data.quest, "active", `${data.name}'s personal story has begun.`);
  }

  function applyApproval(changes) {
    if (!changes) return;
    Object.entries(changes).forEach(([id, value]) => {
      if (!state.companions[id]) return;
      state.companions[id].approval = clamp(state.companions[id].approval + value, -10, 10);
      if (Math.abs(value) > 0 && state.companions[id].recruited) {
        log(`${DB.companions[id].name} approval ${value > 0 ? "+" : ""}${value}.`);
      }
    });
  }

  function applyEffects(effects = []) {
    let pendingCombat = null;
    let showEnding = false;
    effects.forEach((effect) => {
      if (effect.flag) state.flags[effect.flag] = true;
      if (effect.unflag) delete state.flags[effect.unflag];
      if (effect.addItem) {
        addItemTo(state, effect.addItem, effect.qty || 1);
        log(`Gained ${effect.qty || 1} ${DB.itemsById[effect.addItem]?.name || effect.addItem}.`);
      }
      if (effect.gold) {
        state.gold = Math.max(0, state.gold + effect.gold);
        log(`${effect.gold > 0 ? "Gained" : "Spent"} ${Math.abs(effect.gold)} gold.`);
      }
      if (effect.supplies) {
        state.supplies = Math.max(0, state.supplies + effect.supplies);
        log(`${effect.supplies > 0 ? "Gained" : "Spent"} ${Math.abs(effect.supplies)} supplies.`);
      }
      if (effect.faction) {
        Object.entries(effect.faction).forEach(([id, value]) => {
          state.faction[id] = clamp((state.faction[id] || 0) + value, -6, 6);
        });
      }
      if (effect.approval) applyApproval(effect.approval);
      if (effect.quest) setQuest(effect.quest.id, effect.quest.status, effect.quest.stage);
      if (effect.lore) discoverLore(effect.lore);
      if (effect.recruit) recruit(effect.recruit);
      if (effect.xp) addXP(effect.xp);
      if (effect.corruption) {
        state.corruption = clamp(state.corruption + effect.corruption, 0, 10);
        log(`Heart-Cinder corruption is now ${state.corruption}.`);
      }
      if (effect.act) state.act = Math.max(state.act, effect.act);
      if (effect.region) state.region = effect.region;
      if (effect.location) {
        const loc = DB.locations[effect.location];
        if (loc) {
          state.location = effect.location;
          state.region = loc.region;
          discoverLore(DB.regions[loc.region].lore);
        }
      }
      if (effect.ending) {
        state.ending = effect.ending;
        setQuest("m06", "completed", `You chose ${DB.endings[effect.ending].name}.`);
      }
      if (effect.viewEnding) showEnding = true;
      if (effect.startCombat) pendingCombat = effect.startCombat;
    });
    if (pendingCombat) startCombat(pendingCombat);
    if (showEnding) ui.view = "ending";
  }

  function meets(condition) {
    if (!condition) return true;
    if (condition.origin && state.player.origin !== condition.origin) return false;
    if (condition.flag && !state.flags[condition.flag]) return false;
    if (condition.notFlag && state.flags[condition.notFlag]) return false;
    if (condition.companion && !state.companions[condition.companion]?.recruited) return false;
    if (condition.quest && state.quests[condition.quest]?.status !== condition.status) return false;
    if (condition.factionMin) {
      for (const [id, min] of Object.entries(condition.factionMin)) {
        if ((state.faction[id] || 0) < min) return false;
      }
    }
    return true;
  }

  function startDialogue(id) {
    if (!DB.dialogues[id]) return;
    ui.dialogue = { id, node: "start" };
    ui.view = "dialogue";
    ui.lastRoll = null;
  }

  function closeDialogue() {
    ui.dialogue = null;
    if (state.ending) ui.view = "ending";
    else ui.view = "explore";
  }

  function chooseDialogue(index) {
    const scene = DB.dialogues[ui.dialogue.id];
    const node = scene.nodes[ui.dialogue.node];
    const choices = node.choices.filter((choice) => meets(choice.condition));
    const choice = choices[index];
    if (!choice) return;
    if (choice.check) {
      const passed = rollCheck(choice.check.attr, choice.check.dc, choice.label.replace(/\s*\[.*\]\s*$/, ""));
      applyEffects(passed ? (choice.check.successEffects || []) : (choice.check.failureEffects || []));
      ui.dialogue.node = passed ? choice.check.success : choice.check.failure;
    } else {
      applyEffects(choice.effects || []);
      if (choice.next) ui.dialogue.node = choice.next;
      if (choice.close) closeDialogue();
    }
    render();
  }

  function currentLocation() {
    return DB.locations[state.location] || DB.locations.ash_beach;
  }

  function unlockedLocations(regionId) {
    return DB.regions[regionId].locations.filter((locId) => {
      const loc = DB.locations[locId];
      if (DB.regions[loc.region].act > state.act) return false;
      if (locId === "heart_chamber" && !state.flags.skybridge_cleared && !state.flags.sentinels_answered && state.location !== "heart_chamber") return false;
      return true;
    });
  }

  function travelTo(locId) {
    const loc = DB.locations[locId];
    if (!loc) return;
    state.location = locId;
    state.region = loc.region;
    discoverLore(DB.regions[loc.region].lore);
    ui.view = "explore";
    log(`Traveled to ${loc.name}.`);
    render();
  }

  function followLead() {
    const sequence = [
      ["took_shard", "ash_beach", "intro_ash_beach"],
      ["cinderfall_witnesses_named", "refugee_stockade", "refugee_stockade"],
      ["witness_bell", "glassreef_bell", "glassreef_bell_scene"],
      ["cinderfall_resolved", "lighthouse_watch", "lighthouse_watch"],
      ["fen_crossed", "fen_crossing", "fen_crossing"],
      ["fen_claim_resolved", "root_tribunal", "root_tribunal"],
      ["weather_vane_aligned", "weather_vane", "weather_vane"],
      ["gate_opened", "blackglass_gate", "blackglass_gate"],
      ["quiet_bell_resolved", "choir_vault", "choir_vault"],
      ["ardent_name_ready", "ardent_gallery", "ardent_gallery"],
      ["avatar_defeated", "heart_chamber", "heart_chamber"]
    ];
    const next = sequence.find(([flag]) => !state.flags[flag]);
    if (next) {
      travelTo(next[1]);
      startDialogue(next[2]);
    } else {
      travelTo("heart_chamber");
      startDialogue("heart_chamber");
    }
    render();
  }

  function searchHere() {
    const loc = currentLocation();
    const key = loc.id;
    if (state.searched[key]) {
      log(`You search ${loc.name} again and find only old ash and your own footprints.`);
      render();
      return;
    }
    state.searched[key] = true;
    const finds = ["healing_draught", "faceless_coin", "silver_reed", "ash_salve", "focus_tea", "old_map_tile", "cleanse_salt", "salt_rook"];
    const found = finds[Math.floor(Math.random() * finds.length)];
    addItemTo(state, found, 1);
    discoverLore(DB.itemsById[found].lore || DB.regions[loc.region].lore);
    log(`You search ${loc.name} and find ${DB.itemsById[found].name}.`);
    render();
  }

  function partyActorTemplates() {
    const mods = equipmentMods();
    const playerAbilities = ["strike", ...DB.archetypesById[state.player.archetype].abilities];
    const templates = [{
      id: "player",
      name: state.player.name,
      side: "party",
      hp: state.player.hp,
      maxHp: state.player.maxHp,
      armor: 1 + mods.armor,
      stats: ATTRS.reduce((acc, attr) => {
        acc[attr] = playerAttr(attr);
        return acc;
      }, {}),
      abilities: playerAbilities
    }];
    state.party.filter((id) => id !== "player").forEach((id) => {
      const comp = DB.companions[id];
      templates.push({
        id,
        name: comp.name,
        side: "party",
        hp: comp.hp,
        maxHp: comp.hp,
        armor: comp.armor,
        stats: comp.stats,
        abilities: comp.abilities
      });
    });
    return templates;
  }

  function terrainFor(kind) {
    const base = Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => ""));
    const paint = (cells, value) => cells.forEach(([x, y]) => { base[y][x] = value; });
    if (kind === "coast") paint([[2, 1], [3, 1], [5, 3]], "ash"), paint([[6, 0], [6, 1], [7, 1]], "water"), paint([[4, 4]], "fire");
    if (kind === "reef") paint([[1, 1], [2, 1], [5, 2]], "high"), paint([[3, 3], [4, 3], [5, 4]], "water"), paint([[6, 1]], "ash");
    if (kind === "fen") paint([[2, 2], [3, 2], [4, 2]], "water"), paint([[5, 1], [5, 2], [6, 3]], "bramble"), paint([[1, 4]], "high");
    if (kind === "market") paint([[3, 1], [3, 2], [4, 2]], "high"), paint([[5, 4]], "fire"), paint([[1, 2]], "ash");
    if (kind === "citadel") paint([[2, 1], [2, 2], [5, 3]], "high"), paint([[4, 1], [4, 2]], "ash"), paint([[6, 4]], "fire");
    if (kind === "heart") paint([[3, 2], [4, 2], [3, 3], [4, 3]], "fire"), paint([[1, 1], [6, 4]], "high"), paint([[2, 4], [5, 1]], "ash");
    return base;
  }

  function makeActor(template, x, y, index) {
    const finesse = template.stats.finesse || 10;
    return {
      ...template,
      uid: `${template.side}_${template.id}_${index}`,
      x,
      y,
      hp: template.hp,
      maxHp: template.maxHp,
      statuses: [],
      usedOnce: {},
      moved: false,
      acted: false,
      initiative: Math.floor(Math.random() * 20) + 1 + attrMod(finesse)
    };
  }

  function startCombat(id) {
    const encounter = DB.encounters[id];
    if (!encounter) return;
    if (state.completedEncounters.includes(id)) {
      log(`${encounter.name} is already resolved.`);
      ui.view = "explore";
      return;
    }
    const party = partyActorTemplates().map((template, index) => makeActor(template, index % 2, 1 + index, index));
    const enemyTemplates = encounter.enemies.map((enemyId) => DB.enemies[enemyId]);
    const foes = enemyTemplates.map((template, index) => makeActor({
      id: template.id,
      name: template.name,
      side: "enemy",
      hp: template.hp,
      maxHp: template.hp,
      armor: template.armor,
      stats: template.stats,
      abilities: template.abilities
    }, 7 - (index % 2), 1 + index, index));
    ui.combat = {
      id,
      round: 1,
      terrain: terrainFor(encounter.terrain),
      actors: [...party, ...foes],
      log: [`${encounter.name} begins.`],
      turn: 0
    };
    ui.combat.actors.sort((a, b) => b.initiative - a.initiative);
    ui.selectedAbility = null;
    ui.dialogue = null;
    ui.view = "combat";
    beginTurn();
  }

  function aliveActors(side) {
    return ui.combat.actors.filter((actor) => actor.side === side && actor.hp > 0);
  }

  function currentActor() {
    if (!ui.combat) return null;
    return ui.combat.actors[ui.combat.turn];
  }

  function combatLog(text) {
    ui.combat.log.unshift(text);
    ui.combat.log = ui.combat.log.slice(0, 12);
    pushFx(text, text.includes("damage") || text.includes("falls") ? "damage" : "note");
  }

  function hasStatus(actor, status) {
    return actor.statuses.some((entry) => entry.id === status);
  }

  function addStatus(actor, status, duration = 2) {
    const existing = actor.statuses.find((entry) => entry.id === status);
    if (existing) existing.duration = Math.max(existing.duration, duration);
    else actor.statuses.push({ id: status, duration });
  }

  function beginTurn() {
    if (!ui.combat) return;
    const actor = currentActor();
    if (!actor || actor.hp <= 0) return nextTurn();
    actor.moved = false;
    actor.acted = false;
    const terrain = ui.combat.terrain[actor.y][actor.x];
    if (terrain === "fire") {
      actor.hp -= 3;
      combatLog(`${actor.name} takes 3 fire terrain damage.`);
    }
    if (hasStatus(actor, "burning")) {
      actor.hp -= 3;
      combatLog(`${actor.name} burns for 3 damage.`);
    }
    if (hasStatus(actor, "poisoned")) {
      actor.hp -= 2;
      combatLog(`${actor.name} suffers 2 poison damage.`);
    }
    actor.statuses.forEach((entry) => { entry.duration -= 1; });
    actor.statuses = actor.statuses.filter((entry) => entry.duration > 0);
    if (!checkCombatEnd() && actor.hp <= 0) nextTurn();
  }

  function nextTurn() {
    if (!ui.combat) return;
    ui.selectedAbility = null;
    ui.combat.turn += 1;
    if (ui.combat.turn >= ui.combat.actors.length) {
      ui.combat.turn = 0;
      ui.combat.round += 1;
    }
    beginTurn();
    render();
  }

  function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function actorAt(x, y) {
    return ui.combat.actors.find((actor) => actor.hp > 0 && actor.x === x && actor.y === y);
  }

  function canMoveTo(actor, x, y) {
    if (actor.moved || hasStatus(actor, "rooted")) return false;
    if (x < 0 || y < 0 || x >= 8 || y >= 6) return false;
    if (actorAt(x, y)) return false;
    const maxMove = ui.combat.terrain[y][x] === "bramble" ? 2 : 3;
    return Math.abs(actor.x - x) + Math.abs(actor.y - y) <= maxMove;
  }

  function moveActor(x, y) {
    const actor = currentActor();
    if (!actor || actor.side !== "party" || !canMoveTo(actor, x, y)) return;
    actor.x = x;
    actor.y = y;
    actor.moved = true;
    combatLog(`${actor.name} moves.`);
    render();
  }

  function selectAbility(id) {
    ui.selectedAbility = id;
    render();
  }

  function abilityDamage(actor, ability) {
    const attr = ability.attr || "might";
    let amount = ability.power + attrMod(actor.stats[attr] || 10);
    if (hasStatus(actor, "inspired")) amount += 2;
    if (ability.type === "damage" && actor.id === "player") amount += equipmentMods().damage || 0;
    return Math.max(1, amount);
  }

  function useAbilityOn(targetUid) {
    const actor = currentActor();
    if (!actor || actor.side !== "party" || actor.acted) return;
    const ability = DB.abilities[ui.selectedAbility];
    const target = ui.combat.actors.find((entry) => entry.uid === targetUid);
    if (!ability || !target || target.hp <= 0) return;
    if (ability.once && actor.usedOnce[ability.id]) {
      combatLog(`${ability.name} is already spent for this encounter.`);
      render();
      return;
    }
    if (ability.target === "enemy" && target.side === actor.side) return;
    if (ability.target === "ally" && target.side !== actor.side) return;
    if (distance(actor, target) > ability.range) return;
    resolveAbility(actor, target, ability);
    actor.acted = true;
    if (ability.once) actor.usedOnce[ability.id] = true;
    checkCombatEnd();
    if (ui.combat) nextTurn();
  }

  function resolveAbility(actor, target, ability) {
    if (ability.type === "heal") {
      const healed = abilityDamage(actor, ability);
      target.hp = Math.min(target.maxHp, target.hp + healed);
      combatLog(`${actor.name} uses ${ability.name}; ${target.name} heals ${healed}.`);
      return;
    }
    if (ability.type === "buff") {
      addStatus(target, ability.status || "guarded", 2);
      combatLog(`${actor.name} uses ${ability.name}; ${target.name} gains ${ability.status || "guarded"}.`);
      return;
    }
    let damage = abilityDamage(actor, ability);
    const terrain = ui.combat.terrain[actor.y][actor.x];
    if (terrain === "high" && ability.range > 1) damage += 2;
    if (hasStatus(target, "guarded")) damage -= 2;
    if (hasStatus(target, "marked")) damage += 2;
    if (hasStatus(actor, "weakened")) damage -= 2;
    damage = Math.max(1, damage - Math.floor(target.armor || 0));
    target.hp -= damage;
    if (ability.status) addStatus(target, ability.status, 2);
    if (ability.selfStatus) addStatus(actor, ability.selfStatus, 2);
    if (state.flags.prepared_ember && actor.side === "party") {
      addStatus(target, "burning", 2);
      delete state.flags.prepared_ember;
    }
    if (state.flags.prepared_bramble && actor.side === "party") {
      addStatus(target, "rooted", 2);
      delete state.flags.prepared_bramble;
    }
    if (state.flags.prepared_shocked && actor.side === "party") {
      addStatus(target, "shocked", 2);
      delete state.flags.prepared_shocked;
    }
    combatLog(`${actor.name} uses ${ability.name} on ${target.name} for ${damage} damage.`);
    if (target.hp <= 0) combatLog(`${target.name} falls.`);
  }

  function enemyTurn() {
    const actor = currentActor();
    if (!actor || actor.side !== "enemy") return;
    const targets = aliveActors("party");
    if (!targets.length) return checkCombatEnd();
    const nearest = targets.slice().sort((a, b) => distance(actor, a) - distance(actor, b))[0];
    const ability = actor.abilities.map((id) => DB.abilities[id]).find((ab) => distance(actor, nearest) <= ab.range) || DB.abilities[actor.abilities[0]];
    if (ability && distance(actor, nearest) <= ability.range) {
      resolveAbility(actor, nearest, ability);
      actor.acted = true;
    } else {
      const dx = Math.sign(nearest.x - actor.x);
      const dy = Math.sign(nearest.y - actor.y);
      const options = [
        [actor.x + dx, actor.y],
        [actor.x, actor.y + dy],
        [actor.x + dx, actor.y + dy]
      ];
      const move = options.find(([x, y]) => x >= 0 && y >= 0 && x < 8 && y < 6 && !actorAt(x, y));
      if (move) {
        actor.x = move[0];
        actor.y = move[1];
        combatLog(`${actor.name} advances.`);
      } else {
        combatLog(`${actor.name} waits for an opening.`);
      }
    }
    checkCombatEnd();
    if (ui.combat) nextTurn();
  }

  function checkCombatEnd() {
    if (!ui.combat) return false;
    if (aliveActors("enemy").length === 0) {
      winCombat();
      return true;
    }
    if (aliveActors("party").length === 0) {
      loseCombat();
      return true;
    }
    return false;
  }

  function winCombat() {
    const combat = ui.combat;
    const encounter = DB.encounters[combat.id];
    state.completedEncounters.push(combat.id);
    combat.actors.filter((actor) => actor.side === "party").forEach((actor) => {
      if (actor.id === "player") {
        state.player.hp = Math.max(1, actor.hp);
      }
    });
    encounter.loot.forEach((itemId) => addItemTo(state, itemId, 1));
    encounter.winFlags.forEach((flag) => { state.flags[flag] = true; });
    if (encounter.quest) setQuest(encounter.quest.id, encounter.quest.status, encounter.quest.stage);
    addXP(encounter.xp);
    log(`Won ${encounter.name}. Loot: ${encounter.loot.map((id) => DB.itemsById[id].name).join(", ")}.`);
    ui.combat = null;
    ui.selectedAbility = null;
    ui.view = "explore";
    if (combat.id === "final_avatar") {
      state.location = "heart_chamber";
      startDialogue("heart_chamber");
    }
    render();
  }

  function loseCombat() {
    const encounter = DB.encounters[ui.combat.id];
    state.player.hp = Math.max(1, Math.floor(state.player.maxHp / 2));
    state.supplies = Math.max(0, state.supplies - 1);
    state.corruption = clamp(state.corruption + 1, 0, 10);
    log(`Lost ${encounter.name}. The party wakes at camp injured and changed.`);
    ui.combat = null;
    ui.selectedAbility = null;
    ui.view = "camp";
    render();
  }

  function restCamp() {
    state.day += 1;
    if (state.supplies > 0) state.supplies -= 1;
    state.player.hp = state.player.maxHp;
    state.player.tempBuffs = {};
    log(`Camp rest complete. Day ${state.day}.`);
    render();
  }

  function useItem(itemId) {
    const item = DB.itemsById[itemId];
    if (!item) return;
    if (item.type === "equipment") {
      state.equipment[item.slot] = itemId;
      log(`Equipped ${item.name}.`);
    } else if (item.type === "consumable") {
      if (item.heal) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.heal);
        log(`${item.name} restores ${item.heal} health.`);
      }
      if (item.buff) {
        Object.entries(item.buff).forEach(([attr, value]) => {
          state.player.tempBuffs[attr] = (state.player.tempBuffs[attr] || 0) + value;
        });
        log(`${item.name} grants a temporary edge.`);
      }
      if (item.prep) {
        state.flags[`prepared_${item.prep}`] = true;
        log(`${item.name} is prepared for the next battle.`);
      }
      if (item.remove) {
        log(`${item.name} clears ${item.remove} from the party if present.`);
      }
      removeItem(itemId, 1);
    } else if (item.type === "curio") {
      discoverLore(item.lore);
      log(`Studied ${item.name}.`);
    } else {
      log(`${item.name}: ${item.desc}`);
    }
    render();
  }

  function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    ui.saveText = JSON.stringify(state, null, 2);
    log("Campaign saved to this browser.");
    render();
  }

  function loadGame(raw = localStorage.getItem(SAVE_KEY)) {
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.started) throw new Error("Invalid save.");
      state = parsed;
      ui.view = "explore";
      ui.dialogue = null;
      ui.combat = null;
      ui.message = "Campaign loaded.";
      return true;
    } catch (error) {
      ui.message = `Could not load save: ${error.message}`;
      return false;
    }
  }

  function exportSave() {
    ui.saveText = JSON.stringify(state, null, 2);
    render();
  }

  function importSave() {
    loadGame(ui.importText);
    render();
  }

  function newGameFromBuilder() {
    const builder = ui.builder;
    state = createState(builder);
    ui.view = "explore";
    ui.dialogue = null;
    ui.combat = null;
    ui.message = "";
    render();
  }

  function adjustBuilderAttr(attr, delta) {
    const builder = ui.builder;
    if (delta > 0 && builder.points <= 0) return;
    if (delta < 0 && builder.attrs[attr] <= 8) return;
    if (delta > 0 && builder.attrs[attr] >= 16) return;
    builder.attrs[attr] += delta;
    builder.points -= delta;
    render();
  }

  function approvalTier(value) {
    if (value >= 7) return "Devoted";
    if (value >= 3) return "Warm";
    if (value <= -5) return "Alienated";
    if (value <= -1) return "Wary";
    return "Measured";
  }

  function relationshipEpilogue(id) {
    const comp = DB.companions[id];
    const st = state.companions[id];
    if (!st.recruited) return `${comp.name} never joined your covenant, and their road bent away from the songs that followed.`;
    if (st.approval >= 6) return comp.epilogues.high;
    if (st.approval <= -3) return comp.epilogues.low;
    return comp.epilogues.mid;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function button(label, action, cls = "") {
    return `<button class="${cls}" data-action="${action}">${label}</button>`;
  }

  function initials(name) {
    return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }

  function portraitClass(id) {
    const key = id === "player" ? (state?.player?.style || ui.builder?.style || "embermark") : id;
    return `portrait-${key}`;
  }

  function compactText(text, limit = 190) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length <= limit) return clean;
    return `${clean.slice(0, limit - 1).trim()}...`;
  }

  function iconLabel(icon) {
    const labels = {
      crater: "C",
      palisade: "P",
      market: "$",
      banner: "!",
      bell: "B",
      lens: "L",
      stones: "S",
      huts: "H",
      spores: "*",
      road: "R",
      roots: "T",
      vane: "V",
      gate: "G",
      press: "#",
      choir: "Q",
      bridge: "=",
      blade: "/",
      heart: "H"
    };
    return labels[icon] || "?";
  }

  function locationPoint(id) {
    return worldLayouts[DB.locations[id].region]?.points[id] || { x: 50, y: 50, icon: "?" };
  }

  function renderFx() {
    if (!ui.fx.length) return "";
    return `<div class="fx-layer">${ui.fx.slice(0, 3).map((fx, index) => `<span class="float-fx ${fx.type}" style="--fx-i:${index}">${escapeHtml(compactText(fx.text, 52))}</span>`).join("")}</div>`;
  }

  function renderRegionPaths(regionId) {
    const layout = worldLayouts[regionId];
    if (!layout) return "";
    const lines = layout.paths.map(([from, to]) => {
      if (!unlockedLocations(regionId).includes(from) || !unlockedLocations(regionId).includes(to)) return "";
      const a = layout.points[from];
      const b = layout.points[to];
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
    }).join("");
    return `<svg class="world-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`;
  }

  function renderPartyTokensOnMap() {
    const point = locationPoint(state.location);
    return `<div class="map-party-stack" style="left:${point.x}%; top:${point.y}%">
      ${state.party.slice(0, 4).map((id, index) => {
        const name = id === "player" ? state.player.name : DB.companions[id].name;
        return `<span class="mini-token ${portraitClass(id)}" style="--token-i:${index}" title="${escapeHtml(name)}">${initials(name)}</span>`;
      }).join("")}
    </div>`;
  }

  function renderLocationMarker(locId) {
    const loc = DB.locations[locId];
    const point = locationPoint(locId);
    const active = locId === state.location;
    const danger = loc.encounter && !state.completedEncounters.includes(loc.encounter);
    return `<button class="hotspot ${active ? "active" : ""} ${danger ? "danger" : ""}" style="left:${point.x}%; top:${point.y}%" data-action="hotspot" data-id="${locId}">
      <span class="hotspot-icon">${iconLabel(point.icon)}</span>
      <span class="hotspot-name">${loc.name}</span>
    </button>`;
  }

  function renderWorldStage(mode = "explore") {
    const region = DB.regions[state.region];
    const loc = currentLocation();
    const locIds = unlockedLocations(state.region);
    return `
      <div class="world-stage ${worldLayouts[state.region]?.tone || "coast"} ${mode}">
        <div class="world-header">
          <div>
            <h2>${region.name}</h2>
            <p>${compactText(region.desc, 120)}</p>
          </div>
          <button class="primary" data-action="followLead">Lead</button>
        </div>
        <div class="world-board" role="application" aria-label="${region.name} exploration board">
          ${renderRegionPaths(state.region)}
          ${locIds.map(renderLocationMarker).join("")}
          ${renderPartyTokensOnMap()}
          ${renderFx()}
          <div class="current-location-card">
            <strong>${loc.name}</strong>
            <span>${compactText(loc.desc, 115)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderActionDock() {
    const loc = currentLocation();
    const encounterDone = !loc.encounter || state.completedEncounters.includes(loc.encounter);
    return `
      <div class="action-dock">
        <div class="dock-copy">
          <span class="eyebrow">${DB.regions[loc.region].name}</span>
          <strong>${loc.name}</strong>
          <span>${compactText(loc.desc, 145)}</span>
        </div>
        <div class="dock-actions">
          <button data-action="scene" class="primary"><span class="btn-icon">?</span> Talk</button>
          ${loc.encounter && !encounterDone ? `<button data-action="encounter"><span class="btn-icon">x</span> Fight</button>` : ""}
          <button data-action="search"><span class="btn-icon">*</span> Search</button>
          <button data-action="campHere"><span class="btn-icon">^</span> Camp</button>
        </div>
      </div>
    `;
  }

  function renderPartySidebar() {
    const members = state.party.map((id) => {
      if (id === "player") {
        return {
          id,
          name: state.player.name,
          role: DB.archetypesById[state.player.archetype].name,
          hp: state.player.hp,
          maxHp: state.player.maxHp,
          approval: "Lead",
          status: state.corruption >= 4 ? "Cinder-touched" : "Ready"
        };
      }
      const comp = DB.companions[id];
      const st = state.companions[id];
      return {
        id,
        name: comp.name,
        role: comp.role,
        hp: comp.hp,
        maxHp: comp.hp,
        approval: `${approvalTier(st.approval)} ${st.approval}`,
        status: st.campSeen ? "Scene seen" : "Wants camp"
      };
    });
    return `
      <aside class="party-sidebar">
        <h3>Party</h3>
        <div class="party-stack">
          ${members.map((member) => `<div class="party-card ${member.id === "player" ? "lead" : ""}">
            <div class="portrait ${portraitClass(member.id)}">${initials(member.name)}</div>
            <div class="party-card-body">
              <strong>${member.name}</strong>
              <span>${member.role}</span>
              <div class="hp-track"><span style="width:${Math.max(5, (member.hp / member.maxHp) * 100)}%"></span></div>
              <small>${member.hp}/${member.maxHp} HP - ${member.approval}</small>
            </div>
            <span class="status-dot" title="${escapeHtml(member.status)}"></span>
          </div>`).join("")}
        </div>
        <div class="sidebar-factions">
          ${Object.values(DB.factions).map((f) => `<span class="chip ${f.color}">${f.name}: ${state.faction[f.id]}</span>`).join("")}
        </div>
      </aside>
    `;
  }

  function render() {
    const app = document.getElementById("app");
    if (!state || !state.started || ui.view === "start") {
      app.innerHTML = renderStart();
      wire();
      return;
    }
    app.innerHTML = `
      <div class="app">
        ${renderTopbar()}
        ${renderNav()}
        <main class="visual-layout">
          ${renderPartySidebar()}
          <section class="play-surface">${renderMain()}</section>
        </main>
      </div>
    `;
    wire();
  }

  function renderStart() {
    if (!ui.builder) ui.builder = freshBuilder();
    const b = ui.builder;
    const origin = DB.originsById[b.origin];
    const arch = DB.archetypesById[b.archetype];
    const style = DB.stylesById[b.style];
    return `
      <div class="hero-entry">
        <div class="entry-grid">
          <section class="panel pad creation-preview">
            <h1 class="title-mark">Ashfall Covenant</h1>
            <div class="hero-token portrait ${portraitClass("player")}">${initials(b.name || "Cinder")}</div>
            <div class="creation-loadout">
              <span class="chip">${origin.name}</span>
              <span class="chip warn">${arch.name}</span>
              <span class="chip">${style.name}</span>
            </div>
            <div class="mini-world-preview">
              <span class="mini-path"></span>
              <span class="mini-node active">C</span>
              <span class="mini-node">P</span>
              <span class="mini-node danger">!</span>
              <span class="mini-party portrait ${portraitClass("player")}">${initials(b.name || "Cinder")}</span>
            </div>
            <p class="scene-text">Pick a look, origin, and combat kit. The first click after creation drops your party onto a playable region map.</p>
            <div class="button-row" style="margin-top:1rem">
              ${localStorage.getItem(SAVE_KEY) ? button("Continue Saved Campaign", "continue", "primary") : ""}
              ${button("New Game", "focusName", "ghost")}
            </div>
            ${ui.message ? `<p class="muted">${escapeHtml(ui.message)}</p>` : ""}
          </section>
          <section class="panel pad creator">
            <div class="screen-title">
              <div>
                <h2>Create Your Covenant-Bearer</h2>
                <p class="muted tiny">Choose identity first; the game begins immediately after creation.</p>
              </div>
              <span class="chip warn">${b.points} points</span>
            </div>
            <label>Name <input id="nameInput" value="${escapeHtml(b.name)}" maxlength="24"></label>
            <div class="grid two">
              <div>
                <h3>Origin</h3>
                <div class="choice-list">${DB.origins.map((o) => `<button class="choice-button ${b.origin === o.id ? "selected" : ""}" data-action="pickOrigin" data-id="${o.id}"><strong>${o.name}</strong><span>${o.desc}</span></button>`).join("")}</div>
              </div>
              <div>
                <h3>Archetype</h3>
                <div class="choice-list">${DB.archetypes.map((a) => `<button class="choice-button ${b.archetype === a.id ? "selected" : ""}" data-action="pickArchetype" data-id="${a.id}"><strong>${a.name}</strong><span>${a.desc}</span></button>`).join("")}</div>
              </div>
            </div>
            <div>
              <h3>Attributes</h3>
              <div class="grid two">${ATTRS.map((attr) => `
                <div class="stat-row">
                  <strong>${title(attr)}</strong>
                  <div class="bar"><span style="width:${((b.attrs[attr] - 8) / 8) * 100}%"></span></div>
                  <span>${b.attrs[attr]}</span>
                  <button class="slim" data-action="attrDown" data-id="${attr}">-</button>
                  <button class="slim" data-action="attrUp" data-id="${attr}">+</button>
                </div>
              `).join("")}</div>
            </div>
            <div>
              <h3>Visual Style</h3>
              <div class="grid three">${DB.styles.map((s) => `<button class="choice-button ${b.style === s.id ? "selected" : ""}" data-action="pickStyle" data-id="${s.id}"><strong>${s.name}</strong><span>${s.desc}</span></button>`).join("")}</div>
            </div>
            <div class="card">
              <strong>${origin.name} ${arch.name}</strong>
              <p>${origin.hook}</p>
              <p class="muted">${style.desc}</p>
            </div>
            ${button("Begin at the Ash Beach", "beginGame", "primary")}
          </section>
        </div>
      </div>
    `;
  }

  function renderTopbar() {
    const loc = currentLocation();
    return `
      <header class="topbar">
        <div class="brand">
          <h1>Ashfall Covenant</h1>
          <span class="subtle">Act ${state.act} - ${DB.regions[state.region].name} - ${loc.name}</span>
        </div>
        <div class="status-row">
          <span class="chip">Day ${state.day}</span>
          <span class="chip">Level ${state.player.level}</span>
          <span class="chip">HP ${state.player.hp}/${state.player.maxHp}</span>
          <span class="chip">Gold ${state.gold}</span>
          <span class="chip">Supplies ${state.supplies}</span>
          <span class="chip ${state.corruption >= 4 ? "bad" : "warn"}">Cinder ${state.corruption}</span>
        </div>
      </header>
    `;
  }

  function renderNav() {
    if (ui.combat) {
      return `<nav class="nav-row"><button class="slim selected" data-action="view" data-id="combat">Combat</button><button class="slim" data-action="view" data-id="save">Save</button></nav>`;
    }
    const views = [
      ["explore", "Explore", "@@"],
      ["map", "Map", "[]"],
      ["journal", "Journal", "!!"],
      ["inventory", "Inventory", "##"],
      ["relationships", "Party", "**"],
      ["lore", "Lore", "::"],
      ["camp", "Camp", "^^"],
      ["save", "Save", "=>"]
    ];
    return `<nav class="nav-row">${views.map(([view, label, icon]) => `<button class="slim nav-btn ${ui.view === view ? "selected" : ""}" data-action="view" data-id="${view}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
  }

  function renderMain() {
    if (ui.view === "dialogue") return renderDialogue();
    if (ui.view === "combat") return renderCombat();
    if (ui.view === "map") return renderMap();
    if (ui.view === "journal") return renderJournal();
    if (ui.view === "inventory") return renderInventory();
    if (ui.view === "relationships") return renderRelationships();
    if (ui.view === "lore") return renderLore();
    if (ui.view === "camp") return renderCamp();
    if (ui.view === "save") return renderSave();
    if (ui.view === "ending") return renderEnding();
    return renderExplore();
  }

  function renderExplore() {
    return `
      ${renderWorldStage("explore")}
      ${renderActionDock()}
    `;
  }

  function renderDialogue() {
    const scene = DB.dialogues[ui.dialogue.id];
    const node = scene.nodes[ui.dialogue.node];
    const choices = node.choices.filter((choice) => meets(choice.condition));
    return `
      ${renderWorldStage("dialogue")}
      <div class="dialogue-dock">
        <div class="speaker-portrait portrait portrait-${scene.speaker.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${initials(scene.speaker)}</div>
        <div class="dialogue-body">
          <div class="dialogue-heading">
            <div><span class="eyebrow">${scene.title}</span><strong>${scene.speaker}</strong></div>
            <button data-action="closeDialogue" class="slim">Leave</button>
          </div>
          <p>${compactText(node.text, 260)}</p>
          ${ui.lastRoll ? `<div class="roll-box compact"><strong>${ui.lastRoll.passed ? "Success" : "Failure"}:</strong> d20 ${ui.lastRoll.die} + ${ui.lastRoll.bonus} ${title(ui.lastRoll.attr)} = ${ui.lastRoll.total} vs DC ${ui.lastRoll.dc}</div>` : ""}
          <div class="dialogue-choices">
            ${choices.map((choice, index) => `<button class="choice-button" data-action="dialogueChoice" data-id="${index}">${choice.label}${choice.check ? `<span class="muted"><br>Roll: d20 + ${title(choice.check.attr)} vs DC ${choice.check.dc}</span>` : ""}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderMap() {
    return `
      <div class="screen-title"><h2>Map</h2><button data-action="followLead" class="primary">Follow Lead</button></div>
      <div class="grid three">
        ${Object.values(DB.regions).map((region) => `
          <div class="card ${state.region === region.id ? "active" : ""}">
            <h3>${region.name}</h3>
            <p>${region.desc}</p>
            <div class="choice-list">
              ${unlockedLocations(region.id).map((locId) => `<button class="choice-button ${state.location === locId ? "selected" : ""}" data-action="travel" data-id="${locId}"><strong>${DB.locations[locId].name}</strong><span>${DB.locations[locId].desc}</span></button>`).join("") || `<p class="muted">Reach Act ${region.act} to reveal this region.</p>`}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderJournal() {
    const rows = Object.entries(DB.quests).map(([id, quest]) => {
      const progress = state.quests[id];
      const status = progress?.status || "unknown";
      const label = status === "unknown" ? "Rumored" : status[0].toUpperCase() + status.slice(1);
      return `
        <div class="card quest-row">
          <div>
            <h3>${quest.title}</h3>
            <p class="muted">${quest.type} - Act ${quest.act} - ${label}</p>
            <p>${progress?.stage || quest.desc}</p>
          </div>
          <span class="chip ${status === "completed" ? "good" : status === "active" ? "warn" : ""}">${label}</span>
        </div>
      `;
    }).join("");
    return `<div class="screen-title"><h2>Journal</h2><span class="chip">${Object.keys(DB.quests).length} quests</span></div><div class="grid">${rows}</div>`;
  }

  function renderInventory() {
    const equipment = Object.entries(state.equipment).map(([slot, itemId]) => `<span class="chip">${slot}: ${itemId ? DB.itemsById[itemId].name : "Empty"}</span>`).join("");
    const inv = state.inventory.map((entry) => {
      const item = DB.itemsById[entry.id];
      return `
        <div class="card inventory-row">
          <div>
            <h3>${item.name} ${entry.qty > 1 ? `x${entry.qty}` : ""}</h3>
            <p class="muted">${item.type}${item.slot ? ` - ${item.slot}` : ""}</p>
            <p>${item.desc}</p>
          </div>
          <button data-action="useItem" data-id="${item.id}">${item.type === "equipment" ? "Equip" : item.type === "consumable" ? "Use" : item.type === "curio" ? "Study" : "Inspect"}</button>
        </div>
      `;
    }).join("");
    return `<div class="screen-title"><h2>Inventory</h2><div class="chip-row">${equipment}</div></div><div class="grid">${inv || `<p class="muted">Your pack is empty.</p>`}</div>`;
  }

  function renderRelationships() {
    const rows = Object.values(DB.companions).map((comp) => {
      const st = state.companions[comp.id];
      return `
        <div class="card relation-row">
          <div>
            <h3>${comp.name}</h3>
            <p class="muted">${comp.role} - ${st.recruited ? "Recruited" : "Not recruited"} - ${approvalTier(st.approval)} (${st.approval})</p>
            <p>${comp.personality}</p>
            <p><strong>Likes:</strong> ${comp.likes}</p>
            <p><strong>Dislikes:</strong> ${comp.dislikes}</p>
            <p><strong>Secret:</strong> ${state.codex.includes(`${comp.id}_secret`) || state.flags[`${comp.id}_secret_revealed`] ? comp.secret : "Unknown."}</p>
          </div>
          ${st.recruited ? `<button data-action="campScene" data-id="${comp.id}">Camp Scene</button>` : `<button data-action="findCompanion" data-id="${comp.id}">Find Lead</button>`}
        </div>
      `;
    }).join("");
    return `<div class="screen-title"><h2>Relationships</h2><span class="chip">${state.party.length} in party</span></div><div class="grid">${rows}</div>`;
  }

  function renderLore() {
    return `
      <div class="screen-title"><h2>Lore Codex</h2><span class="chip">${state.codex.length}/${Object.keys(DB.lore).length}</span></div>
      <div class="grid two">
        ${state.codex.map((id) => {
          const entry = DB.lore[id];
          return `<div class="card"><h3>${entry.title}</h3><p>${entry.text}</p></div>`;
        }).join("")}
      </div>
    `;
  }

  function renderCamp() {
    const recruited = Object.values(DB.companions).filter((comp) => state.companions[comp.id].recruited);
    return `
      <div class="screen-title">
        <div><h2>Camp</h2><p class="muted">Rest, recover, and let companions speak when the road stops shouting.</p></div>
        <button data-action="rest" class="primary">Rest</button>
      </div>
      <div class="grid two">
        <div class="card">
          <h3>Campfire</h3>
          <p>Rest restores health, clears temporary buffs, advances the day, and spends 1 supply when available.</p>
          <p class="muted">Current supplies: ${state.supplies}</p>
          <div class="button-row">${button("Rest Until Dawn", "rest", "primary")}${button("Return to Road", "explore")}</div>
        </div>
        <div class="card">
          <h3>Companion Scenes</h3>
          <div class="choice-list">
            ${recruited.map((comp) => `<button class="choice-button" data-action="campScene" data-id="${comp.id}"><strong>${comp.name}</strong><span>${state.companions[comp.id].campSeen ? "Revisit the conversation." : "A personal scene is ready."}</span></button>`).join("") || `<p class="muted">Recruit companions to unlock camp scenes.</p>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderSave() {
    return `
      <div class="screen-title"><h2>Save / Load</h2><button data-action="saveGame" class="primary">Save Campaign</button></div>
      <div class="grid two">
        <div class="card">
          <h3>Local Save</h3>
          <p>Stores the campaign in this browser's localStorage.</p>
          <div class="button-row">${button("Save Campaign", "saveGame", "primary")}${button("Load Browser Save", "loadGame")}${button("Export Save", "exportSave")}</div>
          <textarea readonly>${escapeHtml(ui.saveText)}</textarea>
        </div>
        <div class="card">
          <h3>Import Save</h3>
          <p>Paste exported JSON here and import it.</p>
          <textarea id="importText">${escapeHtml(ui.importText)}</textarea>
          ${button("Import Save", "importSave", "primary")}
        </div>
      </div>
    `;
  }

  function renderEnding() {
    const ending = DB.endings[state.ending] || DB.endings.ashfall_silence;
    const factionNotes = Object.values(DB.factions).map((f) => `${f.name}: ${state.faction[f.id]}`).join(" | ");
    return `
      <div class="panel pad ending">
        <h2>${ending.name}</h2>
        <p class="scene-text">${ending.text}</p>
        <p class="muted">${factionNotes}</p>
        <h3>Companion Epilogues</h3>
        <div class="grid">
          ${Object.keys(DB.companions).map((id) => `<div class="card"><h3>${DB.companions[id].name}</h3><p>${relationshipEpilogue(id)}</p></div>`).join("")}
        </div>
        <div class="button-row" style="margin-top:1rem">${button("Save This Ending", "saveGame", "primary")}${button("Return to Map", "map")}</div>
      </div>
    `;
  }

  function renderCombat() {
    const combat = ui.combat;
    const actor = currentActor();
    if (!combat || !actor) return `<p>Combat has ended.</p>`;
    const selected = DB.abilities[ui.selectedAbility];
    const cells = [];
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const occupant = actorAt(x, y);
        const terrain = combat.terrain[y][x];
        const reachable = actor.side === "party" && ui.selectedAbility === "move" && canMoveTo(actor, x, y);
        const targetable = actor.side === "party" && selected && occupant && distance(actor, occupant) <= selected.range && ((selected.target === "enemy" && occupant.side !== actor.side) || (selected.target === "ally" && occupant.side === actor.side));
        const activeUnit = occupant?.uid === actor.uid;
        cells.push(`
          <button class="cell ${terrain} ${reachable ? "reachable" : ""} ${targetable ? "targetable" : ""} ${activeUnit ? "active-unit-cell" : ""}" data-action="${reachable ? "moveCell" : targetable ? "targetCell" : "cell"}" data-x="${x}" data-y="${y}" data-id="${occupant?.uid || ""}">
            ${occupant ? `<span class="actor-token ${occupant.side} ${activeUnit ? "active" : ""}">${initials(occupant.name)}<small>${Math.max(0, occupant.hp)}/${occupant.maxHp}</small></span>` : ""}
            ${terrain ? `<span class="terrain-label">${terrain}</span>` : ""}
          </button>
        `);
      }
    }
    const abilityButtons = actor.abilities.map((id) => {
      const ab = DB.abilities[id];
      const spent = ab.once && actor.usedOnce[ab.id];
      if (spent) return `<div class="spent-ability"><strong>${ab.name}</strong><span>Spent for this encounter.</span></div>`;
      return `<button class="choice-button ${ui.selectedAbility === id ? "selected" : ""}" data-action="ability" data-id="${id}"><strong>${ab.name}</strong><span>${ab.desc} Range ${ab.range}.</span></button>`;
    }).join("");
    return `
      <div class="combat-screen">
        <div class="screen-title">
          <div><h2>${DB.encounters[combat.id].name}</h2><p class="muted">Round ${combat.round} - active unit selected</p></div>
          <span class="chip">${aliveActors("party").length} allies / ${aliveActors("enemy").length} enemies</span>
        </div>
        <div class="turn-order">
          ${combat.actors.filter((entry) => entry.hp > 0).map((entry) => `<span class="turn-chip ${entry.uid === actor.uid ? "active" : ""} ${entry.side}">${initials(entry.name)} ${entry.name}</span>`).join("")}
        </div>
        <div class="combat-arena">
          <div class="combat-board-wrap">
            <div class="combat-grid">${cells.join("")}</div>
            ${renderFx()}
          </div>
          <div class="command-panel">
            <h3>${actor.name}</h3>
            <p class="muted">${actor.side === "party" ? "Choose movement or an ability, then click a highlighted tile or target." : "Enemy intent is visible before it resolves."}</p>
            ${actor.side === "party" ? `
              <div class="choice-list">
                <button class="choice-button ${ui.selectedAbility === "move" ? "selected" : ""}" data-action="ability" data-id="move"><strong>Move</strong><span>Move up to 3 tiles, or 2 into bramble. Rooted actors cannot move.</span></button>
                ${abilityButtons}
                <button class="choice-button" data-action="waitTurn"><strong>Wait</strong><span>End this actor's turn.</span></button>
              </div>
            ` : `
              <p>${actor.name} is deciding how to ruin your day.</p>
              ${button("Resolve Enemy Turn", "enemyTurn", "primary")}
            `}
          </div>
          <div class="combat-log-panel">
            <h3>Combat Log</h3>
            <div class="log-list">${combat.log.map((line) => `<div class="log-entry">${escapeHtml(line)}</div>`).join("")}</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderSidebar() {
    const mods = equipmentMods();
    const factionChips = Object.values(DB.factions).map((f) => `<span class="chip ${f.color}">${f.name}: ${state.faction[f.id]}</span>`).join("");
    const party = state.party.map((id) => id === "player" ? state.player.name : DB.companions[id].name).join(", ");
    return `
      <h3>${state.player.name}</h3>
      <p class="muted">${DB.originsById[state.player.origin].name} ${DB.archetypesById[state.player.archetype].name}</p>
      <div class="grid two">
        ${ATTRS.map((attr) => `<div class="card"><strong>${title(attr)}</strong><br>${playerAttr(attr)} <span class="muted">(${attrMod(playerAttr(attr)) >= 0 ? "+" : ""}${attrMod(playerAttr(attr))})</span></div>`).join("")}
      </div>
      <h3 style="margin-top:1rem">Party</h3>
      <p>${party}</p>
      <h3>Factions</h3>
      <div class="chip-row">${factionChips}</div>
      <h3 style="margin-top:1rem">Chronicle</h3>
      <div class="log-list">${state.chronicle.slice(0, 10).map((entry) => `<div class="log-entry"><span class="muted">D${entry.day} A${entry.act}</span> ${escapeHtml(entry.text)}</div>`).join("")}</div>
    `;
  }

  function findCompanion(id) {
    const lead = {
      nyra: ["ash_beach", "intro_ash_beach"],
      pell: ["salt_market", "salt_market"],
      sable: ["reed_village", "reed_village"],
      oryn: ["choir_vault", "choir_vault"],
      vex: ["ardent_gallery", "ardent_gallery"]
    }[id];
    if (!lead) return;
    travelTo(lead[0]);
    startDialogue(lead[1]);
    render();
  }

  function wire() {
    document.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => {
        const action = el.dataset.action;
        const id = el.dataset.id;
        if (action === "continue") { loadGame(); render(); }
        if (action === "focusName") document.getElementById("nameInput")?.focus();
        if (action === "pickOrigin") { ui.builder.origin = id; render(); }
        if (action === "pickArchetype") { ui.builder.archetype = id; render(); }
        if (action === "pickStyle") { ui.builder.style = id; render(); }
        if (action === "attrUp") adjustBuilderAttr(id, 1);
        if (action === "attrDown") adjustBuilderAttr(id, -1);
        if (action === "beginGame") newGameFromBuilder();
        if (action === "view") { ui.view = id; render(); }
        if (action === "explore") { ui.view = "explore"; render(); }
        if (action === "map") { ui.view = "map"; render(); }
        if (action === "scene") startDialogue(currentLocation().scene), render();
        if (action === "encounter") startCombat(currentLocation().encounter), render();
        if (action === "search") searchHere();
        if (action === "campHere") { ui.view = "camp"; render(); }
        if (action === "travel") travelTo(id);
        if (action === "hotspot") {
          if (id === state.location) startDialogue(currentLocation().scene), render();
          else travelTo(id);
        }
        if (action === "followLead") followLead();
        if (action === "closeDialogue") closeDialogue(), render();
        if (action === "dialogueChoice") chooseDialogue(Number(id));
        if (action === "useItem") useItem(id);
        if (action === "campScene") {
          state.companions[id].campSeen = true;
          startDialogue(DB.companions[id].campScene);
          render();
        }
        if (action === "findCompanion") findCompanion(id);
        if (action === "rest") restCamp();
        if (action === "saveGame") saveGame();
        if (action === "loadGame") { loadGame(); render(); }
        if (action === "exportSave") exportSave();
        if (action === "importSave") importSave();
        if (action === "ability") selectAbility(id);
        if (action === "moveCell") moveActor(Number(el.dataset.x), Number(el.dataset.y));
        if (action === "targetCell") useAbilityOn(el.dataset.id);
        if (action === "waitTurn") nextTurn();
        if (action === "enemyTurn") enemyTurn();
      });
    });
    const nameInput = document.getElementById("nameInput");
    if (nameInput) {
      nameInput.addEventListener("input", (event) => { ui.builder.name = event.target.value; });
    }
    const importText = document.getElementById("importText");
    if (importText) {
      importText.addEventListener("input", (event) => { ui.importText = event.target.value; });
    }
  }

  function boot() {
    ui.builder = freshBuilder();
    state = { started: false };
    window.Ashfall = {
      DB,
      getState: () => state,
      getDebug: () => ({ view: ui.view, combat: ui.combat, selectedAbility: ui.selectedAbility }),
      setView: (view) => { ui.view = view; render(); },
      startDialogue,
      startCombat,
      saveGame,
      loadGame,
      newGame: () => { state = createState(freshBuilder()); ui.view = "explore"; render(); },
      criticalPath: () => {
        state = createState(freshBuilder());
        ["nyra", "pell", "sable", "oryn", "vex"].forEach(recruit);
        ["shared_covenant_known", "cinderfall_resolved", "fen_claim_resolved", "weather_vane_aligned", "gate_opened", "gate_opened_clean", "quiet_bell_resolved", "ardent_name_ready", "avatar_defeated"].forEach((flag) => { state.flags[flag] = true; });
        state.act = 3;
        state.region = "blackglass";
        state.location = "heart_chamber";
        setQuest("m06", "active", "The Heart-Cinder is listening.");
        ui.view = "explore";
        render();
      }
    };
    render();
  }

  boot();
})();
