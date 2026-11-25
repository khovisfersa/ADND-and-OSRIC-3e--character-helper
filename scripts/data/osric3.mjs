import { DEMIHUMAN_AGES, EVIL, GOOD, LAWFUL, NEUTRALISH, THACO_O3, scores, slots, step } from './shared.mjs';

/**
 * OSRIC 3.0, checked against the Player Guide (tables 1.1.2A to 1.4.2.G).
 *
 * - `prof.at`: levels that grant another weapon proficiency. `prof.every` is the closest value
 *   ARS can express and only feeds the class item.
 * - `features`: [level, name]; a level may be a function of the final ability scores.
 */

const SLOTS = {
    cleric: slots('1 2 2/1 3/2 3/3/1 3/3/2 3/3/2/1 3/3/3/2 4/4/3/2/1 4/4/3/3/2 5/4/4/3/2/1 6/5/5/3/2/2 6/6/6/4/2/2 6/6/6/5/3/2 7/7/7/5/4/2 7/7/7/6/5/3/1 8/8/8/6/5/3/1 8/8/8/7/6/4/1 9/9/9/7/6/4/2 9/9/9/8/7/5/2'),
    druid: slots('2 2/1 3/2/1 4/2/2 4/3/2 4/3/2/1 4/4/3/1 4/4/3/2 5/4/3/2/1 5/4/3/3/2 5/5/3/3/2/1 5/5/4/4/3/2/1 6/5/5/5/4/3/2 6/6/6/6/5/4/3'),
    illusionist: slots('1 2 2/1 3/2 4/3/1 4/3/2 4/3/2/1 4/3/2/2 5/3/3/2 5/4/3/2/1 5/4/3/3/2 5/5/4/3/2/1 5/5/4/3/2/2 5/5/4/3/2/2/1 5/5/4/4/2/2/2 5/5/5/4/3/2/2 6/5/5/4/3/3/2 6/6/5/4/4/3/2 6/6/5/5/5/3/2 6/6/6/5/5/4/2'),
    magicUser: slots('1 2 2/1 3/2 4/2/1 4/3/2 4/3/2/1 4/3/3/2 4/4/3/2/1 4/4/3/2/2 4/4/4/3/3 5/4/4/3/3/1 5/5/4/3/3/2 5/5/5/4/4/2/1 5/5/5/4/4/3/2 5/5/5/4/4/3/2/1 5/5/5/5/5/4/3/2 5/5/5/5/5/4/3/2/1 5/5/5/5/5/5/4/3/1 5/5/5/5/5/5/4/3/2'),
    paladin: slots('- - - - - - - - 1 2 2/1 2/2 2/2/1 3/2/1 3/2/1/1 3/3/1/1 3/3/2/1 3/3/3/1 3/3/3/2 3/3/3/3'),
    rangerDruid: slots('- - - - - - - 1 1 2 2 2/1 2/1 2/2 2/2 2/2/1 2/2/2 3/2/2 3/2/2 3/3/2'),
    rangerArcane: slots('- - - - - - - - 1 1 2 2 2/1 2/1 2/2 2/2 2/2 2/2 3/2 3/2'),
};
/** Ranger casting level (table 1.3.9.4A): one per two levels from 8th, up to 6. */
const rangerCaster = (level) => (level < 8 ? 0 : Math.min(6, Math.floor((level - 6) / 2)));

