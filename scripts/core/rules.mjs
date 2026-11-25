import { RULESETS } from '../data/index.mjs';
import { ABILITIES, ALIGNMENTS, THIEF_SKILLS, savesFor, thiefRow } from '../data/shared.mjs';
import { NWP, RANGER_2E } from '../data/add2e.mjs';

/**
 * Pure rules engine: no Foundry globals, so it can be unit-tested in Node.
 * `tables` is CONFIG.ARS (ability tables are read from the system, never duplicated here).
 */

export const STEPS = ['rules', 'abilities', 'race', 'class', 'details', 'skills', 'spells', 'equipment', 'review'];

export function newState(rulesetId = 'osric3') {
    return {
        ruleset: rulesetId,
        startLevel: 1,
        allowShortfall: false,
        hpMode: 'maxFirst',
        ignoreLimits: false,
        abilities: { method: RULESETS[rulesetId].methods[0], pool: [], assign: {}, sets: [], setIndex: null, dice: [], diceTo: [], fixed: null, manual: {}, rerolls: 0 },
        strPercent: null,
        race: null,
        classes: [],
        details: { name: '', alignment: '', sex: 'male', age: '', height: '', weight: '', deity: '', patron: '', notes: '', languages: [] },
        hp: {},
        gold: null,
        weaponProfs: [],
        nwp: [],
        thiefPoints: {},
        spells: [],
        cart: [],
    };
}

export const ruleset = (state) => RULESETS[state.ruleset];

// ───────────────────────── Ability scores ─────────────────────────

const sum = (a) => a.reduce((x, y) => x + y, 0);
const dropLowest = (dice) => sum(dice) - Math.min(...dice);

/**
 * Generate raw results for a method.
 * @param {string} method
 * @param {(n:number, faces:number) => Promise<number[]>} dice
 */
export async function rollAbilities(method, dice) {
    const r3 = async () => sum(await dice(3, 6));
    const many = async (n, fn) => {
        const out = [];
        for (let i = 0; i < n; i++) out.push(await fn());
        return out;
    };
    const fixedFrom = (values) => Object.fromEntries(ABILITIES.map((a, i) => [a, values[i]]));
    switch (method) {
        case '3d6order': return { fixed: fixedFrom(await many(6, r3)) };
        case '3d6twice': return { fixed: fixedFrom(await many(6, async () => Math.max(...(await many(2, r3))))) };
        case '3d6x6each': return { fixed: fixedFrom(await many(6, async () => Math.max(...(await many(6, r3))))) };
        case '3d6arrange': return { pool: await many(6, r3) };
        case '3d6twiceArrange': return { pool: await many(6, async () => Math.max(...(await many(2, r3)))) };
        case '4d6order': return { fixed: fixedFrom(await many(6, async () => dropLowest(await dice(4, 6)))) };
        case '4d6drop': return { pool: await many(6, async () => dropLowest(await dice(4, 6))) };
        case '3d6x12': return { pool: (await many(12, r3)).sort((a, b) => b - a).slice(0, 6) };
        case '3d6x12sets': return { sets: await many(12, async () => fixedFrom(await many(6, r3))) };
        case 'dicepool': return { dice: await dice(7, 6) };
        default: return {};
    }
}

/** Scores before racial adjustment; an ability not yet decided is null. */
export function baseScores(state) {
    const a = state.abilities;
    const out = {};
    for (const k of ABILITIES) {
        let v = null;
        switch (a.method) {
            case 'manual': v = a.manual[k] ?? null; break;
            case '3d6x12sets': v = a.sets[a.setIndex]?.[k] ?? null; break;
            case 'dicepool':
                v = a.dice.length ? 8 + sum(a.dice.filter((_, i) => a.diceTo[i] === k)) : null;
                break;
            default:
                v = a.fixed ? a.fixed[k] ?? null : a.assign[k] != null ? a.pool[a.assign[k]] ?? null : null;
        }
        out[k] = Number.isFinite(v) ? v : null;
    }
    return out;
}

/** Extra languages this character may learn, or null when the ruleset leaves it open. */
export function languageLimit(state, tables) {
    const rs = ruleset(state);
    const race = rs.races[state.race];
    if (!race || !rs.ageMods) return null;
    const int = finalScores(state).int ?? 10;
    return race.extraLanguages ? race.extraLanguages(int) : Number(tables?.intelligenceTable?.[rs.variant]?.[int]?.[0] ?? 0);
}

