import { RULESETS } from '../data/index.mjs';
import { THIEF_SKILLS } from '../data/shared.mjs';
import * as R from './rules.mjs';

/**
 * Level advancement for an existing ARS character. Pure: works on a plain snapshot of the
 * actor and returns the document changes to write.
 *
 * XP thresholds, hit dice, saves and spell slots always come from the class item's own ranks,
 * so house-ruled and third-party classes advance too. The rulesets only add what a class item
 * cannot express: ancestry limits, proficiency levels, thief skills and spells gained.
 */

const FLAG = 'ars-character-creator';
const SAVES = ['paralyzation', 'poison', 'death', 'rod', 'staff', 'wand', 'petrification', 'polymorph', 'breath', 'spell'];
const plain = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sum = (a) => a.reduce((x, y) => x + y, 0);
const num = (v) => Number(v) || 0;

/** Which of the ruleset's classes (or races) an item stands for, or null. */
function findKey(defs, item) {
    const names = [item.name, item.system?.type].map(plain).filter(Boolean);
    for (const [key, def] of Object.entries(defs)) {
        const known = [key, def.label, ...(def.compendium ?? [])].map(plain);
        if (names.some((n) => known.includes(n))) return key;
    }
    return null;
}

/**
 * @param {object} actor Plain data: {flags, items, system} with `system.abilities` as ARS derives them.
 * @param {string} rulesetId
 */
export function snapshot(actor, rulesetId) {
    const rs = RULESETS[rulesetId];
    const items = actor.items;
    const of = (type) => items.filter((i) => i.type === type);
    const raceItem = of('race')[0] ?? null;
    const abilities = actor.system.abilities;
    return {
        rulesetId,
        raceKey: raceItem ? findKey(rs.races, raceItem) : null,
        raceItem,
        scores: Object.fromEntries(['str', 'int', 'wis', 'dex', 'con', 'cha'].map((k) => [k, num(abilities[k].value)])),
        percent: num(abilities.str.percent),
        classes: of('class').map((i) => ({
            id: i._id, name: i.name, key: findKey(rs.classes, i), active: i.system.active !== false, xp: num(i.system.xp), xpbonus: num(i.system.xpbonus),
            advancement: Object.values(i.system.advancement ?? []), ranks: Object.values(i.system.ranks ?? []), features: i.system.features ?? {}, itemList: i.system.itemList ?? [],
        })),
        skills: of('skill'),
        profs: of('proficiency'),
        weapons: of('weapon'),
        spells: of('spell'),
        book: items.find((i) => i.type === 'container' && /spell ?book|grim[oó]ri/i.test(i.name)) ?? null,
        ids: new Set(items.map((i) => i._id)),
        names: new Set(items.map((i) => `${i.type}|${i.name.toLowerCase()}`)),
        purse: Object.fromEntries(['pp', 'gp', 'ep', 'sp', 'cp'].map((k) => [k, num(actor.system.currency?.[k])])),
        saves: Object.fromEntries(SAVES.map((k) => [k, num(actor.system.saves?.[k]?.value) || 20])),
    };
}

export const rulesOf = (snap) => RULESETS[snap.rulesetId];
export const levelOf = (cls) => cls.advancement.length;
const activeCount = (snap) => snap.classes.filter((c) => c.active).length;

/** A wizard state standing in for the character, optionally with one class a level higher. */
export function stateOf(snap, bump = null) {
    const state = R.newState(snap.rulesetId);
    const known = snap.classes.filter((c) => c.key);
    state.race = snap.raceKey;
    state.classes = known.map((c) => c.key);
    state.levels = Object.fromEntries(known.map((c) => [c.key, Math.max(1, levelOf(c) + (c.id === bump ? 1 : 0))]));
    state.scoresOverride = { scores: { ...snap.scores }, percent: snap.percent };
    return state;
}

// ───────────────────────── Experience ─────────────────────────

