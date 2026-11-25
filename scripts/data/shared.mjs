/**
 * Numeric tables shared by the three rulesets. Only game mechanics live here; rules text
 * stays in the books and in the compendiums the world already has.
 */

/** Level bands -> [paralyzation/poison/death, petrification/polymorph, rod/staff/wand, breath, spell] */
const SAVE_BANDS = {
    warrior: [
        [2, [14, 15, 16, 17, 17]], [4, [13, 14, 15, 16, 16]], [6, [11, 12, 13, 13, 14]], [8, [10, 11, 12, 12, 13]],
        [10, [8, 9, 10, 9, 11]], [12, [7, 8, 9, 8, 10]], [14, [5, 6, 7, 5, 8]], [16, [4, 5, 6, 4, 7]], [99, [3, 4, 5, 4, 6]],
    ],
    /** OSRIC 3.0 adds a 19th-level row. */
    warriorOsric: [
        [2, [14, 15, 16, 17, 17]], [4, [13, 14, 15, 16, 16]], [6, [11, 12, 13, 13, 14]], [8, [10, 11, 12, 12, 13]],
        [10, [8, 9, 10, 9, 11]], [12, [7, 8, 9, 8, 10]], [14, [5, 6, 7, 5, 8]], [16, [4, 5, 6, 4, 7]], [18, [3, 4, 5, 4, 6]], [99, [2, 3, 4, 3, 5]],
    ],
    priest: [
        [3, [10, 13, 14, 16, 15]], [6, [9, 12, 13, 15, 14]], [9, [7, 10, 11, 13, 12]], [12, [6, 9, 10, 12, 11]],
        [15, [5, 8, 9, 11, 10]], [18, [4, 7, 8, 10, 9]], [99, [2, 5, 6, 8, 7]],
    ],
    wizard: [
        [5, [14, 13, 11, 15, 12]], [10, [13, 11, 9, 13, 10]], [15, [11, 9, 7, 11, 8]], [20, [10, 7, 5, 9, 6]], [99, [8, 5, 3, 7, 4]],
    ],
    rogue: [
        [4, [13, 12, 14, 16, 15]], [8, [12, 11, 12, 15, 13]], [12, [11, 10, 10, 14, 11]], [16, [10, 9, 8, 13, 9]],
        [20, [9, 8, 6, 12, 7]], [99, [8, 7, 4, 11, 5]],
    ],
};

/** Saving throws in the shape of an ARS class rank. */
export function savesFor(group, level, bonus = 0) {
    const row = SAVE_BANDS[group].find(([max]) => level <= max)[1];
    const [ppd, pp, rsw, breath, spell] = row.map((v) => Math.max(2, v - bonus));
    return {
        paralyzation: ppd, poison: ppd, death: ppd,
        rod: rsw, staff: rsw, wand: rsw,
        petrification: pp, polymorph: pp,
        breath, spell,
    };
}

const bands = (...rows) => (level) => rows.find(([max]) => level <= max)[1];
export const THACO_1E = {
    warrior: (l) => Math.max(4, 20 - 2 * Math.floor((l - 1) / 2)),
    priest: (l) => Math.max(8, 20 - 2 * Math.floor((l - 1) / 3)),
    wizard: bands([5, 20], [10, 19], [15, 16], [20, 13], [99, 11]),
    rogue: bands([4, 20], [8, 19], [12, 16], [16, 14], [20, 12], [99, 10]),
};
/** Number needed against AC 0 in the OSRIC 3.0 to-hit tables. */
export const THACO_O3 = {
    warrior: (l) => Math.max(1, 21 - l),
    priest: (l) => (l >= 19 ? 9 : 20 - 2 * Math.floor((l - 1) / 3)),
    wizard: bands([5, 20], [10, 19], [15, 16], [99, 14]),
    rogue: bands([4, 20], [8, 19], [12, 16], [16, 14], [99, 12]),
};
export const THACO_2E = {
    warrior: (l) => Math.max(1, 21 - l),
    priest: (l) => 20 - 2 * Math.floor((l - 1) / 3),
    wizard: (l) => 20 - Math.floor((l - 1) / 3),
    rogue: (l) => 20 - Math.floor((l - 1) / 2),
};

