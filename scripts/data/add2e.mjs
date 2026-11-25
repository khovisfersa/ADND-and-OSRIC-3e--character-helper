import { ALIGNMENTS, GOOD, NEUTRALISH, SLOTS, THACO_2E, scores } from './shared.mjs';

const WIZARD_FOLDERS = 'magic|illusion|wizard|mage';
const WARRIOR = {
    group: 'warrior', warrior: true, hd: 10, hdLevels: 9, hpAfter: 3, max: 20, prof: { start: 4, every: 3, penalty: -2 },
    nwp: { start: 3, every: 3 }, gold: '5d4*10', nwpGroups: ['general', 'warrior'], armor: 'any', shields: 'any', weapons: 'any',
};
const PRIEST = {
    group: 'priest', hd: 8, hdLevels: 9, hpAfter: 2, max: 20, prof: { start: 2, every: 4, penalty: -3 },
    nwp: { start: 4, every: 3 }, gold: '3d6*10', nwpGroups: ['general', 'priest'], shields: 'any',
};
const WIZARD = {
    group: 'wizard', matrix: 'magic-user', hd: 4, hdLevels: 10, hpAfter: 1, max: 20, prof: { start: 1, every: 6, penalty: -5 },
    nwp: { start: 4, every: 3 }, gold: '(1d4+1)*10', nwpGroups: ['general', 'wizard'], slots: { arcane: SLOTS.wizard }, prime: ['int'],
    spellFolder: WIZARD_FOLDERS, startSpells: 6, requiredSpells: ['Read Magic', 'Detect Magic'],
    xp: [2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000, 375000, 750000], xpAfter: 375000,
    armor: 'none', shields: 'none', weapons: 'dagger|dart|knife|sling|staff',
};
const ROGUE = {
    group: 'rogue', matrix: 'thief', hd: 6, hdLevels: 10, hpAfter: 2, max: 20, prof: { start: 2, every: 4, penalty: -3 },
    nwp: { start: 3, every: 4 }, gold: '2d6*10', shields: 'none',
    xp: [1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000, 220000, 440000], xpAfter: 220000,
};
const PALADIN_XP = [2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000, 600000];

const specialist = (label, ability, score, school, opposition, extra = {}) => ({
    ...WIZARD, label, min: { ...scores(3, 3, 3, 9, 3, 3), [ability]: score }, school, opposition, bonusSlot: true,
    img: 'icons/magic/symbols/runes-star-blue.webp', features: [[1, `Specialist: ${school}`]], ...extra,
});

