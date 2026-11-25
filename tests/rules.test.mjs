import test from 'node:test';
import assert from 'node:assert/strict';
import { RULESETS } from '../scripts/data/index.mjs';
import { ABILITIES, THIEF_SKILLS, thiefRow } from '../scripts/data/shared.mjs';
import * as R from '../scripts/core/rules.mjs';
import { builtinItem, buildActor, weaponKey } from '../scripts/core/builder.mjs';
import { ARMOR_1E, ARMOR_2E, GEAR, WEAPONS_1E, WEAPONS_2E } from '../scripts/data/equipment.mjs';
import { dumpContent, emptyContent, loadArs, randomID, seeded } from './harness.mjs';

const ars = await loadArs();
const tables = ars?.ARS;
const skip = ars ? false : 'set ARS_SRC to run';
const dump = dumpContent();

function character(id, { race = 'human', classes = ['fighter'], level = 1, scores = {}, alignment } = {}) {
    const s = R.newState(id);
    s.abilities.method = 'manual';
    s.abilities.manual = { str: 12, int: 12, wis: 12, dex: 12, con: 12, cha: 12, ...scores };
    s.race = race;
    s.classes = classes;
    s.startLevel = level;
    s.details.name = 'Test';
    s.details.alignment = alignment ?? R.alignmentsFor(s)[0];
    return s;
}

/** Scores that satisfy a race and a set of classes at once, or null. */
function fitting(id, raceKey, classes) {
    const rs = RULESETS[id];
    const race = rs.races[raceKey];
    const out = {};
    for (const k of ABILITIES) {
        const adj = race.adj?.[k] ?? 0;
        const need = Math.max(3, ...classes.map((c) => rs.classes[c].min[k] - adj), rs.checkAfterAdjust ? race.min[k] - adj : race.min[k]);
        const cap = Math.min(18, rs.checkAfterAdjust ? race.max[k] - adj : race.max[k]);
        if (need > cap) return null;
        out[k] = Math.min(cap, Math.max(need, 9));
    }
    return out;
}

test('every method yields six scores in range', async () => {
    for (const rs of Object.values(RULESETS)) {
        for (const method of rs.methods.filter((m) => m !== 'manual')) {
            const s = R.newState(rs.id);
            s.abilities.method = method;
            Object.assign(s.abilities, await R.rollAbilities(method, seeded(7)));
            if (s.abilities.pool.length) ABILITIES.forEach((k, i) => (s.abilities.assign[k] = i));
            if (s.abilities.sets.length) s.abilities.setIndex = 3;
            if (s.abilities.dice.length) s.abilities.diceTo = s.abilities.dice.map((_, i) => ABILITIES[i % 6]);
            const base = R.baseScores(s);
            for (const k of ABILITIES) assert.ok(base[k] >= 3 && base[k] <= 18, `${rs.id} ${method} ${k}=${base[k]}`);
        }
    }
});

test('the 2e dice pool cannot exceed 18 and wants every die placed', () => {
    const s = R.newState('add2e');
    s.abilities.method = 'dicepool';
    s.abilities.dice = [6, 6, 5, 4, 3, 2, 1];
    s.abilities.diceTo = ['str', 'str'];
    assert.equal(R.baseScores(s).str, 20);
    assert.deepEqual(R.abilityIssues(s).map((i) => i.key).sort(), ['abilitiesRange', 'dicePending']);
});

