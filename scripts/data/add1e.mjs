import { SLOTS, THACO_1E, scores, step } from './shared.mjs';
import { CLASSES as OSRIC, RACES as OR } from './osric3.mjs';

/** 1e shares structure and most minimums with OSRIC 3.0; everything that differs is stated here. */
const prof = (start, every, penalty) => ({ start, every, penalty });
// 1e prints XP as "next level begins at n + 1".
const plus1 = (...list) => list.map((v) => v + 1);
const warrior = { saves: undefined, gold: '5d4*10', attacks: [7, 13] };

const C = {
    cleric: {
        ...OSRIC.cleric, prof: prof(2, 4, -3), align: ['lg', 'ng', 'cg', 'ln', 'cn', 'le', 'ne', 'ce'], slots: { divine: SLOTS.cleric1e },
        xp: plus1(1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000, 675000), xpAfter: 225000, weapons: 'club|flail|hammer|mace|staff|oil|holy water',
    },
    druid: {
        ...OSRIC.druid, prof: prof(2, 5, -4), min: scores(6, 6, 6, 6, 12, 15), slots: { divine: SLOTS.druid1e },
        xp: plus1(2000, 4000, 7500, 12500, 20000, 35000, 60000, 90000, 125000, 200000, 300000, 750000, 1500000), shields: 'wood|small',
    },
    fighter: {
        ...OSRIC.fighter, ...warrior, prof: prof(4, 3, -2), specialize: 'ua',
        xp: plus1(2000, 4000, 8000, 18000, 35000, 70000, 125000, 250000, 500000, 750000), xpAfter: 250000,
    },
    paladin: {
        ...OSRIC.paladin, ...warrior, prof: prof(3, 3, -2), specialize: null, slots: { divine: SLOTS.paladin1e }, caster: undefined, casterOffset: 8,
        xp: plus1(2750, 5500, 12000, 24000, 45000, 95000, 175000, 350000, 700000, 1050000), xpAfter: 350000,
    },
    ranger: {
        ...OSRIC.ranger, ...warrior, attacks: [8, 15], prof: prof(3, 3, -2), specialize: 'ua', slots: { divine: SLOTS.ranger1eDivine, arcane: SLOTS.ranger1eArcane },
        caster: undefined, casterOffset: 7, arcaneOffset: 8, startSpells: 0, requiredSpells: [], bookLevel: undefined,
        xp: plus1(2250, 4500, 10000, 20000, 40000, 90000, 150000, 225000, 325000, 650000), xpAfter: 325000,
    },
    'magic-user': {
        ...OSRIC['magic-user'], prof: prof(1, 6, -5), slots: { arcane: SLOTS.wizard },
        xp: plus1(2500, 5000, 10000, 22500, 40000, 60000, 90000, 135000, 250000, 375000, 750000), xpAfter: 375000,
    },
    illusionist: {
        ...OSRIC.illusionist, prof: prof(1, 6, -5), slots: { arcane: SLOTS.illusionist1e },
        xp: plus1(2250, 4500, 9000, 18000, 35000, 60000, 95000, 145000, 220000, 440000), xpAfter: 220000,
    },
    thief: {
        ...OSRIC.thief, prof: prof(2, 4, -3), armor: 'leather',
        xp: plus1(1250, 2500, 5000, 10000, 20000, 42500, 70000, 110000, 160000, 220000, 440000), xpAfter: 220000,
    },
    assassin: {
        ...OSRIC.assassin, prof: prof(3, 4, -2),
        xp: plus1(1500, 3000, 6000, 12000, 25000, 50000, 100000, 200000, 300000, 425000, 575000, 750000, 1000000, 1500000),
    },
    monk: {
        ...OSRIC.monk, prof: prof(1, 2, -3), min: scores(15, 15, 11, 6, 15, 6), baseMove: undefined, noRaceThiefMods: false, ageAs: 'fighter',
        xp: plus1(2250, 4750, 10000, 22500, 47500, 98000, 200000, 350000, 500000, 700000, 950000, 1250000, 1750000, 2250000, 2750000, 3250000),
        weapons: 'club|crossbow|dagger|axe \\(hand|axe, hand|hand axe|javelin|pole|halberd|spear|staff',
        features: [
            [1, 'Open-hand Combat'], [1, 'Surprise Reduction'], [3, 'Speak with Animals'], [4, 'Mask Mind from ESP'], [5, 'Immune to Disease, Haste and Slow'],
            [6, 'Feign Death'], [7, 'Self-Healing'], [8, 'Speak with Plants'], [9, 'Resist Charm and Suggestion'], [11, 'Immune to Poison'],
            [12, 'Immune to Geas and Quest'], [13, 'Quivering Palm'],
        ],
    },
};

const humanAges = {
    cleric: '18+1d4', druid: '18+1d4', fighter: '15+1d4', paladin: '17+1d4', ranger: '20+1d4', 'magic-user': '24+2d8',
    illusionist: '30+1d6', thief: '18+1d4', assassin: '20+1d4', monk: '21+1d4',
};
const mods = (pp, ol, frt, ms, hs, hn, cw, rl) => ({
    'Pick Pockets': pp, 'Open Locks': ol, 'Find/Remove Traps': frt, 'Move Silently': ms,
    'Hide in Shadows': hs, 'Hear Noise': hn, 'Climb Walls': cw, 'Read Languages': rl,
});
// Language limits, age adjustments and build dice below come from the OSRIC book only.
const base = (race) => ({ ...race, extraLanguages: undefined, ageBands: undefined, build: undefined, exclude: undefined, targets: undefined });

// npcOnly: listed in the 1e tables for NPCs only; a GM has to allow it for a player character.
const R = {
    human: { ...base(OR.human), ages: humanAges, skillmods: {} },
    dwarf: { ...base(OR.dwarf), strMax: 99, skillmods: mods(0, 10, 15, 0, 0, 0, -10, -5), npcOnly: ['cleric'] },
    elf: { ...base(OR.elf), strMax: 75, skillmods: mods(5, -5, 0, 5, 10, 5, 0, 0), npcOnly: ['cleric'] },
    gnome: {
        ...base(OR.gnome), strMax: 50, skillmods: mods(0, 5, 10, 5, 5, 10, -15, 0), npcOnly: ['cleric'],
        levels: { ...OR.gnome.levels, illusionist: (s) => (Math.min(s.int, s.dex) < 17 ? 5 : Math.max(s.int, s.dex) >= 18 ? 7 : 6) },
    },
    'half-elf': {
        ...base(OR['half-elf']), strMax: 90, skillmods: mods(10, 0, 0, 0, 5, 0, 0, 0), levels: { ...OR['half-elf'].levels, druid: Infinity },
        multi: [...OR['half-elf'].multi, ['magic-user', 'thief']],
    },
    halfling: { ...base(OR.halfling), skillmods: mods(5, 5, 5, 10, 15, 5, -15, -5), npcOnly: ['druid'] },
    'half-orc': {
        ...base(OR['half-orc']), strMax: 99, skillmods: mods(-5, 5, 5, 0, 0, 5, 5, -10),
        levels: { ...OR['half-orc'].levels, thief: step('dex', 6, { 17: 7, 18: 8 }) },
    },
};

export default {
    id: 'add1e', variant: '1', thaco: THACO_1E, thiefTable: 'add1e', thiefNames: 'add1e', nwp: false,
    checkAfterAdjust: true, useCompendiumRaceMods: false,
    methods: ['4d6drop', '3d6x12', '3d6x6each', '3d6x12sets', '3d6order', 'manual'],
    races: R, classes: C,
    raceItemExclude: /^hear noise$/i,
};