/** Starting age dice; a multi-class character uses the class that starts oldest. */
export function ageFormula(state) {
    const rs = ruleset(state);
    const race = rs.races[state.race];
    const average = (f) => f.split('+').reduce((n, p) => n + (p.includes('d') ? (p.split('d')[0] * (Number(p.split('d')[1]) + 1)) / 2 : Number(p)), 0);
    const options = state.classes.map((c) => race.ages.any ?? race.ages[c] ?? race.ages[rs.classes[c].ageAs]).filter(Boolean);
    return options.sort((a, b) => average(b) - average(a))[0] ?? Object.values(race.ages)[0];
}

/** Class features with the level each one starts at for this character. */
export function classFeatures(state, classKey) {
    const s = finalScores(state);
    return (ruleset(state).classes[classKey].features ?? []).map(([lvl, name]) => [typeof lvl === 'function' ? lvl(s) : lvl, name]);
}

/** Problems with the generated scores (duplicate assignment, 18 cap, unassigned dice). */
export function abilityIssues(state) {
    const a = state.abilities;
    const base = baseScores(state);
    const issues = [];
    if (ABILITIES.some((k) => base[k] === null)) issues.push({ key: 'abilitiesIncomplete' });
    if (ABILITIES.some((k) => base[k] !== null && (base[k] < 3 || base[k] > 18))) issues.push({ key: 'abilitiesRange' });
    if (a.method === 'dicepool' && a.dice.length && a.dice.some((_, i) => !a.diceTo[i])) issues.push({ key: 'dicePending' });
    return issues;
}

export function adjustedScores(state, raceKey = state.race) {
    const base = baseScores(state);
    const rs = ruleset(state);
    const race = rs.races[raceKey];
    const adj = race?.adj ?? {};
    const cap = (k, v) => (rs.capToRaceMax && race ? Math.min(race.max[k], v) : v);
    return Object.fromEntries(ABILITIES.map((k) => [k, base[k] === null ? null : cap(k, base[k] + (adj[k] ?? 0))]));
}

/** Age categories reached, oldest last; empty when the ruleset has none or the age is unknown. */
export function ageCategories(state) {
    const rs = ruleset(state);
    const race = rs.races[state.race];
    const age = parseInt(state.details.age);
    if (!rs.ageMods || !race?.ageBands || !Number.isFinite(age)) return [];
    return rs.ageMods.slice(0, 1 + race.ageBands.filter((from) => age >= from).length);
}

/**
 * Scores after ancestry and age, with exceptional strength resolved.
 * `strBeforeDecline` is the Strength that decides whether 18/xx may be rolled.
 */
export function resolveScores(state) {
    const rs = ruleset(state);
    const race = rs.races[state.race];
    const s = adjustedScores(state);
    let percent = state.strPercent ?? 0;
    let strBeforeDecline = s.str;
    const applied = {};
    for (const { key, mods } of ageCategories(state)) {
        if (key === 'grizzled') strBeforeDecline = s.str;
        for (const [k, mod] of Object.entries(mods)) {
            if (s[k] === null) continue;
            if (k === 'str' && key === 'grizzled' && percent && s.str === 18) {
                percent = 0;
                continue;
            }
            const next = s[k] + mod;
            // Wisdom alone may grow past the ancestry's maximum.
            if (next < race.min[k] || (next > race.max[k] && !(k === 'wis' && mod > 0))) continue;
            s[k] = next;
            applied[k] = (applied[k] ?? 0) + mod;
        }
        if (['youth', 'adult'].includes(key)) strBeforeDecline = s.str;
    }
    if (rs.strength00 && percent === 100 && s.str === 18) {
        s.str = rs.strength00;
        percent = 0;
    }
    return { scores: s, percent, strBeforeDecline, applied };
}
export const finalScores = (state) => resolveScores(state).scores;

// ───────────────────────── Race ─────────────────────────

export function raceStatus(state, raceKey) {
    const rs = ruleset(state);
    const race = rs.races[raceKey];
    const s = rs.checkAfterAdjust ? adjustedScores(state, raceKey) : baseScores(state);
    const reasons = [];
    for (const k of ABILITIES) {
        if (s[k] === null) continue;
        if (s[k] < race.min[k]) reasons.push({ key: 'raceMin', ability: k, value: race.min[k], score: s[k] });
        if (s[k] > race.max[k] && !rs.capToRaceMax) reasons.push({ key: 'raceMax', ability: k, value: race.max[k], score: s[k] });
    }
    return { ok: state.ignoreLimits || !reasons.length, reasons };
}

// ───────────────────────── Class ─────────────────────────

/** Level cap for a race/class pair: a number, Infinity, or 0 when not allowed. */
export function levelCap(state, classKey, raceKey = state.race) {
    const rs = ruleset(state);
    const cls = rs.classes[classKey];
    if (!cls) return 0;
    if (state.ignoreLimits) return cls.max;
    const raw = rs.races[raceKey]?.levels[classKey];
    if (raw === undefined) return 0;
    const value = typeof raw === 'function' ? raw(raceKey === state.race ? finalScores(state) : adjustedScores(state, raceKey)) : raw;
    return Math.min(value, cls.max);
}