/** Progress of one class toward its next level. */
export function classProgress(snap, cls) {
    const level = levelOf(cls);
    const rank = cls.ranks[level - 1];
    const maxRank = cls.ranks.length;
    const cap = cls.key && snap.raceKey ? R.levelCap(stateOf(snap), cls.key) || maxRank : maxRank;
    const floor = level > 1 ? num(cls.ranks[level - 2]?.xp) : 0;
    const next = level < maxRank ? num(rank?.xp) : 0;
    const limit = Math.min(cap, maxRank);
    const atCap = level >= limit;
    return {
        id: cls.id, key: cls.key, name: cls.name, level, xp: cls.xp, next, active: cls.active, cap: limit, atCap, topRank: level >= maxRank,
        ready: cls.active && level > 0 && !atCap && next > 0 && cls.xp >= next,
        missing: Math.max(0, next - cls.xp),
        percent: next > floor ? Math.max(0, Math.min(100, Math.round(((cls.xp - floor) / (next - floor)) * 100))) : 100,
        bonus: cls.xpbonus,
    };
}

/** Share an award between active classes: split evenly, drop fractions, then apply each bonus. */
export function splitXp(snap, total) {
    const active = snap.classes.filter((c) => c.active);
    if (!active.length) return [];
    const share = Math.trunc(num(total) / active.length);
    return active.map((c) => ({ id: c.id, name: c.name, share, gain: share + Math.trunc((share * c.xpbonus) / 100), xp: c.xp }));
}

// ───────────────────────── Training ─────────────────────────

/** Training rules: OSRIC rolls 1d3 weeks at a flat price, 1e pays per week, 2e leaves it to the GM. */
export function training(snap, level, weeks) {
    switch (snap.rulesetId) {
        case 'osric3': return { dice: '1d3', cost: 1500 * level, weeks };
        case 'add1e': return { dice: null, options: [1, 2, 3, 4], cost: 1500 * level * (weeks || 1), weeks: weeks || 1 };
        default: return null;
    }
}

export const purseGp = (snap) => sum(Object.entries(snap.purse).map(([k, v]) => R.toGp(v, k, rulesOf(snap).variant)));

/** Coins left after paying, or null when the purse is too light. */
export function pay(snap, cost) {
    const left = purseGp(snap) - cost;
    return left < 0 ? null : R.purse(left, rulesOf(snap).variant);
}

// ───────────────────────── Hit points ─────────────────────────

/** ARS's Constitution sum, in the same order it adds the fractions. */
function conTotal(snap, tables, bump) {
    const rs = rulesOf(snap);
    const n = activeCount(snap) || 1;
    const maxInactive = Math.max(0, ...snap.classes.filter((c) => !c.active).map(levelOf));
    let total = 0;
    for (const c of snap.classes) {
        const per = R.conBonus(tables, rs.variant, snap.scores.con, c.features.bonuscon);
        const top = levelOf(c) + (c.id === bump ? 1 : 0);
        for (let l = 1; l <= top; l++) {
            if (maxInactive && c.active && l <= maxInactive) continue;
            if (l <= (parseInt(c.features.lasthitdice) || 999)) total += per / n;
        }
    }
    return Math.ceil(total);
}

/** Hit points gained for a die result, and the value to store so ARS shows that gain. */
export function hpGain(snap, classId, die, tables) {
    const rs = rulesOf(snap);
    const cls = snap.classes.find((c) => c.id === classId);
    const level = levelOf(cls) + 1;
    const n = activeCount(snap) || 1;
    const maxInactive = Math.max(0, ...snap.classes.filter((c) => !c.active).map(levelOf));
    // Dual-class: nothing until the new class passes the old one.
    if (maxInactive >= level) return { gained: 0, stored: 0, dual: true };
    const within = level <= (parseInt(cls.features.lasthitdice) || 999);
    const per = within ? R.conBonus(tables, rs.variant, snap.scores.con, cls.features.bonuscon) : 0;
    const delta = conTotal(snap, tables, classId) - conTotal(snap, tables, null);
    if (rs.dropFractions) {
        const gained = Math.max(1, Math.floor((die + per) / n));
        return { gained, stored: n * (gained - delta), con: per };
    }
    const gained = Math.round(die / n) + delta;
    if (gained >= 1) return { gained, stored: die, con: per };
    return { gained: 1, stored: n * (1 - delta), con: per };
}