/** Parse '1 2 2/1': slots for spell levels 1..n at each class level, '-' for none. */
export const slots = (s) => s.split(' ').map((r) => (r === '-' ? [] : r.split('/').map(Number)));
/** Spell slots per class level; each entry lists slots for spell levels 1..n. */
export const SLOTS = {
    wizard: slots('1 2 2/1 3/2 4/2/1 4/2/2 4/3/2/1 4/3/3/2 4/3/3/2/1 4/4/3/2/2 4/4/4/3/3 4/4/4/4/4/1 5/5/5/4/4/2 5/5/5/4/4/2/1 5/5/5/5/5/2/1 5/5/5/5/5/3/2/1 5/5/5/5/5/3/3/2 5/5/5/5/5/3/3/2/1 5/5/5/5/5/3/3/3/1 5/5/5/5/5/4/3/3/2'),
    illusionist1e: slots('1 2 2/1 3/2 4/2/1 4/3/1 4/3/2 4/3/2/1 5/3/3/2 5/4/3/2/1 5/4/3/3/2 5/5/4/3/2/1 5/5/4/3/2/2 5/5/4/3/2/2/1 5/5/4/4/2/2/2 5/5/5/4/3/2/2 5/5/5/5/3/2/2 5/5/5/5/3/3/2 5/5/5/5/4/3/2 5/5/5/5/4/3/3'),
    cleric1e: slots('1 2 2/1 3/2 3/3/1 3/3/2 3/3/2/1 3/3/3/2 4/4/3/2/1 4/4/3/3/2 5/4/4/3/2/1 6/5/5/3/2/2 6/6/6/4/2/2 6/6/6/5/3/2 6/6/6/6/4/2 7/7/7/6/4/3/1 7/7/7/7/5/3/1 8/8/8/8/6/4/1 8/8/8/8/6/4/2 9/9/9/8/7/5/2'),
    priest2e: slots('1 2 2/1 3/2 3/3/1 3/3/2 3/3/2/1 3/3/3/2 4/4/3/2/1 4/4/3/3/2 5/4/4/3/2/1 6/5/5/3/2/2 6/6/6/4/2/2 6/6/6/5/3/2/1 6/6/6/6/4/2/1 7/7/7/6/4/3/1 7/7/7/7/5/3/2 8/8/8/8/6/4/2 9/9/8/8/6/4/2 9/9/9/8/7/5/2'),
    druid1e: slots('2 2/1 3/2/1 4/2/2 4/3/2 4/3/2/1 4/4/3/1 4/4/3/2 5/4/3/2/1 5/4/3/3/2 5/5/3/3/2/1 5/5/4/4/3/2/1 6/5/5/5/4/3/2 6/6/6/6/5/4/3'),
    paladin1e: slots('- - - - - - - - 1 2 2/1 2/2 2/2/1 3/2/1 3/2/1/1 3/3/1/1 3/3/2/1 3/3/3/1 3/3/3/2 3/3/3/3'),
    paladin2e: slots('- - - - - - - - 1 2 2/1 2/2 2/2/1 3/2/1 3/2/1/1 3/3/2/1 3/3/3/1 3/3/3/1 3/3/3/2 3/3/3/3'),
    ranger1eDivine: slots('- - - - - - - 1 1 2 2 2/1 2/1 2/2 2/2 2/2/1 2/2/2 2/2/2 2/2/2 2/2/2'),
    ranger1eArcane: slots('- - - - - - - - 1 1 2 2 2/1 2/1 2/2 2/2 2/2 2/2 2/2 2/2'),
    ranger2e: slots('- - - - - - - 1 2 2/1 2/2 2/2/1 3/2/1 3/2/2 3/3/2 3/3/3 3/3/3 3/3/3 3/3/3 3/3/3'),
    bard2e: slots('- 1 2 2/1 3/1 3/2 3/2/1 3/3/1 3/3/2 3/3/2/1 3/3/3/1 3/3/3/2 3/3/3/2/1 3/3/3/3/1 3/3/3/3/2 4/3/3/3/2/1 4/4/3/3/3/1 4/4/4/3/3/2 4/4/4/4/3/2 4/4/4/4/4/3'),
};

/** Thief skill names, matching the names ARS automates for each system variant. */
export const THIEF_SKILLS = {
    osric: ['Pick Pockets', 'Open Locks/Disarm Traps', 'Find Traps', 'Move Quietly', 'Hide in Shadows', 'Hear Noise', 'Climb Walls', 'Read Languages'],
    add1e: ['Pick Pockets', 'Open Locks', 'Find/Remove Traps', 'Move Silently', 'Hide in Shadows', 'Hear Noise', 'Climb Walls', 'Read Languages'],
    add2e: ['Pick Pockets', 'Open Locks', 'Find/Remove Traps', 'Move Silently', 'Hide in Shadows', 'Detect Noise', 'Climb Walls', 'Read Languages'],
};