export function classStatus(state, classKey) {
    const rs = ruleset(state);
    const cls = rs.classes[classKey];
    const s = adjustedScores(state);
    const reasons = [];
    const warnings = [];
    const short = ABILITIES.filter((k) => s[k] !== null && s[k] < cls.min[k]);
    const penalty = rs.xpPenalty && state.allowShortfall && short.length ? rs.xpPenalty[short.length - 1] ?? 0 : 0;
    if (penalty) warnings.push({ key: 'xpPenalty', value: penalty });
    else for (const k of short) reasons.push({ key: 'classMin', ability: k, value: cls.min[k], score: s[k] });
    const race = rs.races[state.race];
    if (race && race.levels[classKey] === undefined) reasons.push({ key: 'classRace' });
    if (race?.npcOnly?.includes(classKey)) warnings.push({ key: 'npcOnly' });
    return { ok: state.ignoreLimits || !reasons.length, reasons, warnings, penalty, cap: levelCap(state, classKey) };
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Multi-class combinations the current race allows, with eligibility. */
export function multiOptions(state) {
    const race = ruleset(state).races[state.race];
    return (race?.multi ?? []).map((combo) => {
        const reasons = combo.flatMap((c) => classStatus(state, c).reasons.map((r) => ({ ...r, classKey: c })));
        const noAlignment = !alignmentsFor(state, combo).length;
        if (noAlignment) reasons.push({ key: 'alignmentClash' });
        return { combo, ok: state.ignoreLimits ? !noAlignment : !reasons.length, reasons, selected: sameSet(combo, state.classes) };
    });
}

export function alignmentsFor(state, classes = state.classes) {
    const rs = ruleset(state);
    return ALIGNMENTS.filter((a) => classes.every((c) => !rs.classes[c]?.align || rs.classes[c].align.includes(a)));
}

/** Levels this character starts with, capped by race and class. */
export function startLevels(state) {
    return Object.fromEntries(state.classes.map((c) => [c, Math.max(1, Math.min(state.startLevel, levelCap(state, c) || 1))]));
}

export const maxLevel = (state) => Math.max(1, ...Object.values(startLevels(state)));

export function classIssues(state) {
    const rs = ruleset(state);
    const issues = [];
    if (!state.classes.length) return [{ key: 'classMissing' }];
    for (const c of state.classes) {
        if (!rs.classes[c]) issues.push({ key: 'classMissing' });
        else if (!classStatus(state, c).ok) issues.push({ key: 'classNotAllowed', classKey: c });
    }
    if (state.classes.length > 1 && !state.ignoreLimits && !multiOptions(state).some((m) => m.selected && m.ok)) issues.push({ key: 'comboNotAllowed' });
    return issues;
}

// ───────────────────────── Strength 18/xx ─────────────────────────

export function exceptionalStrength(state) {
    const rs = ruleset(state);
    const race = rs.races[state.race];
    if (!race || resolveScores(state).strBeforeDecline !== 18) return null;
    if (!state.classes.some((c) => rs.classes[c]?.warrior)) return null;
    const max = state.ignoreLimits ? 100 : race.strMax;
    return max > 0 ? { max } : null;
}

// ───────────────────────── XP and class ranks ─────────────────────────

/** XP needed to reach `level`. */
export function xpForLevel(cls, level) {
    if (level <= 1) return 0;
    const i = level - 2;
    if (i < cls.xp.length) return cls.xp[i];
    if (!cls.xpAfter) return cls.xp.at(-1);
    return cls.xp.at(-1) + cls.xpAfter * (i - cls.xp.length + 1);
}

/** XP bonus percentage from prime requisites. */
export function xpBonus(state, classKey) {
    const cls = ruleset(state).classes[classKey];
    const s = finalScores(state);
    const bonus = cls.prime.length && cls.prime.every((k) => (s[k] ?? 0) >= 16) ? 10 : 0;
    return bonus - classStatus(state, classKey).penalty;
}

function pad(slots, n) {
    const out = Array(n).fill(0);
    (slots ?? []).forEach((v, i) => (out[i + 1] = v));
    return out;
}

/** Spell slots by spell level (index 0 unused), including the 2e specialist bonus. */
export function slotsAt(cls, type, level) {
    const row = cls.slots?.[type]?.[Math.min(level, cls.slots[type].length) - 1] ?? [];
    const slots = pad(row, type === 'arcane' ? 10 : 8);
    if (cls.bonusSlot && type === 'arcane') for (let i = 1; i < slots.length; i++) if (slots[i]) slots[i] += 1;
    return slots;
}

export function casterLevel(cls, type, level) {
    if (!cls.slots?.[type]) return 0;
    if (cls.caster?.[type]) return Math.max(0, cls.caster[type](level));
    const offset = (type === 'arcane' ? cls.arcaneOffset : undefined) ?? cls.casterOffset ?? 0;
    if (!slotsAt(cls, type, level).some((v) => v > 0)) return 0;
    return Math.max(1, level - offset);
}

/** Hit dice formula of one level, as ARS rolls it on later level-ups. */
export function hdFormula(cls, level) {
    if (level > cls.hdLevels) return String(cls.hpAfter || 0);
    if (level === 1 && cls.firstHd) return `${cls.firstHd}d${cls.hd}+max(0,@abilities.con.hp.${cls.warrior ? 1 : 0})`;
    return `1d${cls.hd}`;
}

/** Full rank table in ARS's class schema. */
export function buildRanks(rs, cls) {
    const ranks = [];
    for (let level = 1; level <= cls.max; level++) {
        ranks.push({
            level,
            thaco: rs.thaco[cls.thacoGroup ?? cls.group](level),
            bab: 0,
            numatks: cls.warrior ? warriorAttacks(cls, level) : '1/1',
            turnLevel: cls.turn === undefined ? 0 : Math.max(0, level - cls.turn),
            xp: level < cls.max ? xpForLevel(cls, level + 1) : 0,
            hdformula: hdFormula(cls, level),
            baseMove: cls.baseMove?.(level) ?? null,
            baseAC: cls.baseAC?.[level - 1] ?? null,
            classpoints: cls.points ? (level === 1 ? cls.points[0] : cls.points[1]) : 0,
            title: '',
            ...savesFor(cls.saves ?? cls.group, level, cls.saveBonus ?? 0),
            divine: slotsAt(cls, 'divine', level),
            arcane: slotsAt(cls, 'arcane', level),
            psionic: { disciplines: 0, sciences: 0, devotions: 0, defenseModes: 0, psp: 0 },
            casterlevel: { arcane: casterLevel(cls, 'arcane', level), divine: casterLevel(cls, 'divine', level), psionic: 1 },
        });
    }
    return ranks;
}

function warriorAttacks(cls, level) {
    const [first, second] = cls.attacks ?? [7, 13];
    return level < first ? '1/1' : level < second ? '3/2' : '2/1';
}

// ───────────────────────── Hit points ─────────────────────────

/** Constitution hp bonus per die; warriors may have a higher one. */
export function conBonus(tables, variant, con, warrior) {
    const cell = tables?.constitutionTable?.[variant]?.[con]?.[0];
    const list = Array.isArray(cell) ? cell : [cell ?? 0];
    return Number((warrior && list[1]) || list[0] || 0);
}

/** Roll hit dice for every starting level of every class. */
export async function rollHp(state, tables, dice) {
    const rs = ruleset(state);
    const levels = startLevels(state);
    const con = finalScores(state).con ?? 10;
    const out = {};
    for (const [key, lvl] of Object.entries(levels)) {
        const cls = rs.classes[key];
        out[key] = [];
        for (let level = 1; level <= lvl; level++) {
            if (level > cls.hdLevels) {
                out[key].push(cls.hpAfter);
                continue;
            }
            const n = level === 1 ? cls.firstHd ?? 1 : 1;
            let value;
            if (state.hpMode === 'max' || (state.hpMode === 'maxFirst' && level === 1)) value = n * cls.hd;
            else if (state.hpMode === 'average') value = Math.ceil((n * (cls.hd + 1)) / 2);
            // OSRIC: Constitution 19 reads a 1 as a 2.
            else value = sum((await dice(n, cls.hd)).map((d) => (rs.dropFractions && con >= 19 ? Math.max(2, d) : d)));
            if (n > 1) value += (n - 1) * Math.max(0, conBonus(tables, rs.variant, con, cls.warrior));
            out[key].push(value);
        }
    }
    return out;
}

/** One entry per class level: the die, its Constitution bonus and the hit points gained. */
function hpEntries(state, tables) {
    const rs = ruleset(state);
    const con = finalScores(state).con ?? 10;
    const count = state.classes.length;
    return state.classes.flatMap((key) => {
        const cls = rs.classes[key];
        const per = conBonus(tables, rs.variant, con, cls.warrior);
        return state.hp[key].map((die, i) => {
            const bonus = i + 1 <= cls.hdLevels ? per : 0;
            return { key, i, die, bonus, gained: Math.max(1, Math.floor((die + bonus) / count)) };
        });
    });
}

/**
 * Hit points to store per class level. ARS adds round(hp / classes) per level plus
 * ceil(total Constitution / classes); under OSRIC's "drop fractions, at least 1" rule the
 * stored value is adjusted so the sheet shows the book total.
 */
export function advancementHp(state, tables) {
    if (!ruleset(state).dropFractions) return state.hp;
    const count = state.classes.length;
    const entries = hpEntries(state, tables);
    const conTotal = Math.ceil(sum(entries.map((e) => e.bonus / count)));
    const share = entries.map((e) => Math.trunc(e.bonus / count));
    let left = conTotal - sum(share);
    for (let i = 0; left !== 0; i = (i + 1) % share.length) {
        share[i] += Math.sign(left);
        left -= Math.sign(left);
    }
    const out = Object.fromEntries(state.classes.map((c) => [c, []]));
    entries.forEach((e, i) => (out[e.key][e.i] = count * (e.gained - share[i])));
    return out;
}

/** Hit point total: the book's rule for OSRIC, otherwise the arithmetic ARS uses in _getClassHPData. */
export function totalHp(state, tables) {
    const rs = ruleset(state);
    const count = state.classes.length;
    if (!count || state.classes.some((c) => !state.hp[c]?.length)) return null;
    if (rs.dropFractions) return sum(hpEntries(state, tables).map((e) => e.gained));
    const con = finalScores(state).con ?? 10;
    let hp = 0;
    let bonus = 0;
    for (const key of state.classes) {
        const cls = rs.classes[key];
        const per = conBonus(tables, rs.variant, con, cls.warrior);
        state.hp[key].forEach((die, i) => {
            if (i + 1 <= cls.hdLevels) bonus += per / count;
            hp += Math.round(die / count);
        });
    }
    return Math.max(1, hp + Math.ceil(bonus));
}

// ───────────────────────── Derived summary ─────────────────────────

export function bestSaves(state) {
    const rs = ruleset(state);
    const levels = startLevels(state);
    const best = {};
    for (const key of state.classes) {
        const cls = rs.classes[key];
        for (const [k, v] of Object.entries(savesFor(cls.saves ?? cls.group, levels[key], cls.saveBonus ?? 0))) best[k] = Math.min(best[k] ?? 20, v);
    }
    return best;
}

export function bestThaco(state) {
    const rs = ruleset(state);
    const levels = startLevels(state);
    return Math.min(20, ...state.classes.map((k) => rs.thaco[rs.classes[k].thacoGroup ?? rs.classes[k].group](levels[k])));
}

// ───────────────────────── Proficiencies and skills ─────────────────────────

/** Slots earned by `level`, matching ARS: variant 2 counts multiples of `every`, 0/1 count from level 1. */
export function slotsEarned(variant, start, every, level) {
    if (!every) return start;
    const top = variant === '2' ? level : level - 1;
    return start + Math.floor(top / every);
}

export function weaponSlots(state) {
    const rs = ruleset(state);
    const defs = state.classes.map((c) => rs.classes[c].prof);
    if (!defs.length) return { total: 0, used: 0, penalty: 0 };
    const levels = startLevels(state);
    const byBook = state.classes.map((c) => rs.classes[c].prof.start + (rs.classes[c].prof.at ?? []).filter((l) => l <= levels[c]).length);
    const total = defs.every((d) => d.at) ? Math.max(...byBook) : slotsEarned(rs.variant, Math.max(...defs.map((d) => d.start)), Math.min(...defs.map((d) => d.every)), maxLevel(state));
    return { total, used: sum(state.weaponProfs.map((p) => profCost(state, p))), penalty: Math.max(...defs.map((d) => d.penalty)) };
}

const isMissile = (name) => /bow|sling|dart|javelin/i.test(name);
const isCrossbow = (name) => /crossbow/i.test(name);
const noDouble = (name) => isMissile(name) || /two-?handed|pole|halberd|glaive|lance/i.test(name);

/** Slot cost: 1 to be proficient, plus the specialization cost of the ruleset. */
export function profCost(state, prof) {
    if (!prof.spec) return 1;
    const base = isMissile(prof.name) && !isCrossbow(prof.name) ? 3 : 2;
    return prof.spec === 2 ? base + 1 : base;
}

/** Highest specialization this character may take: 0 none, 1 single, 2 double. */
export function maxSpec(state, name = '') {
    const rs = ruleset(state);
    const kinds = state.classes.map((c) => rs.classes[c].specialize).filter(Boolean);
    if (!kinds.length) return 0;
    if (kinds.includes('2e')) return state.classes.length === 1 ? 1 : 0;
    const double = kinds.includes('double') || (kinds.includes('ua') && state.classes.includes('fighter'));
    return double && !noDouble(name) ? 2 : 1;
}

/** Attack bonuses of a specialization level for an ARS proficiency item. */
export function specBonus(state, prof) {
    if (!prof.spec) return { hit: '', damage: '', attacks: '' };
    const bow = /bow/i.test(prof.name) && !isCrossbow(prof.name);
    const lvl = maxLevel(state);
    if (state.ruleset === 'add2e') {
        if (isMissile(prof.name)) return { hit: '', damage: '', attacks: '' };
        return { hit: '1', damage: '2', attacks: lvl <= 6 ? '3/2' : lvl <= 12 ? '2/1' : '5/2' };
    }
    const bonus = prof.spec === 2 ? { hit: '3', damage: '3' } : { hit: '1', damage: '2' };
    return { ...bonus, attacks: bow ? '' : lvl <= 6 ? '3/2' : lvl <= 12 ? '2/1' : '5/2' };
}

export function nwpSlots(state, tables) {
    const rs = ruleset(state);
    if (!rs.nwp || !state.classes.length) return { total: 0, used: 0, bonus: 0 };
    const defs = state.classes.map((c) => rs.classes[c].nwp);
    const int = finalScores(state).int ?? 10;
    const bonus = Number(tables?.intelligenceTable?.['2']?.[int]?.[0] ?? 0);
    const total = slotsEarned('2', Math.max(...defs.map((d) => d.start)), Math.min(...defs.map((d) => d.every)), maxLevel(state));
    return { total: total + bonus, bonus, used: sum(state.nwp.map((name) => nwpCost(state, name))) };
}

export function nwpList(state) {
    const rs = ruleset(state);
    const groups = new Set(state.classes.flatMap((c) => rs.classes[c].nwpGroups ?? []));
    const byName = new Map();
    for (const p of NWP) {
        const inGroup = groups.has(p.group);
        const prev = byName.get(p.name);
        if (!prev || (inGroup && !prev.inGroup)) byName.set(p.name, { ...p, inGroup, cost: p.slots + (inGroup ? 0 : 1) });
    }
    const free = freeNwp(state);
    return [...byName.values()].map((p) => ({ ...p, free: free.includes(p.name), cost: free.includes(p.name) ? 0 : p.cost }))
        .sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || a.name.localeCompare(b.name));
}
export const freeNwp = (state) => state.classes.flatMap((c) => ruleset(state).classes[c].freeNwp ?? []);
export const nwpCost = (state, name) => nwpList(state).find((p) => p.name === name)?.cost ?? 1;