/** The hit die result after rules that change it: OSRIC Constitution 19 reads a 1 as a 2. */
export const adjustDie = (snap, die, rolled = true) => (rolled && rulesOf(snap).dropFractions && snap.scores.con >= 19 && die === 1 ? 2 : die);

// ───────────────────────── Plan ─────────────────────────

const rankAt = (cls, level) => cls.ranks[level - 1] ?? {};
/** Best save of every class at its level, as ARS does. */
function bestOf(snap, key, bump, start = 20) {
    return Math.min(start, ...snap.classes.map((c) => num(rankAt(c, levelOf(c) + (c.id === bump ? 1 : 0))[key]) || start));
}
function slotsOf(snap, type, bump) {
    const n = type === 'arcane' ? 10 : 8;
    return Array.from({ length: n }, (_, i) => sum(snap.classes.map((c) => num(rankAt(c, levelOf(c) + (c.id === bump ? 1 : 0))[type]?.[i]))));
}
const casterOf = (snap, type, bump) => Math.max(0, ...snap.classes.map((c) => num(rankAt(c, levelOf(c) + (c.id === bump ? 1 : 0)).casterlevel?.[type])));

/** Everything the next level of a class brings. */
export function planLevel(snap, classId, tables) {
    const rs = rulesOf(snap);
    const cls = snap.classes.find((c) => c.id === classId);
    const level = levelOf(cls) + 1;
    const before = rankAt(cls, level - 1);
    const after = rankAt(cls, level);
    const now = stateOf(snap);
    const then = stateOf(snap, classId);
    const def = cls.key ? rs.classes[cls.key] : null;

    const saves = SAVES.map((key) => ({ key, from: bestOf(snap, key, null), to: bestOf(snap, key, classId) }));
    const slots = ['arcane', 'divine'].flatMap((type) => {
        const from = slotsOf(snap, type, null);
        return slotsOf(snap, type, classId).map((to, i) => ({ type, level: i, from: from[i], to }));
    });

    // Skills that improve by table; the delta keeps GM adjustments to the stored target.
    const rowsNow = R.thiefSkills(now, tables);
    const rowsThen = R.thiefSkills(then, tables);
    const skillGains = rowsThen.rows.flatMap((row) => {
        const old = rowsNow.rows.find((r) => r.name === row.name);
        const item = snap.skills.find((s) => s.name.toLowerCase() === row.name.toLowerCase());
        const delta = row.base - (old?.base ?? row.base);
        return item && delta ? [{ id: item._id, name: item.name, from: num(item.system.features.target), to: num(item.system.features.target) + delta }] : [];
    });

    // 2e discretionary thief points
    let points = null;
    if (def?.points) {
        const total = sum(cls.ranks.slice(0, level).map((r) => num(r.classpoints)));
        const rows = rowsThen.rows.flatMap((row) => {
            const item = snap.skills.find((s) => s.name.toLowerCase() === row.name.toLowerCase());
            if (!item) return [];
            const spent = num(item.system.features.modifiers?.class);
            return [{ id: item._id, name: item.name, spent, total: row.base + spent + row.dexMod + row.raceMod }];
        });
        const used = sum(rows.map((r) => r.spent));
        points = { available: Math.max(0, total - used), cap: def.pointsCap[1], rows };
    }

    // Proficiency slots, including any left unspent earlier
    const profUsed = sum(snap.profs.map((p) => num(p.system.proficiencies?.cost)));
    const weaponTotal = cls.key ? R.weaponSlots(then).total : 0;
    const weapon = { total: weaponTotal, used: profUsed, available: Math.max(0, weaponTotal - profUsed) };
    let nwp = null;
    if (rs.nwp && cls.key) {
        const { total } = R.nwpSlots(then, tables);
        const used = sum(snap.skills.map((s) => num(s.system.features?.cost)));
        nwp = { total, used, available: Math.max(0, total - used) };
    }

    return {
        classId, key: cls.key, name: cls.name, level, formula: String(after.hdformula ?? '0'),
        thaco: { from: bestOf(snap, 'thaco', null), to: bestOf(snap, 'thaco', classId) },
        attacks: before.numatks !== after.numatks ? { from: before.numatks, to: after.numatks } : null,
        turn: num(after.turnLevel) > num(before.turnLevel) ? { from: num(before.turnLevel), to: num(after.turnLevel) } : null,
        baseAC: Number.isInteger(after.baseAC) && after.baseAC !== before.baseAC ? { from: before.baseAC, to: after.baseAC } : null,
        move: after.baseMove && after.baseMove !== before.baseMove ? { from: before.baseMove, to: after.baseMove } : null,
        saves: saves.filter((s) => s.from !== s.to), slots: slots.filter((s) => s.from !== s.to),
        skillGains, points, weapon, nwp, spells: spellGain(snap, cls, level, then, tables),
        features: featureNames(snap, cls, level, then), specs: specUpgrades(snap, then),
    };
}