const C = {
    fighter: {
        ...WARRIOR, label: 'Fighter', imgFrom: 'Fighter', matrix: 'fighter', min: scores(9, 3, 3, 3, 3, 3), prime: ['str'], specialize: '2e',
        xp: [2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000], xpAfter: 250000, features: [[9, 'Stronghold']],
    },
    paladin: {
        ...WARRIOR, label: 'Paladin', imgFrom: 'Paladin', matrix: 'paladin', min: scores(12, 3, 9, 3, 13, 17), prime: ['str', 'cha'], align: ['lg'],
        saveBonus: 2, xp: PALADIN_XP, xpAfter: 300000, slots: { divine: SLOTS.paladin2e }, casterOffset: 8, noWisBonus: true, turn: 2, focus: 'Clerical',
        nwpGroups: ['general', 'warrior', 'priest'],
        features: [[1, 'Detect Evil Intent'], [1, 'Lay on Hands'], [1, 'Cure Disease'], [1, 'Aura of Protection'], [1, 'Immune to Disease'], [3, 'Turn Undead'], [4, 'Summon Warhorse']],
    },
    ranger: {
        ...WARRIOR, label: 'Ranger', imgFrom: 'Ranger', matrix: 'ranger', min: scores(13, 13, 14, 3, 14, 3), prime: ['str', 'dex', 'wis'], align: GOOD,
        xp: PALADIN_XP, xpAfter: 300000, slots: { divine: SLOTS.ranger2e }, casterOffset: 7, noWisBonus: true, focus: 'Druidic',
        nwpGroups: ['general', 'warrior', 'wizard'], rangerSkills: true, freeNwp: ['Tracking'],
        features: [[1, 'Two-Weapon Style'], [1, 'Species Enemy'], [1, 'Animal Empathy'], [10, 'Followers']],
    },
    mage: { ...WIZARD, label: 'Mage', imgFrom: 'Magic User', min: scores(3, 3, 3, 9, 3, 3) },
    abjurer: specialist('Abjurer', 'wis', 15, 'Abjuration', ['Alteration', 'Illusion']),
    conjurer: specialist('Conjurer', 'con', 15, 'Conjuration', ['Divination', 'Invocation', 'Evocation']),
    diviner: specialist('Diviner', 'wis', 16, 'Divination', ['Conjuration']),
    enchanter: specialist('Enchanter', 'cha', 16, 'Enchantment', ['Invocation', 'Evocation', 'Necromancy']),
    illusionist: specialist('Illusionist', 'dex', 16, 'Illusion', ['Necromancy', 'Invocation', 'Evocation', 'Abjuration'], { imgFrom: 'Illusionist' }),
    invoker: specialist('Invoker', 'con', 16, 'Invocation', ['Enchantment', 'Conjuration']),
    necromancer: specialist('Necromancer', 'wis', 16, 'Necromancy', ['Illusion', 'Enchantment']),
    transmuter: specialist('Transmuter', 'dex', 15, 'Alteration', ['Abjuration', 'Necromancy']),
    cleric: {
        ...PRIEST, label: 'Cleric', imgFrom: 'Cleric', matrix: 'cleric', min: scores(3, 3, 3, 3, 9, 3), prime: ['wis'], slots: { divine: SLOTS.priest2e },
        turn: 0, focus: 'Clerical', xp: [1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000], xpAfter: 225000,
        armor: 'any', weapons: 'club|flail|hammer|mace|staff|morning|sling', features: [[1, 'Turn Undead']],
    },
    druid: {
        ...PRIEST, label: 'Druid', imgFrom: 'Druid', matrix: 'druid', min: scores(3, 3, 3, 3, 12, 15), prime: ['wis', 'cha'], align: ['n'], max: 14,
        slots: { divine: SLOTS.priest2e }, focus: 'Druidic',
        xp: [2000, 4000, 7500, 12500, 20000, 35000, 60000, 90000, 125000, 200000, 300000, 750000, 1500000],
        armor: 'leather|padded|hide', shields: 'wood|small|medium|body|buckler', weapons: 'club|sickle|dart|spear|dagger|scimitar|sling|staff',
        features: [
            [1, 'Druidic Language'], [1, 'Save Bonus vs Fire and Electricity (+2)'], [3, 'Identify Plants, Animals and Pure Water'],
            [3, 'Pass Through Undergrowth'], [7, 'Immune to Woodland Charm'], [7, 'Shapechange'],
        ],
    },
    thief: {
        ...ROGUE, label: 'Thief', imgFrom: 'Thief', min: scores(3, 9, 3, 3, 3, 3), prime: ['dex'], align: ALIGNMENTS.filter((a) => a !== 'lg'),
        thief: 0, thiefBase: [15, 10, 5, 10, 5, 15, 60, 0], points: [60, 30], pointsCap: [30, 15], nwpGroups: ['general', 'rogue'],
        armor: 'leather|padded|elfin|elven',
        weapons: 'club|dagger|dart|crossbow, hand|knife|lasso|bow, short|bow \\(short|sling|staff|sword, (long|short|broad)|sword \\((long|short|broad)',
        features: [[1, 'Backstab'], [1, "Thieves' Cant"], [10, 'Use Scrolls']],
    },
    bard: {
        ...ROGUE, label: 'Bard', min: scores(3, 12, 3, 13, 3, 15), prime: ['dex', 'cha'], align: NEUTRALISH, img: 'icons/tools/instruments/lute-gold-brown.webp',
        thief: 0, thiefBase: [10, null, null, null, null, 20, 50, 5], points: [20, 15], pointsCap: [30, 15],
        slots: { arcane: SLOTS.bard2e }, spellFolder: WIZARD_FOLDERS, startSpells: 0, nwpGroups: ['general', 'rogue', 'warrior', 'wizard'],
        freeNwp: ['Reading/Writing'], armor: 'leather|padded|studded|ring|scale|hide|brigandine|chain', weapons: 'any',
        features: [[1, 'Influence Reactions'], [1, 'Inspire Allies'], [1, 'Counter Songs'], [1, 'Local Legend and Lore']],
    },
};