/**
 * Thief-style skills: name, base target and (2e) allocation limits. Dexterity, race and
 * armor adjustments are applied by ARS when it rolls, so they are previewed but not stored.
 */
export function thiefSkills(state, tables) {
    const rs = ruleset(state);
    const levels = startLevels(state);
    const key = state.classes.find((c) => rs.classes[c].thief !== undefined);
    const names = THIEF_SKILLS[rs.thiefNames];
    const race = rs.races[state.race];
    const dex = Math.min(19, Math.max(1, finalScores(state).dex ?? 10));
    const dexTable = tables?.thiefSkillMods?.dexMod?.[rs.variant] ?? {};
    const noRace = !!key && rs.classes[key].noRaceThiefMods;
    const withMods = (name, base, points = 0) => {
        const dexKey = Object.keys(dexTable).find((k) => name.toLowerCase().includes(k));
        const dexMod = dexKey ? dexTable[dexKey][dex - 1] ?? 0 : 0;
        const raceMod = noRace ? 0 : race?.skillmods?.[name] ?? 0;
        // ARS adds the race item's modifier on every roll; cancel it where the class ignores it.
        const offset = noRace ? -(race?.skillmods?.[name] ?? 0) : 0;
        return { name, base, points, offset, dexMod, raceMod, total: base + points + dexMod + raceMod };
    };
    if (!key) {
        if (state.classes.some((c) => rs.classes[c].rangerSkills)) {
            const l = Math.min(15, levels.ranger) - 1;
            return { rows: [withMods('Hide in Shadows', RANGER_2E.hide[l]), withMods('Move Silently', RANGER_2E.move[l])], points: null };
        }
        return { rows: [], points: null };
    }
    const cls = rs.classes[key];
    const level = levels[key];
    if (cls.thiefBase) {
        const total = cls.points[0] + cls.points[1] * (level - 1);
        const capPer = cls.pointsCap[0] + cls.pointsCap[1] * (level - 1);
        const rows = names.flatMap((name, i) => (cls.thiefBase[i] === null ? [] : [withMods(name, cls.thiefBase[i], Number(state.thiefPoints[name]) || 0)]));
        return { rows, points: { total, used: sum(rows.map((r) => r.points)), cap: capPer } };
    }
    const row = thiefRow(rs.thiefTable, level - cls.thief);
    const rows = names.flatMap((name, i) => (cls.thiefOnly && !cls.thiefOnly.includes(i) ? [] : [withMods(name, row[i])]));
    return { rows, points: null };
}