export const CLASSES = {
    assassin: {
        compendium: ['Assassin'], group: 'rogue', matrix: 'assassin', min: scores(12, 12, 6, 11, 6, 3), prime: [], align: EVIL,
        hd: 6, hdLevels: 15, hpAfter: 0, max: 15, prof: { start: 3, at: [4, 8, 12], every: 4, penalty: -3 }, gold: '2d6*10', ageAs: 'thief', thief: 2,
        xp: [1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 450000, 600000, 750000, 1000000, 1500000],
        armor: 'leather', shields: 'any', weapons: 'any', features: [[1, 'Backstab'], [1, 'Disguise'], [1, 'Poison Usage'], [1, 'Assassination']],
    },
    cleric: {
        compendium: ['Cleric'], group: 'priest', matrix: 'cleric', min: scores(6, 3, 6, 6, 9, 6), prime: ['wis'],
        hd: 8, hdLevels: 9, hpAfter: 2, max: 20, prof: { start: 2, at: [4, 7, 10, 13], every: 3, penalty: -3 }, gold: '3d6*10', ageAs: 'cleric',
        slots: { divine: SLOTS.cleric }, turn: 0, focus: 'Clerical',
        xp: [1500, 3000, 6000, 13000, 27000, 55000, 110000, 220000, 450000, 675000, 900000, 1125000, 1350000, 1575000, 1800000, 2050000, 2300000, 2550000, 2700000],
        armor: 'any', shields: 'any', weapons: 'club|flail|hammer|mace|staff|torch|oil|holy water', features: [[1, 'Turn Undead']],
    },
    druid: {
        compendium: ['Druid'], group: 'priest', matrix: 'druid', min: scores(6, 3, 6, 6, 12, 15), prime: ['wis', 'cha'], align: ['n'],
        hd: 8, hdLevels: 14, hpAfter: 0, max: 14, prof: { start: 2, at: [4, 7, 10, 13], every: 3, penalty: -4 }, gold: '3d6*10', ageAs: 'cleric',
        slots: { divine: SLOTS.druid }, focus: 'Druidic',
        xp: [2000, 4000, 8000, 12000, 20000, 35000, 60000, 90000, 125000, 200000, 300000, 750000, 1500000],
        armor: '^leather|leather armour', shields: 'wood|small|medium|large', weapons: 'club|dagger|dart|hammer|scimitar|sling|spear|staff|torch|oil',
        features: [[1, "Language: Druids' Cant"], [3, 'ID Plant/Animal/Safe Water'], [3, 'Wilderness Movement'], [7, 'Fey Charm Immunity'], [7, 'Shapeshift']],
    },
    fighter: {
        compendium: ['Fighter'], group: 'warrior', matrix: 'fighter', saves: 'warriorOsric', min: scores(9, 6, 7, 3, 6, 6), prime: ['str'], warrior: true, specialize: 'double',
        hd: 10, hdLevels: 9, hpAfter: 3, max: 20, prof: { start: 4, at: [3, 5, 7, 9, 11, 13, 15, 17, 19], every: 2, penalty: -2 }, gold: '5d4*10', ageAs: 'fighter',
        xp: [2000, 4000, 8000, 17000, 35000, 70000, 125000, 250000, 500000], xpAfter: 250000, attacks: [7, 13],
        armor: 'any', shields: 'any', weapons: 'any', features: [[7, 'Bonus Attacks'], [9, 'Stronghold']],
    },
    illusionist: {
        compendium: ['Illusionist'], group: 'wizard', matrix: 'illusionist', min: scores(6, 16, 3, 15, 6, 6), prime: [],
        hd: 4, hdLevels: 10, hpAfter: 1, max: 20, prof: { start: 1, at: [6, 11, 16], every: 5, penalty: -5 }, gold: '2d4*10', ageAs: 'magic-user',
        slots: { arcane: SLOTS.illusionist }, spellFolder: 'illusion', startSpells: 3,
        xp: [2500, 4750, 9000, 18000, 35000, 60000, 95000, 145000, 220000], xpAfter: 220000,
        armor: 'none', shields: 'none', weapons: 'dagger|dart|staff|oil',
    },
    'magic-user': {
        compendium: ['Magic User', 'Magic-User'], group: 'wizard', matrix: 'magic-user', min: scores(3, 6, 6, 9, 6, 6), prime: ['int'],
        hd: 4, hdLevels: 11, hpAfter: 1, max: 20, prof: { start: 1, at: [6, 11, 16], every: 5, penalty: -5 }, gold: '2d4*10', ageAs: 'magic-user',
        slots: { arcane: SLOTS.magicUser }, spellFolder: 'magic', startSpells: 4, requiredSpells: ['Read Magic'],
        xp: [2400, 4800, 10250, 22000, 40000, 60000, 80000, 140000, 250000, 375000, 750000], xpAfter: 375000,
        armor: 'none', shields: 'none', weapons: 'dagger|dart|staff|oil',
    },
    monk: {
        compendium: ['Monk'], group: 'rogue', matrix: 'cleric', thacoGroup: 'priest', min: scores(10, 15, 3, 3, 10, 3), prime: [], align: LAWFUL,
        hd: 4, hdLevels: 17, firstHd: 2, hpAfter: 0, max: 17, prof: { start: 1, at: [3, 5, 7, 9, 11, 13], every: 2, penalty: -3 }, gold: '5d4', ageAs: 'cleric',
        thief: 0, thiefOnly: [1, 2, 3, 4, 5, 6], noRaceThiefMods: true, acDex: '0', baseMove: (l) => 140 + 10 * l,
        xp: [2000, 5000, 10000, 21250, 45000, 100000, 200000, 350000, 500000, 700000, 950000, 1250000, 1750000, 2250000, 2750000, 3250000],
        baseAC: [10, 9, 8, 7, 7, 6, 5, 4, 3, 3, 2, 1, 0, -1, -1, -2, -3],
        armor: 'none', shields: 'none', weapons: 'club|crossbow|dagger|axe \\(hand|axe, hand|hand axe|javelin|pole|spear|staff', img: 'icons/skills/melee/unarmed-punch-fist.webp',
        features: [
            [1, 'Weaponless Attack'], [1, 'Deadly Strike'], [1, 'Deflect Missiles'], [(s) => (s.con >= 11 ? 1 : 99), 'Effect of Saving Throws'],
            [(s) => (s.str >= 15 ? 2 : 4), 'Weapon Damage Bonus'], [(s) => (s.wis >= 15 ? 3 : 5), 'Speak with Animals'], [4, 'Controlled Fall'], [4, 'Mind-Shield'],
            [(s) => (s.con >= 11 ? 5 : 6), 'Immune to Disease'], [5, 'Control Bodily Time'], [6, 'Self-Induced Catalepsy'], [7, 'Heal Self'],
            [(s) => (s.wis >= 15 ? 8 : 9), 'Speak with Plants'], [9, 'Resistance to Mind Control'], [(s) => (s.con >= 11 ? 11 : 99), 'Immune to Poison'],
            [(s) => (s.con >= 11 ? 99 : 11), '+2 to Saves against Poison'], [11, 'Establish Monastery'], [12, 'Immune to Geas and Quest'], [(s) => (s.wis >= 15 ? 13 : 99), 'Harmonic Touch'],
        ],
    },
    paladin: {
        compendium: ['Paladin'], group: 'warrior', matrix: 'paladin', saves: 'warriorOsric', min: scores(12, 6, 9, 9, 13, 17), prime: ['str', 'wis'], align: ['lg'], warrior: true, specialize: 'double',
        hd: 10, hdLevels: 9, hpAfter: 3, max: 20, saveBonus: 2, prof: { start: 3, at: [5, 8, 11, 14, 17], every: 3, penalty: -2 }, gold: '5d4*10', ageAs: 'fighter',
        slots: { divine: SLOTS.paladin }, caster: { divine: (l) => Math.min(8, l - 8) }, noWisBonus: true, focus: 'Clerical', turn: 2,
        xp: [2550, 5500, 12500, 25000, 45000, 95000, 175000, 325000, 600000, 1000000], xpAfter: 350000, attacks: [7, 13],
        armor: 'any', shields: 'any', weapons: 'any',
        features: [[1, 'Detect Evil'], [1, 'Lay on Hands'], [1, 'Cure Disease'], [1, 'Protection from Evil 10 ft Radius'], [3, 'Turn Undead'], [4, 'Summon Warhorse']],
    },
    ranger: {
        compendium: ['Ranger'], group: 'warrior', matrix: 'ranger', saves: 'warriorOsric', min: scores(13, 6, 14, 13, 14, 6), prime: ['str', 'int', 'wis'], align: GOOD, warrior: true, specialize: 'double',
        hd: 8, hdLevels: 10, firstHd: 2, hpAfter: 2, max: 20, prof: { start: 3, at: [5, 8, 11, 14, 17], every: 3, penalty: -2 }, gold: '5d4*10', ageAs: 'fighter',
        slots: { divine: SLOTS.rangerDruid, arcane: SLOTS.rangerArcane }, caster: { divine: rangerCaster, arcane: rangerCaster }, noWisBonus: true, focus: 'Druidic',
        spellFolder: 'magic', startSpells: 4, requiredSpells: ['Read Magic'], bookLevel: 9,
        xp: [2250, 4500, 9500, 20000, 40000, 90000, 150000, 225000, 325000, 650000], xpAfter: 325000, attacks: [8, 15],
        armor: 'any', shields: 'any', weapons: 'any', features: [[1, 'Bonus Damage (Rangers)'], [1, 'Surprise Mods (Rangers)'], [1, 'Tracking']],
    },
    thief: {
        compendium: ['Thief'], group: 'rogue', matrix: 'thief', min: scores(6, 9, 6, 6, 3, 6), prime: ['dex'], align: [...NEUTRALISH, 'le', 'ce'],
        hd: 6, hdLevels: 10, hpAfter: 2, max: 20, prof: { start: 2, at: [6, 10, 14, 18], every: 4, penalty: -3 }, gold: '2d6*10', ageAs: 'thief', thief: 0,
        xp: [1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000, 220000, 440000], xpAfter: 220000,
        armor: 'leather|padded', shields: 'none', weapons: 'club|dagger|dart|oil|sling|torch|scimitar|sword \\((?!two|bastard)|sword, (?!two|bastard)',
        features: [[1, 'Backstab'], [1, "Language: Thieves' Cant"], [10, 'Read Scrolls']],
    },
};