test('OSRIC 3.0: scores above an ancestry maximum are lowered, age adjusts them', () => {
    const halfling = character('osric3', { race: 'halfling', classes: ['thief'], scores: { str: 18, dex: 18, con: 12 } });
    assert.ok(R.raceStatus(halfling, 'halfling').ok);
    assert.equal(R.adjustedScores(halfling).str, 17);
    assert.equal(R.adjustedScores(halfling).dex, 18);
    assert.ok(!R.raceStatus(character('osric3', { race: 'dwarf', scores: { con: 10 } }), 'dwarf').ok, 'too low still bars the ancestry');

    const h = character('osric3', { classes: ['fighter'], scores: { str: 14, wis: 10, con: 12 } });
    assert.deepEqual(R.ageCategories(h), []);
    h.details.age = '17';
    assert.deepEqual([R.finalScores(h).wis, R.finalScores(h).con, R.finalScores(h).str], [9, 13, 14], 'youth');
    h.details.age = '25';
    assert.deepEqual([R.finalScores(h).wis, R.finalScores(h).con, R.finalScores(h).str], [10, 13, 15], 'adult keeps the youth modifiers');
    h.details.age = '45';
    assert.deepEqual([R.finalScores(h).wis, R.finalScores(h).con, R.finalScores(h).str], [11, 12, 14], 'grizzled');

    const max = character('osric3', { scores: { str: 18, con: 18 } });
    max.details.age = '22';
    assert.deepEqual([R.finalScores(max).str, R.finalScores(max).con], [18, 18], 'never past the ancestry maximum');
    max.strPercent = 60;
    max.details.age = '42';
    assert.deepEqual([R.resolveScores(max).scores.str, R.resolveScores(max).percent], [18, 0], 'grizzled: exceptional strength drops to 18');
});

test('OSRIC 3.0: 18/00 is Strength 19, and no racial cap on the roll', () => {
    const s = character('osric3', { race: 'elf', scores: { str: 18 } });
    assert.equal(R.exceptionalStrength(s).max, 100);
    s.strPercent = 100;
    assert.deepEqual([R.resolveScores(s).scores.str, R.resolveScores(s).percent], [19, 0]);
    assert.equal(R.exceptionalStrength(s).max, 100, 'the roll stays available');
});

test('OSRIC 3.0: classes and limits from the book', () => {
    const rs = RULESETS.osric3;
    assert.equal(R.levelCap(character('osric3', { race: 'half-elf' }), 'cleric'), 5);
    assert.equal(R.levelCap(character('osric3', { race: 'half-elf' }), 'assassin'), 11);
    assert.deepEqual([R.xpForLevel(rs.classes.monk, 5), R.xpForLevel(rs.classes.paladin, 2), R.xpForLevel(rs.classes['magic-user'], 12)], [21250, 2550, 750000]);
    assert.ok(R.classStatus(character('osric3', { classes: ['monk'], scores: { dex: 15, con: 6 } }), 'monk').ok, 'monks need only Str 10, Wis 10, Dex 15');
    assert.deepEqual(R.goldFormula(character('osric3')), '5d4*10');
    const at = (c, level) => R.weaponSlots(character('osric3', { classes: [c], level })).total;
    assert.deepEqual([at('thief', 5), at('thief', 6)], [2, 3]);
    assert.deepEqual([at('paladin', 4), at('paladin', 5)], [3, 4]);
    assert.deepEqual([at('assassin', 3), at('assassin', 4)], [3, 4]);
    const monk = (scores) => Object.fromEntries(R.classFeatures(character('osric3', { classes: ['monk'], scores: { dex: 15, ...scores } }), 'monk').map(([l, n]) => [n, l]));
    assert.equal(monk({ wis: 15 })['Speak with Animals'], 3);
    assert.equal(monk({ wis: 12 })['Speak with Animals'], 5);
});

test('OSRIC 3.0: optional XP penalty for missed minimums', () => {
    const s = character('osric3', { classes: ['ranger'], scores: { str: 13, int: 12, wis: 12, con: 14, dex: 10 } });
    assert.ok(!R.classStatus(s, 'ranger').ok);
    s.allowShortfall = true;
    assert.ok(R.classStatus(s, 'ranger').ok);
    assert.equal(R.xpBonus(s, 'ranger'), -15);
    s.details.alignment = 'lg';
    assert.deepEqual(R.validate(s, tables).class.filter((i) => i.level === 'warn').map((i) => [i.key, i.value]), [['xpPenalty', 15]]);
    s.abilities.manual = { ...s.abilities.manual, str: 8, con: 8 };
    assert.ok(!R.classStatus(s, 'ranger').ok, 'four missed minimums are too many');
    const other = character('add1e', { classes: ['ranger'], scores: { str: 12 } });
    other.allowShortfall = true;
    assert.ok(!R.classStatus(other, 'ranger').ok, 'OSRIC rule only');
});