// ───────────────────────── Spells ─────────────────────────

/** How many arcane spells a starting spellbook should hold, plus limits from Intelligence. */
export function spellbookInfo(state, tables) {
    const rs = ruleset(state);
    const levels = startLevels(state);
    const casters = state.classes.filter((c) => rs.classes[c].slots?.arcane && bestSlotLevel(rs.classes[c], levels[c]) > 0);
    if (!casters.length) return null;
    const key = casters[0];
    const cls = rs.classes[key];
    const int = finalScores(state).int ?? 9;
    const row = tables?.intelligenceTable?.[rs.variant]?.[int] ?? [];
    return {
        classKey: key,
        maxLevel: Math.max(...casters.map((c) => bestSlotLevel(rs.classes[c], levels[c]))),
        suggested: (cls.startSpells ?? 4) + (levels[key] - (cls.bookLevel ?? 1)),
        learnChance: Number(row[2]) || 0,
        maxPerLevel: Number(row[3]) || 0,
        required: cls.requiredSpells ?? [],
        opposition: cls.opposition ?? [],
        school: cls.school ?? null,
        folder: new RegExp(casters.map((c) => rs.classes[c].spellFolder).filter(Boolean).join('|') || '.', 'i'),
    };
}
const bestSlotLevel = (cls, level) => slotsAt(cls, 'arcane', level).reduce((best, v, i) => (v > 0 && i > 0 ? i : best), 0);