const U = Infinity;
const all18 = scores(18, 18, 18, 18, 18, 18);
const mods = (pp, ol, frt, ms, hs, dn, cw, rl) => ({
    'Pick Pockets': pp, 'Open Locks': ol, 'Find/Remove Traps': frt, 'Move Silently': ms,
    'Hide in Shadows': hs, 'Detect Noise': dn, 'Climb Walls': cw, 'Read Languages': rl,
});
const cap = (list, level) => Object.fromEntries(list.map((k) => [k, level]));

const R = {
    human: {
        compendium: ['Human'], min: scores(3, 3, 3, 3, 3, 3), max: all18, strMax: 100, move: 120, size: 'medium',
        levels: cap(Object.keys(C), U), multi: [], languages: ['Common'], ages: { any: '15+1d4' }, skillmods: {},
    },
    dwarf: {
        compendium: ['Dwarf'], min: scores(8, 3, 11, 3, 3, 3), max: scores(18, 17, 18, 18, 18, 17), strMax: 100, adj: { con: 1, cha: -1 },
        move: 60, infravision: 60, saveBonus: true, size: 'medium', levels: { cleric: 10, fighter: 15, thief: 12 },
        multi: [['fighter', 'cleric'], ['fighter', 'thief']], languages: ['Common', 'Dwarfish', 'Gnomish', 'Goblin', 'Kobold', 'Orcish'],
        ages: { any: '40+5d6' }, skillmods: mods(0, 10, 15, 0, 0, 0, -10, -5),
    },
    elf: {
        compendium: ['Elf'], min: scores(3, 6, 7, 8, 3, 8), max: all18, strMax: 100, adj: { dex: 1, con: -1 }, move: 120, infravision: 60, size: 'medium',
        levels: { cleric: 12, fighter: 12, ...cap(['mage', 'diviner', 'enchanter'], 15), ranger: 15, thief: 12 },
        multi: [['fighter', 'mage'], ['fighter', 'thief'], ['mage', 'thief'], ['fighter', 'mage', 'thief']],
        languages: ['Common', 'Elven', 'Gnomish', 'Halfling', 'Goblin', 'Hobgoblin', 'Orcish', 'Gnoll'],
        ages: { any: '100+5d6' }, skillmods: mods(5, -5, 0, 5, 10, 5, 0, 0),
    },
    gnome: {
        compendium: ['Gnome'], min: scores(6, 3, 8, 6, 3, 3), max: all18, strMax: 100, adj: { int: 1, wis: -1 }, move: 60, infravision: 60, saveBonus: true, size: 'small',
        levels: { cleric: 9, fighter: 11, illusionist: 15, thief: 13 },
        multi: [['fighter', 'cleric'], ['fighter', 'illusionist'], ['fighter', 'thief'], ['cleric', 'illusionist'], ['cleric', 'thief'], ['illusionist', 'thief']],
        languages: ['Common', 'Dwarfish', 'Gnomish', 'Halfling', 'Goblin', 'Kobold', 'Burrowing Animal'],
        ages: { any: '60+3d12' }, skillmods: mods(0, 5, 10, 5, 5, 10, -15, 0),
    },
    'half-elf': {
        compendium: ['Half Elf', 'Half-Elf'], min: scores(3, 6, 6, 4, 3, 3), max: all18, strMax: 100, move: 120, infravision: 60, size: 'medium',
        levels: { bard: U, cleric: 14, druid: 9, fighter: 14, ...cap(['mage', 'conjurer', 'diviner', 'enchanter', 'transmuter'], 12), ranger: 16, thief: 12 },
        multi: [
            ['fighter', 'cleric'], ['fighter', 'thief'], ['fighter', 'druid'], ['fighter', 'mage'], ['cleric', 'ranger'], ['druid', 'ranger'],
            ['cleric', 'mage'], ['druid', 'mage'], ['mage', 'thief'], ['fighter', 'mage', 'cleric'], ['fighter', 'mage', 'druid'], ['fighter', 'mage', 'thief'],
        ],
        languages: ['Common', 'Elven', 'Gnomish', 'Halfling', 'Goblin', 'Hobgoblin', 'Orcish', 'Gnoll'],
        ages: { any: '15+1d6' }, skillmods: mods(10, 0, 0, 0, 5, 0, 0, 0),
    },
    halfling: {
        compendium: ['Halfling'], min: scores(7, 7, 10, 6, 3, 3), max: scores(18, 18, 18, 18, 17, 18), strMax: 0, adj: { dex: 1, str: -1 },
        move: 60, infravision: 30, saveBonus: true, size: 'small', levels: { cleric: 8, fighter: 9, thief: 15 }, multi: [['fighter', 'thief']],
        languages: ['Common', 'Dwarfish', 'Elven', 'Gnomish', 'Goblin', 'Halfling', 'Orcish'],
        ages: { any: '20+3d4' }, skillmods: mods(5, 5, 5, 10, 15, 5, -15, -5),
    },
};