test('OSRIC 3.0: languages and starting age', () => {
    assert.equal(R.languageLimit(character('osric3', { race: 'dwarf', scores: { int: 18 } }), tables), 2);
    assert.equal(R.languageLimit(character('osric3', { race: 'elf', scores: { int: 17 } }), tables), 2);
    assert.equal(R.ageFormula(character('osric3', { race: 'elf', classes: ['fighter', 'magic-user'] })), '150+5d6');
    assert.equal(R.ageFormula(character('osric3', { classes: ['monk'] })), '20+1d4');
});

test('racial adjustments and limits', () => {
    const dwarf = character('add1e', { race: 'dwarf', scores: { con: 11, str: 8 } });
    assert.equal(R.adjustedScores(dwarf).con, 12);
    assert.ok(R.raceStatus(dwarf, 'dwarf').ok, '1e checks after adjustment');
    const twoE = character('add2e', { race: 'dwarf', scores: { con: 10, str: 8 } });
    assert.ok(!R.raceStatus(twoE, 'dwarf').ok, '2e checks before adjustment');
    assert.equal(R.levelCap(character('add1e', { race: 'elf', scores: { str: 18 } }), 'fighter'), 7);
    assert.equal(R.levelCap(character('add1e', { race: 'elf', scores: { str: 12 } }), 'fighter'), 5);
    assert.equal(R.levelCap(character('add2e', { race: 'elf' }), 'mage'), 15);
    assert.equal(R.levelCap(character('osric3', { race: 'half-elf' }), 'druid'), 14, 'OSRIC 3 half-elves can be druids');
    assert.equal(R.levelCap(character('osric3', { race: 'gnome', scores: { int: 18, dex: 17 } }), 'illusionist'), 7);
    assert.equal(R.levelCap(character('osric3', { race: 'dwarf' }), 'magic-user'), 0);
});

test('alignment intersection', () => {
    assert.deepEqual(R.alignmentsFor(character('osric3'), ['paladin']), ['lg']);
    assert.deepEqual(R.alignmentsFor(character('osric3'), ['druid', 'ranger']), []);
    assert.ok(!R.alignmentsFor(character('add1e'), ['thief']).includes('lg'));
});

test('exceptional strength only for warriors with 18, capped by race', () => {
    assert.equal(R.exceptionalStrength(character('add1e', { scores: { str: 18 } })).max, 100);
    assert.equal(R.exceptionalStrength(character('add1e', { race: 'elf', scores: { str: 18 } })).max, 75);
    assert.equal(R.exceptionalStrength(character('osric3', { race: 'halfling', scores: { str: 18, dex: 10 } })), null);
    assert.equal(R.exceptionalStrength(character('add2e', { race: 'halfling', scores: { str: 18 } })), null);
    assert.equal(R.exceptionalStrength(character('add1e', { classes: ['thief'], scores: { str: 18 } })), null);
});

test('XP tables and published checkpoints', () => {
    const xp = (id, c, l) => R.xpForLevel(RULESETS[id].classes[c], l);
    assert.equal(xp('osric3', 'fighter', 5), 17000);
    assert.equal(xp('add1e', 'fighter', 5), 18001);
    assert.equal(xp('osric3', 'assassin', 2), 1500);
    assert.equal(xp('add2e', 'fighter', 10), 500000);
    assert.equal(xp('add2e', 'fighter', 11), 750000);
    for (const rs of Object.values(RULESETS)) {
        for (const [k, c] of Object.entries(rs.classes)) {
            for (let l = 2; l <= c.max; l++) assert.ok(R.xpForLevel(c, l) > R.xpForLevel(c, l - 1), `${rs.id} ${k} ${l}`);
        }
    }
});