/** Features a class without a compendium item gains by name. */
function featureNames(snap, cls, level, state) {
    if (cls.itemList.length || !cls.key) return [];
    return R.classFeatures(state, cls.key).filter(([l, name]) => l === level && !snap.names.has(`ability|${name.toLowerCase()}`)).map(([, name]) => name);
}

/** Spells added to the book when this class gains a level. */
function spellGain(snap, cls, level, state, tables) {
    const rs = rulesOf(snap);
    const def = cls.key ? rs.classes[cls.key] : null;
    if (!def?.slots?.arcane || !def.startSpells) return null;
    const first = def.bookLevel ?? 1;
    if (level < first) return null;
    const own = { ...state, classes: [cls.key], levels: { [cls.key]: level } };
    const info = R.spellbookInfo(own, tables);
    if (!info) return null;
    const perLevel = {};
    for (const s of snap.spells) perLevel[num(s.system.level)] = (perLevel[num(s.system.level)] ?? 0) + 1;
    return {
        count: level === first ? def.startSpells : 1, optional: rs.id === 'add2e', maxLevel: info.maxLevel, folder: info.folder, opposition: info.opposition, school: info.school,
        maxPerLevel: info.maxPerLevel, learnChance: info.learnChance, perLevel, known: snap.spells.map((s) => s.name.toLowerCase()),
        required: level === first ? info.required : [],
    };
}

/** Specialised weapons whose attack rate changes with this level. */
function specUpgrades(snap, state) {
    if (!state.classes.length) return [];
    return snap.profs.flatMap((p) => {
        const m = p.name.match(/^(.*) \((Double )?Specialization\)$/);
        if (!m) return [];
        const { attacks } = R.specBonus(state, { name: m[1], spec: m[2] ? 2 : 1 });
        return attacks && attacks !== p.system.attacks ? [{ id: p._id, name: p.name, from: p.system.attacks, to: attacks }] : [];
    });
}

/** Weapon proficiencies that may still be specialised (2e single-class fighters). */
export function specializable(snap, classId) {
    if (snap.rulesetId !== 'add2e') return [];
    const state = stateOf(snap, classId);
    return snap.profs.filter((p) => num(p.system.proficiencies?.cost) > 0 && !/Specialization\)$/.test(p.name) && R.maxSpec(state, p.name) > 0)
        .map((p) => ({ id: p._id, name: p.name, cost: R.profCost(state, { name: p.name, spec: 1 }) - 1 }));
}