const T1 = [
    [30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 105, 110, 115, 125, 125],
    [25, 29, 33, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 87, 92, 97, 99],
    [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99],
    [15, 21, 27, 33, 40, 47, 55, 62, 70, 78, 86, 94, 99, 99, 99, 99, 99],
    [10, 15, 20, 25, 31, 37, 43, 49, 56, 63, 70, 77, 85, 93, 99, 99, 99],
    [10, 10, 15, 15, 20, 20, 25, 25, 30, 30, 35, 35, 40, 40, 50, 50, 55],
    [85, 86, 87, 88, 90, 92, 94, 96, 98, 99, 99, 99, 99, 99, 99, 99, 99],
    [0, 0, 0, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 80],
];
/** OSRIC 3.0 table 1.3.10.4B differs from 1e in three columns. */
const OSRIC = T1.with(3, [15, 20, 27, 33, 40, 47, 55, 62, 70, 78, 86, 94, 99, 99, 99, 99, 99])
    .with(4, [10, 15, 20, 25, 30, 35, 42, 48, 55, 65, 70, 75, 85, 95, 99, 99, 99])
    .with(7, [1, 5, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 80]);
/** Base percentages of a thief of the given level, in THIEF_SKILLS order. */
export function thiefRow(table, level) {
    const l = Math.max(1, level);
    return (table === 'osric' ? OSRIC : T1).map((col) => col[Math.min(17, l) - 1]);
}

export const DEMIHUMAN_AGES = {
    dwarf: { cleric: '250+2d20', fighter: '40+5d4', thief: '75+3d6' },
    elf: { cleric: '500+10d10', fighter: '130+5d6', 'magic-user': '150+5d6', thief: '100+5d6' },
    gnome: { cleric: '300+3d12', fighter: '60+5d4', 'magic-user': '100+2d12', thief: '80+5d4' },
    'half-elf': { cleric: '40+2d4', fighter: '22+3d4', 'magic-user': '30+2d8', thief: '22+3d8' },
    halfling: { cleric: '40+3d4', fighter: '20+3d4', thief: '40+2d4' },
    'half-orc': { cleric: '20+1d4', fighter: '13+1d4', thief: '20+2d4' },
};

/** Suggested build: [height base, height dice (inches), weight base, weight dice (lb)] per sex. */
export const BUILD = {
    dwarf: { male: ['43', '1d10', '130', '4d10'], female: ['41', '1d10', '105', '4d10'] },
    elf: { male: ['55', '1d10', '90', '3d10'], female: ['50', '1d10', '70', '3d10'] },
    gnome: { male: ['38', '1d6', '72', '5d4'], female: ['36', '1d6', '68', '5d4'] },
    'half-elf': { male: ['60', '2d6', '110', '3d12'], female: ['58', '2d6', '85', '3d12'] },
    halfling: { male: ['32', '2d8', '52', '5d4'], female: ['30', '2d8', '48', '5d4'] },
    'half-orc': { male: ['58', '2d8', '130', '4d10'], female: ['56', '2d8', '105', '4d10'] },
    human: { male: ['60', '2d10', '140', '6d10'], female: ['59', '2d10', '100', '6d10'] },
};

export const ABILITIES = ['str', 'int', 'wis', 'dex', 'con', 'cha'];
export const ALIGNMENTS = ['lg', 'ng', 'cg', 'ln', 'n', 'cn', 'le', 'ne', 'ce'];
export const GOOD = ['lg', 'ng', 'cg'];
export const EVIL = ['le', 'ne', 'ce'];
export const LAWFUL = ['lg', 'ln', 'le'];
export const NEUTRALISH = ['ng', 'ln', 'n', 'cn', 'ne'];

export const scores = (str, dex, con, int, wis, cha) => ({ str, dex, con, int, wis, cha });
/** Level cap that depends on a score: step('str', 5, {17: 6, 18: 7}) */
export const step = (ability, base, at) => (s) =>
    Object.entries(at).reduce((best, [score, cap]) => (s[ability] >= Number(score) ? Math.max(best, cap) : best), base);