test('proficiency slots follow the same rounding as ARS', () => {
    assert.equal(R.slotsEarned('1', 4, 3, 3), 4);
    assert.equal(R.slotsEarned('1', 4, 3, 4), 5);
    assert.equal(R.slotsEarned('2', 4, 3, 3), 5);
    const c3 = (level) => R.weaponSlots(character('osric3', { classes: ['cleric'], level })).total;
    const c1 = (level) => R.weaponSlots(character('add1e', { classes: ['cleric'], level })).total;
    assert.deepEqual([c3(3), c3(4)], [2, 3], 'OSRIC cleric gains the 3rd proficiency at level 4');
    assert.deepEqual([c1(4), c1(5)], [2, 3], '1e cleric gains it at level 5');
});

test('thief skills', () => {
    assert.equal(thiefRow('add1e', 1)[0], 30);
    assert.deepEqual(thiefRow('osric', 1), [30, 25, 20, 15, 10, 10, 85, 1]);
    assert.deepEqual(thiefRow('osric', 8), [65, 57, 55, 62, 48, 25, 96, 40]);
    const s = character('add2e', { race: 'elf', classes: ['thief'], level: 3, scores: { dex: 16 } });
    const t = R.thiefSkills(s, tables);
    assert.equal(t.points.total, 120);
    assert.equal(t.points.cap, 60);
    assert.equal(t.rows.find((r) => r.name === 'Hide in Shadows').raceMod, 10);
    const assassin = R.thiefSkills(character('add1e', { classes: ['assassin'], level: 3 }), tables);
    assert.equal(assassin.rows[0].base, 30, 'assassins work two levels behind');
});

test('specialization', () => {
    assert.equal(R.maxSpec(character('add2e'), 'Sword, Long'), 1);
    assert.equal(R.maxSpec(character('add2e', { race: 'elf', classes: ['fighter', 'thief'] }), 'Sword, Long'), 0, '2e: single-class fighters only');
    assert.equal(R.maxSpec(character('osric3'), 'Sword (Long)'), 2);
    assert.equal(R.maxSpec(character('osric3'), 'Sword (Two-Handed)'), 1);
    assert.equal(R.maxSpec(character('osric3', { classes: ['thief'] }), 'Dagger'), 0);
    assert.equal(R.profCost(null, { name: 'Bow, Long', spec: 1 }), 3);
    assert.equal(R.profCost(null, { name: 'Crossbow, Light', spec: 1 }), 2);
});

test('weapon forms share one proficiency', () => {
    assert.equal(weaponKey('Thrown Dagger'), weaponKey('Dagger (thrown)'));
    assert.equal(weaponKey('Sword (Long)'), weaponKey('Sword, Long'));
    assert.notEqual(weaponKey('Sword (Long)'), weaponKey('Sword (Short)'));
});

test('coins: 1e uses 20 silver to the gold piece', () => {
    assert.equal(R.toGp(20, 'sp', '1'), 1);
    assert.equal(R.toGp(10, 'sp', '2'), 1);
    assert.deepEqual(R.purse(12.55, '2'), { gp: 12, sp: 5, cp: 5 });
    assert.deepEqual(R.purse(1.5, '1'), { gp: 1, sp: 10, cp: 0 });
});

test('reconcile drops choices that no longer apply', () => {
    const s = character('add2e', { race: 'elf', classes: ['fighter', 'mage'], alignment: 'lg' });
    s.hp = { fighter: [10], mage: [4] };
    s.race = 'halfling';
    R.reconcile(s);
    assert.deepEqual(s.classes, []);
    const p = character('osric3', { alignment: 'ce' });
    p.classes = ['paladin'];
    R.reconcile(p);
    assert.equal(p.details.alignment, '');
});