// ───────────────────────── Equipment ─────────────────────────

export function goldFormula(state) {
    const rs = ruleset(state);
    const rank = { '5d4*10': 125, '(3d6+2)*10': 125, '3d6*10': 105, '2d6*10': 70, '2d4*10': 50, '(1d4+1)*10': 35, '5d4': 12 };
    return state.classes.map((c) => rs.classes[c].gold).sort((a, b) => rank[b] - rank[a])[0] ?? '3d6*10';
}

const GP = {
    0: { pp: 5, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 },
    1: { pp: 5, gp: 1, ep: 0.5, sp: 0.05, cp: 0.005 },
    2: { pp: 5, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 },
};
/** Price in gold pieces for the ruleset's coinage (1e silver is 20 to the gold piece). */
export const toGp = (value, currency, variant) => (Number(value) || 0) * (GP[variant]?.[currency] ?? 1);

export function cartTotal(state) {
    return Math.round(sum(state.cart.map((l) => l.price * l.qty)) * 1000) / 1000;
}

/** Remaining money split into coins. */
export function purse(gp, variant) {
    const copperPerGp = variant === '1' ? 200 : 100;
    const silver = variant === '1' ? 10 : 10;
    let cp = Math.max(0, Math.round(gp * copperPerGp));
    const g = Math.floor(cp / copperPerGp);
    cp -= g * copperPerGp;
    const s = Math.floor(cp / silver);
    return { gp: g, sp: s, cp: cp - s * silver };
}