/** Ranger woodland skills by level. */
export const RANGER_2E = {
    hide: [10, 15, 20, 25, 31, 37, 43, 49, 56, 63, 70, 77, 85, 93, 99],
    move: [15, 21, 27, 33, 40, 47, 55, 62, 70, 78, 86, 94, 99, 99, 99],
};

const list = (group, rows) => rows.split(';').map((row) => {
    const [name, slots, ability, mod] = row.trim().split('|');
    return { name, group, slots: Number(slots), ability: ability === '-' ? 'none' : ability, mod: Number(mod) };
});
/** Nonweapon proficiencies: name | slots | ability | check modifier */
export const NWP = [
    ...list('general', 'Agriculture|1|int|0;Animal Handling|1|wis|-1;Animal Training|1|wis|0;Artistic Ability|1|wis|0;Blacksmithing|1|str|0;Brewing|1|int|0;Carpentry|1|str|0;Cobbling|1|dex|0;Cooking|1|int|0;Dancing|1|dex|0;Direction Sense|1|wis|1;Etiquette|1|cha|0;Fire-building|1|wis|-1;Fishing|1|wis|-1;Heraldry|1|int|0;Languages, Modern|1|int|0;Leatherworking|1|int|0;Mining|2|wis|-3;Pottery|1|dex|-2;Riding, Airborne|2|wis|-2;Riding, Land-based|1|wis|3;Rope Use|1|dex|0;Seamanship|1|dex|1;Seamstress/Tailor|1|dex|-1;Singing|1|cha|0;Stonemasonry|1|str|-2;Swimming|1|str|0;Weather Sense|1|wis|-1;Weaving|1|int|-1'),
    ...list('priest', 'Ancient History|1|int|-1;Astrology|2|int|0;Engineering|2|int|-3;Healing|2|wis|-2;Herbalism|2|int|-2;Languages, Ancient|1|int|0;Local History|1|cha|0;Musical Instrument|1|dex|-1;Navigation|1|int|-2;Reading/Writing|1|int|1;Religion|1|wis|0;Spellcraft|1|int|-2'),
    ...list('rogue', 'Ancient History|1|int|-1;Appraising|1|int|0;Blind-fighting|2|-|0;Disguise|1|cha|-1;Forgery|1|dex|-1;Gaming|1|cha|0;Gem Cutting|2|dex|-2;Juggling|1|dex|-1;Jumping|1|str|0;Local History|1|cha|0;Musical Instrument|1|dex|-1;Reading Lips|2|int|-2;Set Snares|1|dex|-1;Tightrope Walking|1|dex|0;Tumbling|1|dex|0;Ventriloquism|1|int|-2'),
    ...list('warrior', 'Animal Lore|1|int|0;Armorer|2|int|-2;Blind-fighting|2|-|0;Bowyer/Fletcher|1|dex|-1;Charioteering|1|dex|2;Endurance|2|con|0;Gaming|1|cha|0;Hunting|1|wis|-1;Mountaineering|1|-|0;Navigation|1|int|-2;Running|1|con|-6;Set Snares|1|int|-1;Survival|2|int|0;Tracking|2|wis|0;Weaponsmithing|3|int|-3'),
    ...list('wizard', 'Ancient History|1|int|-1;Astrology|2|int|0;Engineering|2|int|-3;Gem Cutting|2|dex|-2;Herbalism|2|int|-2;Languages, Ancient|1|int|0;Navigation|1|int|-2;Reading/Writing|1|int|1;Religion|1|wis|0;Spellcraft|1|int|-2'),
];

export default {
    id: 'add2e', variant: '2', thaco: THACO_2E, thiefNames: 'add2e', nwp: true,
    checkAfterAdjust: false, useCompendiumRaceMods: false, useCompendiumRanks: false,
    methods: ['3d6order', '3d6twice', '3d6arrange', '3d6twiceArrange', '4d6drop', 'dicepool', 'manual'],
    races: R, classes: C,
    // OSRIC sub-items whose rules differ in 2e; the creator supplies its own versions.
    raceItemExclude: /^(hear noise|search secret door|base movement|wrestle|brawl|surprise \(2|infravision)/i,
};