test('validate reports unfinished steps', () => {
    const s = R.newState('add2e');
    const issues = R.validate(s, tables);
    assert.ok(R.hasErrors(issues));
    assert.equal(issues.abilities[0].key, 'abilitiesIncomplete');
});

// ───────────────────────── against ARS itself ─────────────────────────

test('attack matrices and class groups exist in ARS', { skip }, () => {
    for (const rs of Object.values(RULESETS)) {
        for (const [k, c] of Object.entries(rs.classes)) {
            if (rs.variant !== '2') assert.ok(tables.matrix[rs.variant][c.matrix], `${rs.id} ${k} matrix ${c.matrix}`);
        }
        const known = Object.keys(tables.thiefSkillMods.dexMod[rs.variant]);
        const names = THIEF_SKILLS[rs.thiefNames].map((n) => n.toLowerCase());
        for (const key of known) assert.ok(names.some((n) => n.includes(key)), `${rs.id}: ARS automates "${key}"`);
    }
});

test('HP preview uses ARS constitution tables', { skip }, () => {
    const s = character('add1e', { scores: { con: 18 } });
    s.hp = { fighter: [10] };
    assert.equal(R.totalHp(s, tables), 14);
    const t = character('add1e', { classes: ['thief'], scores: { con: 18 } });
    t.hp = { thief: [6] };
    assert.equal(R.totalHp(t, tables), 8);
    const m = character('add1e', { race: 'half-elf', classes: ['fighter', 'magic-user'], scores: { con: 9 } });
    m.hp = { fighter: [10], 'magic-user': [4] };
    assert.equal(R.totalHp(m, tables), 7);
});

/** What ARS's _getClassHPData computes from the stored class items. */
function arsHp(actor, state) {
    const n = state.classes.length;
    const con = actor.system.abilities.con.value + (RULESETS[state.ruleset].races[state.race].adj?.con ?? 0);
    let hp = 0;
    let bonus = 0;
    for (const item of actor.items.filter((i) => i.type === 'class')) {
        const per = R.conBonus(tables, RULESETS[state.ruleset].variant, con, item.system.features.bonuscon);
        for (const a of item.system.advancement) {
            if (a.level <= item.system.features.lasthitdice) bonus += per / n;
            hp += Math.round(a.hp / n);
        }
    }
    return hp + Math.ceil(bonus);
}

test('the sheet total ARS derives equals the previewed hit points', { skip }, async () => {
    let n = 0;
    for (const rs of Object.values(RULESETS)) {
        for (const [race, combo] of [['human', ['fighter']], ['half-elf', rs.id === 'add2e' ? ['fighter', 'mage', 'cleric'] : ['cleric', 'fighter', 'magic-user']], ['elf', rs.id === 'add2e' ? ['fighter', 'mage'] : ['fighter', 'magic-user']]]) {
            for (const con of [6, 9, 15, 16, 18]) {
                for (let seed = 1; seed <= 12; seed++) {
                    const s = character(rs.id, { race, classes: combo, level: 1 + (seed % 6), scores: { str: 12, int: 15, wis: 13, dex: 13, cha: 12, con } });
                    s.ignoreLimits = true;
                    s.hpMode = 'roll';
                    s.hp = await R.rollHp(s, tables, seeded(seed * 31 + con));
                    s.gold = 50;
                    const { actor } = await buildActor(s, { content: emptyContent(), tables, randomID });
                    const shown = R.totalHp(s, tables);
                    if (arsHp(actor, s) < 1) continue;
                    assert.equal(arsHp(actor, s), shown, `${rs.id} ${combo} con ${con} ${JSON.stringify(s.hp)}`);
                    n++;
                }
            }
        }
    }
    assert.ok(n > 400);
});