/** Advisory only: does any class allow this weapon or armor? */
export function allowedGear(state, kind, name, isShield = false) {
    const rs = ruleset(state);
    const test = (rule) => {
        if (rule === undefined || rule === 'any') return true;
        if (rule === 'none') return false;
        return new RegExp(rule, 'i').test(name);
    };
    if (!state.classes.length) return true;
    const check = (c) => (kind === 'weapon' ? test(rs.classes[c].weapons) : isShield ? test(rs.classes[c].shields) : test(rs.classes[c].armor));
    return state.classes.some(check);
}

// ───────────────────────── Validation ─────────────────────────

/** Issues per step. `level: 'error'` blocks creation, 'warn' is informative. */
export function validate(state, tables) {
    const rs = ruleset(state);
    const err = (i) => ({ level: 'error', ...i });
    const warn = (i) => ({ level: 'warn', ...i });
    const out = Object.fromEntries(STEPS.map((s) => [s, []]));
    out.abilities.push(...abilityIssues(state).map(err));
    if (!state.race) out.race.push(err({ key: 'raceMissing' }));
    else if (!raceStatus(state, state.race).ok) out.race.push(err({ key: 'raceNotAllowed' }));
    out.class.push(...classIssues(state).map(err));
    if (out.class.length || !state.race) return out;

    for (const c of state.classes) for (const w of classStatus(state, c).warnings) out.class.push(warn({ ...w, classKey: c }));
    const es = exceptionalStrength(state);
    if (es && !state.strPercent) out.class.push(err({ key: 'strPercent' }));
    if (!state.details.name?.trim()) out.details.push(err({ key: 'nameMissing' }));
    if (rs.ageMods && !ageCategories(state).length) out.details.push(warn({ key: 'ageMissing' }));
    const limit = languageLimit(state, tables);
    if (limit !== null && (state.details.languages?.length ?? 0) > limit) out.details.push(warn({ key: 'languagesOver', value: limit }));
    if (!alignmentsFor(state).includes(state.details.alignment)) out.details.push(err({ key: 'alignmentMissing' }));
    if (totalHp(state, tables) === null) out.details.push(err({ key: 'hpMissing' }));
    for (const c of state.classes) if (levelCap(state, c) < state.startLevel) out.details.push(warn({ key: 'levelCapped', classKey: c, value: levelCap(state, c) }));

    const w = weaponSlots(state);
    if (w.used > w.total) out.skills.push(err({ key: 'weaponOver' }));
    else if (w.used < w.total) out.skills.push(warn({ key: 'weaponUnder', value: w.total - w.used }));
    if (rs.nwp) {
        const n = nwpSlots(state, tables);
        if (n.used > n.total) out.skills.push(err({ key: 'nwpOver' }));
        else if (n.used < n.total) out.skills.push(warn({ key: 'nwpUnder', value: n.total - n.used }));
    }
    const { points, rows } = thiefSkills(state, tables);
    if (points) {
        if (points.used > points.total) out.skills.push(err({ key: 'thiefOver' }));
        else if (points.used < points.total) out.skills.push(warn({ key: 'thiefUnder', value: points.total - points.used }));
        if (rows.some((r) => r.points < 0 || r.points > points.cap)) out.skills.push(err({ key: 'thiefCap', value: points.cap }));
        if (rows.some((r) => r.total > 95 && r.points > 0)) out.skills.push(err({ key: 'thief95' }));
    }
    const book = spellbookInfo(state, tables);
    if (book) {
        if (state.spells.length < book.suggested) out.spells.push(warn({ key: 'spellsUnder', value: book.suggested - state.spells.length }));
        if (state.spells.length > book.suggested) out.spells.push(warn({ key: 'spellsOver', value: book.suggested }));
        const missing = book.required.filter((n) => !state.spells.some((s) => s.name.toLowerCase() === n.toLowerCase()));
        if (missing.length) out.spells.push(warn({ key: 'spellsRequired', value: missing.join(', ') }));
        const perLevel = {};
        for (const s of state.spells) perLevel[s.level] = (perLevel[s.level] ?? 0) + 1;
        if (book.maxPerLevel && Object.values(perLevel).some((v) => v > book.maxPerLevel)) out.spells.push(err({ key: 'spellsMax', value: book.maxPerLevel }));
    }
    if (state.gold === null) out.equipment.push(err({ key: 'goldMissing' }));
    else if (cartTotal(state) > state.gold) out.equipment.push(err({ key: 'goldOver' }));
    return out;
}