const all18 = scores(18, 18, 18, 18, 18, 18);
/** Ages at which each category begins: adult, grizzled, elder, ancient (younger is youth). */
const ages = (adult, grizzled, elder, ancient) => [adult, grizzled, elder, ancient];
const build = (height, heightDice, weight, weightDice) => ({ height, heightDice, weight, weightDice });

export const RACES = {
    human: {
        compendium: ['Human'], min: scores(3, 3, 3, 3, 3, 3), max: all18, strMax: 100, move: 120, size: 'medium',
        levels: Object.fromEntries(Object.keys(CLASSES).map((k) => [k, Infinity])), multi: [], languages: ['Common'],
        ages: { cleric: '20+1d4', fighter: '15+1d4', 'magic-user': '24+2d8', thief: '20+1d4' }, ageBands: ages(20, 40, 60, 90), build: build(64, '3d4', 140, '6d10'),
        skillmods: { 'Climb Walls': 5, 'Open Locks/Disarm Traps': 5 },
    },
    dwarf: {
        compendium: ['Dwarf'], min: scores(8, 3, 12, 3, 3, 3), max: scores(18, 17, 19, 18, 18, 16), strMax: 100, size: 'small',
        adj: { con: 1, cha: -1 }, move: 90, infravision: 60, saveBonus: true,
        levels: { assassin: 9, cleric: 8, fighter: step('str', 7, { 17: 8, 18: 9 }), thief: Infinity }, multi: [['fighter', 'thief']],
        languages: ['Common', 'Dwarfish', 'Gnomish', 'Goblin', 'Kobold', 'Orcish'], extraLanguages: () => 2, targets: { 'D: Shifting Rooms/Walls': '65' },
        ages: DEMIHUMAN_AGES.dwarf, ageBands: ages(51, 150, 250, 350), build: build(48, '3d4', 150, '5d10'),
        skillmods: { 'Climb Walls': -10, 'Find Traps': 15, 'Move Quietly': -5, 'Open Locks/Disarm Traps': 15, 'Read Languages': -5 },
    },
    elf: {
        compendium: ['Elf'], min: scores(3, 7, 6, 8, 3, 8), max: scores(18, 19, 18, 18, 18, 18), strMax: 100, size: 'medium',
        adj: { dex: 1, con: -1 }, move: 120, infravision: 60,
        levels: { assassin: 10, cleric: 7, fighter: step('str', 5, { 17: 6, 18: 7 }), 'magic-user': step('int', 9, { 17: 10, 18: 11 }), thief: Infinity },
        multi: [['fighter', 'magic-user'], ['fighter', 'thief'], ['magic-user', 'thief'], ['fighter', 'magic-user', 'thief']],
        languages: ['Common', 'Elven', 'Gnoll', 'Gnomish', 'Goblin', 'Halfling', 'Hobgoblin', 'Orcish'], extraLanguages: (int) => Math.max(0, int - 15),
        ages: DEMIHUMAN_AGES.elf, ageBands: ages(175, 550, 875, 1200), build: build(54, '3d4', 70, '5d10'),
        skillmods: { 'Climb Walls': -5, 'Find Traps': 5, 'Hear Noise': 5, 'Hide in Shadows': 10, 'Move Quietly': 5, 'Open Locks/Disarm Traps': -5, 'Pick Pockets': 5, 'Read Languages': 10 },
    },
    gnome: {
        compendium: ['Gnome'], min: scores(6, 3, 8, 7, 3, 3), max: all18, strMax: 100, size: 'small', move: 90, infravision: 60, saveBonus: true,
        levels: {
            assassin: 8, cleric: 7, fighter: step('str', 5, { 18: 6 }), thief: Infinity,
            illusionist: (s) => (s.int + s.dex >= 35 ? 7 : Math.min(s.int, s.dex) >= 17 ? 6 : 5),
        },
        multi: [['fighter', 'illusionist'], ['fighter', 'thief'], ['illusionist', 'thief']],
        languages: ['Common', 'Dwarfish', 'Gnomish', 'Goblin', 'Halfling', 'Kobold', 'Burrowing Animal'], extraLanguages: () => 2,
        ages: DEMIHUMAN_AGES.gnome, ageBands: ages(90, 300, 450, 600), build: build(34, '3d4', 45, '4d10'),
        skillmods: { 'Climb Walls': -15, 'Hear Noise': 5, 'Open Locks/Disarm Traps': 10 },
    },
    'half-elf': {
        compendium: ['Half Elf', 'Half-Elf'], min: scores(3, 6, 6, 4, 3, 3), max: all18, strMax: 100, size: 'medium', move: 120, infravision: 60,
        levels: {
            assassin: 11, cleric: 5, druid: 14, fighter: step('str', 6, { 17: 7, 18: 8 }), ranger: step('str', 6, { 17: 7, 18: 8 }),
            'magic-user': step('int', 6, { 17: 7, 18: 8 }), thief: Infinity,
        },
        multi: [
            ['cleric', 'fighter'], ['cleric', 'ranger'], ['cleric', 'magic-user'], ['fighter', 'magic-user'], ['fighter', 'thief'],
            ['cleric', 'fighter', 'magic-user'], ['fighter', 'magic-user', 'thief'],
        ],
        languages: ['Common', 'Elven', 'Gnoll', 'Gnomish', 'Goblin', 'Halfling', 'Hobgoblin', 'Orcish'], extraLanguages: (int) => Math.max(0, int - 16),
        exclude: /^e: detect secret door$/i,
        ages: DEMIHUMAN_AGES['half-elf'], ageBands: ages(40, 100, 175, 250), build: build(60, '4d4', 90, '5d10'),
        skillmods: { 'Hide in Shadows': 5, 'Pick Pockets': 10 },
    },
    halfling: {
        compendium: ['Halfling'], min: scores(6, 8, 10, 6, 3, 3), max: scores(17, 18, 19, 18, 17, 18), strMax: 0, size: 'small',
        adj: { str: -1, dex: 1 }, move: 90, infravision: 60, saveBonus: true,
        levels: { druid: 6, fighter: 4, thief: Infinity }, multi: [['fighter', 'thief']],
        languages: ['Common', 'Dwarfish', 'Gnomish', 'Goblin', 'Halfling', 'Orcish'], extraLanguages: (int) => Math.max(0, int - 16),
        ages: DEMIHUMAN_AGES.halfling, ageBands: ages(33, 68, 101, 144), build: build(34, '3d4', 45, '4d10'),
        skillmods: { 'Climb Walls': -15, 'Hear Noise': 5, 'Hide in Shadows': 15, 'Move Quietly': 15, 'Pick Pockets': 5, 'Read Languages': -5 },
    },
    'half-orc': {
        compendium: ['Half-Orc', 'Half Orc'], min: scores(6, 3, 13, 3, 3, 3), max: scores(18, 17, 19, 17, 14, 12), strMax: 100, size: 'medium',
        adj: { str: 1, con: 1, cha: -2 }, move: 120, infravision: 60,
        levels: { assassin: 15, cleric: 4, fighter: 10, thief: step('dex', 6, { 17: 7 }) },
        multi: [['cleric', 'fighter'], ['cleric', 'thief'], ['cleric', 'assassin'], ['fighter', 'thief'], ['fighter', 'assassin']],
        languages: ['Common', 'Orcish'], extraLanguages: () => 2,
        ages: DEMIHUMAN_AGES['half-orc'], ageBands: ages(16, 30, 45, 60), build: build(66, '3d4', 150, '5d10'),
        skillmods: { 'Climb Walls': 5, 'Find Traps': 5, 'Hear Noise': 5, 'Open Locks/Disarm Traps': 5, 'Pick Pockets': -5, 'Read Languages': -10 },
    },
};