test('OSRIC multi-class hit points drop fractions and never fall below 1 per level', { skip }, () => {
    // Player Guide 1.3.11: a thief roll of 4, +1 Constitution, three classes -> 5/3 -> 1.
    const s = character('osric3', { race: 'half-elf', classes: ['cleric', 'fighter', 'magic-user'], scores: { con: 15 } });
    s.hp = { cleric: [4], fighter: [10], 'magic-user': [1] };
    assert.equal(R.totalHp(s, tables), 1 + 3 + 1);
});

test('OSRIC saves and slots agree with the compendium classes', { skip: skip || (dump.empty && 'set OSRIC_DUMP to run') }, () => {
    const rs = RULESETS.osric3;
    const diffs = [];
    for (const [k, c] of Object.entries(rs.classes)) {
        const doc = dump.docs.find((d) => d.type === 'class' && c.compendium.includes(d.name));
        if (!doc) continue;
        const ranks = R.buildRanks(rs, c);
        doc.system.ranks.slice(0, 10).forEach((r, i) => {
            for (const key of ['paralyzation', 'rod', 'petrification', 'breath', 'spell']) if (r[key] !== ranks[i][key]) diffs.push(`${k} L${i + 1} ${key}: ours ${ranks[i][key]} compendium ${r[key]}`);
        });
    }
    if (diffs.length) console.log(diffs.join('\n'));
    assert.ok(diffs.length < 30, `${diffs.length} save differences`);
});

/** Every key we send must survive ARS's schema, or it was silently dropped. */
function assertKept(sent, kept, label) {
    const a = foundry.utils.flattenObject(sent);
    const b = foundry.utils.flattenObject(kept);
    for (const key of Object.keys(a)) {
        if (/\.ranks|itemList|actionGroups|advancement|appliedto|skillmods|sourceUuid|sourceId/.test(`.${key}`)) continue;
        assert.ok(key in b || typeof a[key] === 'object', `${label}: ARS dropped "${key}"`);
    }
}

async function checkBuild(state, content, label) {
    const { actor, post } = await buildActor(state, { content, tables, randomID });
    const system = new ars.character(actor.system, { strict: true }).toObject();
    assertKept(actor.system, system, `${label} actor`);
    const ids = new Set();
    for (const item of [...actor.items, ...post]) {
        const Model = ars.items[item.type];
        assert.ok(Model, `${label}: unknown item type ${item.type}`);
        let doc;
        try {
            doc = new Model(structuredClone(item.system), { strict: true }).toObject();
        } catch (error) {
            throw new Error(`${label}: ${item.type} "${item.name}": ${error.message}`);
        }
        if (item.flags?.['ars-character-creator'] || !item.system.version) assertKept(item.system, doc, `${label} ${item.type} ${item.name}`);
        if (item._id) {
            assert.match(item._id, /^[A-Za-z0-9]{16}$/, `${label} ${item.name} id ${item._id}`);
            assert.ok(!ids.has(item._id), `${label}: duplicate id ${item.name}`);
            ids.add(item._id);
        }
        if (item.type === 'class') {
            const lvl = item.system.advancement.length;
            assert.equal(lvl, R.startLevels(state)[state.classes.find((k) => (RULESETS[state.ruleset].classes[k].label ?? RULESETS[state.ruleset].classes[k].compendium[0]) === item.system.type)]);
            assert.ok(doc.ranks.length >= lvl, `${label} ranks`);
            assert.ok(doc.ranks.every((r) => r.arcane.length === 10 && r.divine.length === 8), `${label} slot arrays`);
        }
    }
    const names = actor.items.filter((i) => i.type === 'skill').map((i) => i.name);
    assert.equal(new Set(names).size, names.length, `${label}: duplicate skills ${names}`);
    for (const p of actor.items.filter((i) => i.type === 'proficiency')) for (const a of p.system.appliedto ?? []) if (a.id.startsWith('test')) assert.ok(ids.has(a.id));
    return actor;
}