export const hasErrors = (issues) => Object.values(issues).flat().some((i) => i.level === 'error');

/** Drop choices that stopped making sense after an earlier step changed. */
export function reconcile(state) {
    const rs = ruleset(state);
    const a = state.abilities;
    if (!rs.methods.includes(a.method)) state.abilities = newState(state.ruleset).abilities;
    if (state.race && !rs.races[state.race]) state.race = null;
    state.classes = state.classes.filter((c) => rs.classes[c]);
    if (!state.race) state.classes = [];
    if (state.classes.length > 1 && !multiOptions(state).some((m) => m.selected)) state.classes = [];
    const levels = startLevels(state);
    for (const key of Object.keys(state.hp)) if (!(key in levels) || state.hp[key].length !== levels[key]) delete state.hp[key];
    const es = exceptionalStrength(state);
    if (!es) state.strPercent = null;
    else if (state.strPercent > es.max) state.strPercent = es.max;
    if (state.classes.length && state.details.alignment && !alignmentsFor(state).includes(state.details.alignment)) state.details.alignment = '';
    for (const p of state.weaponProfs) p.spec = Math.min(p.spec ?? 0, state.classes.length ? maxSpec(state, p.name) : 0);
    if (!rs.nwp) state.nwp = [];
    else if (state.classes.length) for (const name of freeNwp(state)) if (!state.nwp.includes(name)) state.nwp.push(name);
    if (state.classes.length && !spellbookInfo(state)) state.spells = [];
    return state;
}

/** Replacing the ruleset keeps only what is ruleset-independent. */
export function switchRuleset(state, id) {
    const next = newState(id);
    next.details = { ...state.details, alignment: '' };
    next.startLevel = state.startLevel;
    next.hpMode = state.hpMode;
    next.ignoreLimits = state.ignoreLimits;
    return next;
}