/** Entries of a class or race item that this level should add to the actor. */
export function pendingGrants(snap, source, level) {
    const rs = rulesOf(snap);
    const osricThief = rs.thiefNames === 'osric' ? null : new Set(THIEF_SKILLS.osric.map((n) => n.toLowerCase()));
    const race = snap.raceKey ? rs.races[snap.raceKey] : null;
    return source.filter((sub) => {
        const id = sub.id || sub.uuid?.split('.').pop();
        if (!id || snap.ids.has(id) || (parseInt(sub.level) || 0) > level) return false;
        const name = String(sub.name ?? '');
        return !osricThief?.has(name.toLowerCase()) && !race?.exclude?.test(name) && !rs.raceItemExclude?.test(name);
    });
}

// ───────────────────────── Choices ─────────────────────────

/**
 * Problems with the player's choices.
 * @param {object} choices {die, weapons: string[], upgrades: id[], nwp: string[], points: {id: n}, spells: [{name, level}], payTraining}
 */
export function checkChoices(snap, plan, choices, tables) {
    const out = [];
    const state = stateOf(snap, plan.classId);
    if (!Number.isFinite(choices.die)) out.push({ level: 'error', key: 'hpMissing' });
    const upgradeCost = sum(specializable(snap, plan.classId).filter((s) => choices.upgrades.includes(s.id)).map((s) => s.cost));
    const weaponUsed = choices.weapons.length + upgradeCost;
    if (weaponUsed > plan.weapon.available) out.push({ level: 'error', key: 'weaponOver' });
    else if (weaponUsed < plan.weapon.available) out.push({ level: 'warn', key: 'weaponUnder', value: plan.weapon.available - weaponUsed });
    if (plan.nwp) {
        const used = sum(choices.nwp.map((n) => R.nwpCost(state, n)));
        if (used > plan.nwp.available) out.push({ level: 'error', key: 'nwpOver' });
        else if (used < plan.nwp.available) out.push({ level: 'warn', key: 'nwpUnder', value: plan.nwp.available - used });
    }
    if (plan.points) {
        const spent = plan.points.rows.map((r) => num(choices.points[r.id]));
        if (sum(spent) > plan.points.available) out.push({ level: 'error', key: 'thiefOver' });
        else if (sum(spent) < plan.points.available) out.push({ level: 'warn', key: 'thiefUnder', value: plan.points.available - sum(spent) });
        if (spent.some((v) => v < 0 || v > plan.points.cap)) out.push({ level: 'error', key: 'thiefCap', value: plan.points.cap });
        if (plan.points.rows.some((r, i) => spent[i] > 0 && r.total + spent[i] > 95)) out.push({ level: 'error', key: 'thief95' });
    }
    if (plan.spells) {
        if (choices.spells.length > plan.spells.count) out.push({ level: 'warn', key: 'spellsOver', value: plan.spells.count });
        else if (choices.spells.length < plan.spells.count && !plan.spells.optional) out.push({ level: 'warn', key: 'spellsUnder', value: plan.spells.count - choices.spells.length });
        const count = { ...plan.spells.perLevel };
        for (const s of choices.spells) count[s.level] = (count[s.level] ?? 0) + 1;
        if (plan.spells.maxPerLevel && choices.spells.some((s) => count[s.level] > plan.spells.maxPerLevel)) out.push({ level: 'error', key: 'spellsMax', value: plan.spells.maxPerLevel });
    }
    if (choices.payTraining) {
        const t = training(snap, plan.level - 1, choices.weeks);
        if (t && !pay(snap, t.cost)) out.push({ level: 'error', key: 'goldOver' });
    }
    return out;
}

// ───────────────────────── Changes ─────────────────────────