for (const [name, content] of [['no compendium', emptyContent()], ['OSRIC compendium', dump]]) {
    test(`every legal race/class builds a valid ARS actor (${name})`, { skip: skip || (name !== 'no compendium' && dump.empty && 'set OSRIC_DUMP to run') }, async () => {
        let built = 0;
        for (const rs of Object.values(RULESETS)) {
            for (const [raceKey, race] of Object.entries(rs.races)) {
                for (const combo of [...Object.keys(race.levels).map((c) => [c]), ...race.multi]) {
                    const scores = fitting(rs.id, raceKey, combo);
                    if (!scores) continue;
                    for (const level of [1, 6]) {
                        const s = character(rs.id, { race: raceKey, classes: [...combo], level, scores });
                        if (!R.alignmentsFor(s).length) continue;
                        const label = `${rs.id}/${raceKey}/${combo.join('+')}/${level}`;
                        assert.ok(R.raceStatus(s, raceKey).ok, label);
                        for (const c of combo) assert.ok(R.classStatus(s, c).ok, `${label} ${c} ${JSON.stringify(R.classStatus(s, c).reasons)}`);
                        s.hp = await R.rollHp(s, tables, seeded(level));
                        s.gold = 200;
                        const weapon = rs.id === 'add2e' ? WEAPONS_2E[0] : WEAPONS_1E[0];
                        s.cart = [weapon, ARMOR_1E[0], GEAR[0], GEAR.at(-1)].map((b) => ({ id: b.name, builtin: b, name: b.name, price: b.cost, qty: 2 }));
                        s.weaponProfs = [{ name: weapon.name, spec: R.maxSpec(s, weapon.name) ? 1 : 0 }];
                        R.reconcile(s);
                        assert.deepEqual(s.classes, combo, label);
                        await checkBuild(s, content, label);
                        built++;
                    }
                }
            }
        }
        console.log(`  ${built} characters built (${name})`);
        assert.ok(built > 150);
    });
}

test('built-in price lists are valid ARS items', { skip }, () => {
    for (const row of [...WEAPONS_1E, ...WEAPONS_2E, ...ARMOR_1E, ...ARMOR_2E, ...GEAR]) {
        assert.ok(Number.isFinite(row.cost) && Number.isFinite(row.weight), row.name);
        const item = builtinItem(row);
        const doc = new ars.items[item.type](structuredClone(item.system), { strict: true }).toObject();
        assertKept(item.system, doc, row.name);
    }
});

test('level 1 OSRIC thief from the compendium', { skip: skip || (dump.empty && 'set OSRIC_DUMP to run') }, async () => {
    const s = character('osric3', { classes: ['thief'], scores: { dex: 16 } });
    s.hp = await R.rollHp(s, tables, seeded(1));
    s.gold = 70;
    s.cart = [{ id: 'x', uuid: dump.uuidOf('weapon', 'Thrown Dagger'), name: 'Thrown Dagger', price: 2, qty: 1 }];
    s.weaponProfs = [{ name: 'Dagger', spec: 0 }];
    const actor = await checkBuild(s, dump, 'thief');
    const byName = (n) => actor.items.find((i) => i.name === n);
    assert.equal(byName('Pick Pockets').system.features.target, '30');
    assert.ok(byName('Language: Alignment Tongue'));
    assert.equal(byName('Thief').system.ranks[0].xp, 1250);
    assert.equal(byName('Thief').system.xpbonus, 10);
    assert.deepEqual(byName('Dagger').system.appliedto, [{ id: byName('Thrown Dagger')._id }]);
    assert.ok(!byName('Read Scrolls'), 'level 10 grant is withheld');
    assert.equal(actor.system.currency.gp, '68');
});