/** Cumulative modifiers of each age category (youth first, then the RACES.ageBands thresholds). */
export const AGE_MODS = [
    { key: 'youth', mods: { wis: -1, con: 1 } },
    { key: 'adult', mods: { str: 1, wis: 1 } },
    { key: 'grizzled', mods: { str: -1, con: -1, int: 1, wis: 1 } },
    { key: 'elder', mods: { str: -2, dex: -2, con: -1, wis: 1 } },
    { key: 'ancient', mods: { str: -1, dex: -1, con: -1, int: 1, wis: 1 } },
];

export default {
    id: 'osric3', variant: '0', thaco: THACO_O3, thiefTable: 'osric', thiefNames: 'osric', nwp: false,
    checkAfterAdjust: true,
    /** Scores above the ancestry maximum are lowered to it instead of barring the ancestry. */
    capToRaceMax: true,
    /** A 00 on the exceptional strength roll is Strength 19. */
    strength00: 19,
    ageMods: AGE_MODS,
    /** Multi-class hit points: add Constitution, divide, drop fractions, at least 1 per level. */
    dropFractions: true,
    /** Optional rule 1.3: up to three minimums may be missed for -10/-15/-20% experience. */
    xpPenalty: [10, 15, 20],
    alignmentTongue: true,
    useCompendiumRaceMods: true,
    methods: ['4d6drop', '4d6order', '3d6arrange', '3d6order', 'manual'],
    races: RACES, classes: CLASSES,
};