/** Document changes that apply a level. Grants and spells are loaded by the caller. */
export function levelChanges(snap, plan, choices, tables) {
    const cls = snap.classes.find((c) => c.id === plan.classId);
    const state = stateOf(snap, plan.classId);
    const hp = hpGain(snap, plan.classId, choices.die, tables);
    const needed = num(rankAt(cls, plan.level - 1).xp);

    const updates = new Map();
    const update = (id, data) => updates.set(id, { ...(updates.get(id) ?? { _id: id }), ...data });
    update(cls.id, { 'system.advancement': [...cls.advancement, { level: plan.level, hp: hp.stored }], 'system.xp': Math.max(cls.xp, needed) });
    for (const g of plan.skillGains) update(g.id, { 'system.features.target': String(g.to) });
    for (const r of plan.points?.rows ?? []) {
        const add = num(choices.points[r.id]);
        if (add) update(r.id, { 'system.features.modifiers.class': r.spent + add });
    }
    for (const s of plan.specs) update(s.id, { 'system.attacks': s.to });
    for (const s of specializable(snap, plan.classId).filter((x) => choices.upgrades.includes(x.id))) {
        const prof = { name: s.name, spec: 1 };
        update(s.id, { name: `${s.name} (Specialization)`, 'system.proficiencies.cost': R.profCost(state, prof), ...prefixed(R.specBonus(state, prof)) });
    }

    const create = [];
    for (const name of plan.features) create.push({ name, type: 'ability', img: 'icons/sundries/documents/document-sealed-brown-red.webp', system: { description: '' } });
    for (const name of choices.weapons) {
        const key = weaponWords(name);
        create.push({
            name, type: 'proficiency', img: 'icons/skills/melee/weapons-crossed-swords-yellow.webp',
            system: { proficiencies: { cost: 1 }, appliedto: snap.weapons.filter((w) => weaponWords(w.name) === key).map((w) => ({ id: w._id })), hit: '', damage: '', attacks: '', speed: 0 },
        });
    }
    if (plan.nwp) {
        const list = R.nwpList(state);
        for (const name of choices.nwp) {
            const p = list.find((x) => x.name === name);
            if (p) create.push({
                name, type: 'skill', img: 'icons/skills/trades/academics-study-reading-book.webp',
                system: { groups: '', features: { type: 'decending', ability: p.ability, target: '20', formula: '1d20', cost: p.cost, modifiers: { formula: '0', other: p.mod } } },
            });
        }
    }

    const slots = (type) => Object.fromEntries(slotsOf(snap, type, plan.classId).map((v, i) => [i, v]));
    const actor = {
        'system.attributes.thaco.value': plan.thaco.to,
        'system.spellInfo.level.arcane.value': casterOf(snap, 'arcane', plan.classId),
        'system.spellInfo.level.divine.value': casterOf(snap, 'divine', plan.classId),
        'system.spellInfo.slots.arcane.value': slots('arcane'),
        'system.spellInfo.slots.divine.value': slots('divine'),
        ...Object.fromEntries(SAVES.map((k) => [`system.saves.${k}.value`, bestOf(snap, k, plan.classId)])),
    };
    const t = choices.payTraining ? training(snap, plan.level - 1, choices.weeks) : null;
    if (t) {
        const coins = pay(snap, t.cost);
        Object.assign(actor, { 'system.currency.pp': '0', 'system.currency.ep': '0', 'system.currency.gp': String(coins.gp), 'system.currency.sp': String(coins.sp), 'system.currency.cp': String(coins.cp) });
    }
    return { hp, updates: [...updates.values()], create, actor };
}

const prefixed = (spec) => ({ 'system.hit': spec.hit, 'system.damage': spec.damage, 'system.attacks': spec.attacks });
const weaponWords = (name) => name.toLowerCase().replace(/\bthrown\b/g, '').replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/** The ruleset a character was made with, or the one matching the world. */
export function rulesetOf(actor, variant) {
    const made = actor.flags?.[FLAG]?.ruleset;
    if (RULESETS[made]) return made;
    return Object.values(RULESETS).find((r) => r.variant === String(variant))?.id ?? 'osric3';
}