test('a 2e gnome gets its own adjustments instead of the OSRIC ones', { skip: skip || (dump.empty && 'set OSRIC_DUMP to run') }, async () => {
    const s = character('add2e', { race: 'gnome', classes: ['illusionist'], scores: { dex: 16, int: 13 } });
    s.hp = await R.rollHp(s, tables, seeded(1));
    s.gold = 30;
    const actor = await checkBuild(s, dump, 'gnome');
    const race = actor.items.find((i) => i.type === 'race');
    const keys = race.effects.flatMap((e) => (e.system?.changes ?? []).map((c) => c.key));
    assert.ok(keys.includes('system.abilities.int.value') && keys.includes('system.abilities.wis.value'));
    assert.ok(actor.items.some((i) => i.name === 'Base Movement 60'));
    assert.ok(!actor.items.some((i) => i.name === 'Base Movement 90'));
    assert.equal(actor.system.spellInfo.slots.arcane.value[1], 2, 'specialist bonus slot');
});

test('OSRIC 3.0 corrections to compendium content', { skip: skip || (dump.empty && 'set OSRIC_DUMP to run') }, async () => {
    const half = character('osric3', { race: 'half-elf', classes: ['fighter'] });
    half.hp = await R.rollHp(half, tables, seeded(1));
    half.gold = 100;
    half.cart = [{ id: 'j', uuid: dump.uuidOf('weapon', 'Thrown Javelin'), name: 'Thrown Javelin', price: 0.5, qty: 1 }, { id: 'b', uuid: dump.uuidOf('weapon', 'Sword (Bastard)'), name: 'Sword (Bastard)', price: 25, qty: 1 }];
    const actor = await checkBuild(half, dump, 'half-elf');
    assert.ok(!actor.items.some((i) => i.name === 'E: Detect Secret Door'), 'half-elves only find doors by searching');
    const javelin = actor.items.find((i) => i.name === 'Thrown Javelin').system;
    assert.deepEqual([javelin.weight, javelin.attack.speed, javelin.attack.modes.melee.enabled, javelin.attack.modes.thrown.enabled], [2, 8, true, true]);
    assert.equal(actor.items.find((i) => i.name === 'Sword (Bastard)').system.damage.large, '2d8');

    const dwarf = character('osric3', { race: 'dwarf', classes: ['fighter'], scores: { con: 12 } });
    dwarf.hp = await R.rollHp(dwarf, tables, seeded(1));
    dwarf.gold = 100;
    const d = await checkBuild(dwarf, dump, 'dwarf');
    assert.equal(d.system.attributes.size, 'small');
    assert.equal(d.items.find((i) => i.name === 'D: Shifting Rooms/Walls').system.features.target, '65');
    const formulas = JSON.stringify(d.items.find((i) => i.type === 'race').effects);
    assert.ok(formulas.includes('floor(@abilities.con.value/3.5)') && !formulas.includes('round(@abilities.con'));

    const monk = character('osric3', { classes: ['monk'], scores: { str: 15, wis: 15, dex: 15 } });
    monk.hp = await R.rollHp(monk, tables, seeded(1));
    monk.gold = 12;
    const m = await checkBuild(monk, dump, 'monk');
    assert.equal(m.items.find((i) => i.name === 'Climb Walls').system.features.modifiers.race, -5, 'monks ignore ancestry thief modifiers');
    assert.equal(m.items.find((i) => i.type === 'class').system.ranks[0].baseMove, 150);
});

test('age and ancestry are both reflected once on the sheet', { skip }, async () => {
    const s = character('osric3', { race: 'elf', classes: ['fighter'], scores: { dex: 14, con: 14, str: 12 } });
    s.details.age = '180';
    s.hp = await R.rollHp(s, tables, seeded(1));
    s.gold = 100;
    const { actor } = await buildActor(s, { content: emptyContent(), tables, randomID });
    const a = actor.system.abilities;
    // Race effect adds Dex +1 and Con -1 afterwards: final Dex 15, Con 14, Str 13.
    assert.deepEqual([a.dex.value, a.con.value, a.str.value], [14, 15, 13]);
});
