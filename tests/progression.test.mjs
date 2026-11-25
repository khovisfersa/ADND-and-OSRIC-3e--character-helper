import test from 'node:test';
import assert from 'node:assert/strict';
import { RULESETS } from '../scripts/data/index.mjs';
import { ABILITIES } from '../scripts/data/shared.mjs';
import * as R from '../scripts/core/rules.mjs';
import * as P from '../scripts/core/progression.mjs';
import { buildActor } from '../scripts/core/builder.mjs';
import { dumpContent, emptyContent, loadArs, randomID, seeded } from './harness.mjs';

const ars = await loadArs();
const tables = ars?.ARS;
const skip = ars ? false : 'set ARS_SRC to run';
const dump = dumpContent();
const choices = (extra = {}) => ({ die: 4, weapons: [], upgrades: [], nwp: [], points: {}, spells: [], payTraining: false, weeks: null, ...extra });

function state(id, race, classes, level, scores = {}) {
    const s = R.newState(id);
    s.abilities.method = 'manual';
    s.abilities.manual = { str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15, ...scores };
    Object.assign(s, { race, classes, startLevel: level, gold: 5000 });
    s.details.name = 'Test';
    s.details.alignment = R.alignmentsFor(s)[0];
    return s;
}

/** The actor as the progression window reads it: stored data with ARS-derived scores. */
async function build(s, content = emptyContent()) {
    s.hp = await R.rollHp(s, tables, seeded(5));
    const { actor } = await buildActor(s, { content, tables, randomID });
    const doc = structuredClone(actor);
    const race = RULESETS[s.ruleset].races[s.race];
    for (const k of ABILITIES) doc.system.abilities[k].value += race.adj?.[k] ?? 0;
    return { doc, raw: actor };
}

/** Apply planned changes to the plain actor. */
function apply(doc, changes) {
    for (const u of changes.updates) {
        const item = doc.items.find((i) => i._id === u._id);
        for (const [k, v] of Object.entries(u)) if (k !== '_id') foundry.utils.setProperty(item, k, v);
    }
    for (const c of changes.create) doc.items.push({ _id: randomID(), effects: [], ...structuredClone(c) });
    for (const [k, v] of Object.entries(changes.actor)) foundry.utils.setProperty(doc, k, v);
}

function arsHp(doc, rs) {
    const classes = doc.items.filter((i) => i.type === 'class');
    let hp = 0;
    let bonus = 0;
    for (const c of classes) {
        const per = R.conBonus(tables, rs.variant, doc.system.abilities.con.value, c.system.features.bonuscon);
        for (const a of c.system.advancement) {
            if (a.level <= c.system.features.lasthitdice) bonus += per / classes.length;
            hp += Math.round(a.hp / classes.length);
        }
    }
    return hp + Math.ceil(bonus);
}

const CASES = [
    ['osric3', 'human', ['fighter']], ['osric3', 'human', ['paladin']], ['osric3', 'human', ['ranger']], ['osric3', 'human', ['thief']], ['osric3', 'human', ['assassin']], ['osric3', 'human', ['monk']],
    ['osric3', 'human', ['cleric']], ['osric3', 'human', ['druid']], ['osric3', 'human', ['illusionist']], ['osric3', 'human', ['magic-user']], ['osric3', 'half-elf', ['cleric', 'fighter', 'magic-user']], ['osric3', 'elf', ['fighter', 'thief']],
    ['add1e', 'human', ['fighter']], ['add1e', 'human', ['ranger']], ['add1e', 'human', ['monk']], ['add1e', 'elf', ['magic-user', 'thief']], ['add1e', 'half-elf', ['cleric', 'fighter', 'magic-user']],
    ['add2e', 'human', ['fighter']], ['add2e', 'human', ['ranger']], ['add2e', 'human', ['bard']], ['add2e', 'human', ['thief']], ['add2e', 'human', ['transmuter']], ['add2e', 'half-elf', ['fighter', 'mage', 'thief']], ['add2e', 'human', ['druid']],
];

for (const [name, content] of [['no compendium', emptyContent()], ['OSRIC compendium', dump]]) {
    test(`advancing level by level equals creating at that level (${name})`, { skip: skip || (name !== 'no compendium' && dump.empty && 'set OSRIC_DUMP to run') }, async () => {
        for (const [id, race, classes] of CASES) {
            const rs = RULESETS[id];
            const scores = { str: 17, int: 17, wis: 17, dex: 17, con: 15, cha: 17 };
            const s = state(id, race, classes, 1, scores);
            s.ignoreLimits = true;
            const { doc } = await build(s, content);
            for (let level = 2; level <= 10; level++) {
                const target = state(id, race, classes, level, scores);
                target.ignoreLimits = true;
                const want = await build(target, content);
                for (const key of classes) {
                    const snap = P.snapshot(doc, id);
                    const cls = snap.classes.find((c) => c.key === key);
                    assert.ok(cls, `${id} ${key} is recognised`);
                    const plan = P.planLevel(snap, cls.id, tables);
                    assert.equal(plan.level, level);
                    const before = arsHp(doc, rs);
                    const die = /^\d+$/.test(plan.formula) ? Number(plan.formula) : 1 + ((level * 7) % Number(plan.formula.split('d')[1]));
                    const changes = P.levelChanges(snap, plan, choices({ die }), tables);
                    for (const c of changes.create) new ars.items[c.type](structuredClone(c.system), { strict: true });
                    apply(doc, changes);
                    assert.equal(arsHp(doc, rs) - before, changes.hp.gained, `${id} ${classes} L${level} ${key} hp`);
                    assert.ok(changes.hp.gained >= 1);
                }
                const label = `${id}/${race}/${classes.join('+')} L${level} (${name})`;
                assert.deepEqual(doc.system.saves, want.raw.system.saves, `${label} saves`);
                assert.deepEqual(doc.system.spellInfo, want.raw.system.spellInfo, `${label} spells`);
                assert.equal(doc.system.attributes.thaco.value, want.raw.system.attributes.thaco.value, `${label} thac0`);
                const skills = (d) => Object.fromEntries(d.items.filter((i) => i.type === 'skill' && i.system.features.formula === '1d100').map((i) => [i.name, String(i.system.features.target)]).sort());
                const mine = skills(doc);
                for (const [n, v] of Object.entries(skills(want.raw))) if (n in mine && !/^[DGE]: |Tracking|LVL/.test(n)) assert.equal(mine[n], v, `${label} ${n}`);
                for (const key of classes) {
                    const item = doc.items.find((i) => i.type === 'class' && P.snapshot(doc, id).classes.find((c) => c.id === i._id)?.key === key);
                    assert.ok(item.system.xp >= R.xpForLevel(rs.classes[key], level), `${label} xp`);
                    assert.deepEqual(item.system.advancement.map((a) => a.level), Array.from({ length: level }, (_, i) => i + 1));
                }
                new ars.character(structuredClone(doc.system), { strict: true });
            }
            if (name === 'no compendium') {
                const target = state(id, race, classes, 10, scores);
                target.ignoreLimits = true;
                const abilities = (d) => d.items.filter((i) => i.type === 'ability').map((i) => i.name).sort();
                assert.deepEqual(abilities(doc), abilities((await build(target, content)).raw), `${id} ${classes} features`);
            }
        }
    });
}

test('XP is split evenly, fractions dropped, then each bonus applies', { skip }, async () => {
    const { doc } = await build(state('osric3', 'elf', ['fighter', 'magic-user'], 1, { str: 16, int: 12 }));
    const snap = P.snapshot(doc, 'osric3');
    const split = P.splitXp(snap, 125);
    assert.deepEqual(split.map((s) => [s.share, s.gain]), [[62, 68], [62, 62]]);
});

test('readiness follows the rank table and the ancestry limit', { skip }, async () => {
    const { doc } = await build(state('osric3', 'halfling', ['fighter'], 3, { str: 12, con: 12 }));
    const item = doc.items.find((i) => i.type === 'class');
    const progress = () => P.classProgress(P.snapshot(doc, 'osric3'), P.snapshot(doc, 'osric3').classes[0]);
    assert.deepEqual([progress().next, progress().ready, progress().cap], [8000, false, 4]);
    item.system.xp = 8000;
    assert.equal(progress().ready, true);
    const snap = P.snapshot(doc, 'osric3');
    apply(doc, P.levelChanges(snap, P.planLevel(snap, item._id, tables), choices({ die: 5 }), tables));
    item.system.xp = 99999;
    assert.deepEqual([progress().atCap, progress().ready], [true, false], 'halfling fighters stop at 4th level');
});

test('a class the rulesets do not know still advances from its own ranks', { skip }, async () => {
    const { doc } = await build(state('osric3', 'human', ['fighter'], 1));
    const item = doc.items.find((i) => i.type === 'class');
    item.name = item.system.type = 'Gladiator';
    item.system.xp = 5000;
    const snap = P.snapshot(doc, 'osric3');
    assert.equal(snap.classes[0].key, null);
    assert.ok(P.classProgress(snap, snap.classes[0]).ready);
    const plan = P.planLevel(snap, item._id, tables);
    assert.deepEqual([plan.thaco.to, plan.weapon.available, plan.spells], [19, 0, null]);
    assert.ok(P.levelChanges(snap, plan, choices({ die: 6 }), tables).hp.gained >= 1);
});

test('2e thief points: 30 per level, 15 per skill, 95% ceiling', { skip }, async () => {
    const s = state('add2e', 'human', ['thief'], 1);
    s.thiefPoints = { 'Climb Walls': 30, 'Open Locks': 30 };
    const { doc } = await build(s);
    const snap = P.snapshot(doc, 'add2e');
    const plan = P.planLevel(snap, snap.classes[0].id, tables);
    assert.deepEqual([plan.points.available, plan.points.cap], [30, 15]);
    const id = (n) => plan.points.rows.find((r) => r.name === n).id;
    const keys = (points) => P.checkChoices(snap, plan, choices({ points }), tables).filter((i) => i.level === 'error').map((i) => i.key);
    assert.deepEqual(keys({ [id('Open Locks')]: 15, [id('Move Silently')]: 15 }), []);
    assert.deepEqual(keys({ [id('Open Locks')]: 20 }), ['thiefCap']);
    assert.deepEqual(keys({ [id('Climb Walls')]: 10 }), ['thief95']);
    apply(doc, P.levelChanges(snap, plan, choices({ points: { [id('Open Locks')]: 15 } }), tables));
    assert.equal(doc.items.find((i) => i.name === 'Open Locks').system.features.modifiers.class, 45);
    assert.equal(P.planLevel(P.snapshot(doc, 'add2e'), snap.classes[0].id, tables).points.available, 45, 'unspent points carry over');
});

test('proficiencies and specialization', { skip }, async () => {
    const s = state('add2e', 'human', ['fighter'], 2);
    s.weaponProfs = [{ name: 'Sword, Long', spec: 0 }, { name: 'Dagger', spec: 0 }, { name: 'Spear', spec: 0 }, { name: 'Club', spec: 0 }];
    const { doc } = await build(s);
    let snap = P.snapshot(doc, 'add2e');
    let plan = P.planLevel(snap, snap.classes[0].id, tables);
    assert.deepEqual([plan.weapon.available, plan.nwp.available > 0], [1, true], '3rd level grants a slot');
    const sword = P.specializable(snap, plan.classId).find((x) => x.name === 'Sword, Long');
    assert.equal(sword.cost, 1);
    assert.ok(P.checkChoices(snap, plan, choices({ upgrades: [sword.id], weapons: ['Javelin'] }), tables).some((i) => i.key === 'weaponOver'));
    apply(doc, P.levelChanges(snap, plan, choices({ upgrades: [sword.id], nwp: ['Swimming'] }), tables));
    const prof = doc.items.find((i) => i._id === sword.id);
    assert.deepEqual([prof.name, prof.system.hit, prof.system.attacks, prof.system.proficiencies.cost], ['Sword, Long (Specialization)', '1', '3/2', 2]);
    assert.ok(doc.items.some((i) => i.type === 'skill' && i.name === 'Swimming'));
    for (let l = 4; l <= 7; l++) {
        snap = P.snapshot(doc, 'add2e');
        plan = P.planLevel(snap, snap.classes[0].id, tables);
        apply(doc, P.levelChanges(snap, plan, choices({ die: 5 }), tables));
    }
    assert.equal(doc.items.find((i) => i._id === sword.id).system.attacks, '2/1', 'specialist rate improves at 7th');
});

test('spells gained: one per level; OSRIC rangers get a book at 9th', { skip }, async () => {
    const plan = async (id, cls, level) => {
        const { doc } = await build(state(id, 'human', [cls], level, { str: 15, con: 15 }));
        const snap = P.snapshot(doc, id);
        return P.planLevel(snap, snap.classes[0].id, tables).spells;
    };
    assert.deepEqual([(await plan('osric3', 'magic-user', 2)).count, (await plan('osric3', 'magic-user', 2)).maxLevel], [1, 2]);
    assert.equal(await plan('osric3', 'ranger', 7), null);
    assert.deepEqual([(await plan('osric3', 'ranger', 8)).count, (await plan('osric3', 'ranger', 8)).required], [4, ['Read Magic']]);
    assert.equal((await plan('osric3', 'ranger', 9)).count, 1);
    assert.equal((await plan('add2e', 'mage', 2)).optional, true);
    assert.equal(await plan('osric3', 'cleric', 2), null);
});

test('training costs and paying from the purse', { skip }, async () => {
    const { doc } = await build(state('osric3', 'human', ['fighter'], 2));
    const snap = P.snapshot(doc, 'osric3');
    assert.deepEqual([P.training(snap, 2, 1).cost, P.training(snap, 2, 3).cost], [3000, 3000]);
    assert.equal(P.training({ ...snap, rulesetId: 'add1e' }, 2, 3).cost, 9000);
    assert.equal(P.training({ ...snap, rulesetId: 'add2e' }, 2, 1), null);
    assert.deepEqual(P.pay(snap, 3000), { gp: 2000, sp: 0, cp: 0 });
    assert.equal(P.pay(snap, 6000), null);
    const plan = P.planLevel(snap, snap.classes[0].id, tables);
    apply(doc, P.levelChanges(snap, plan, choices({ payTraining: true, weeks: 2 }), tables));
    assert.equal(doc.system.currency.gp, '2000');
});

test('dual-class characters gain no hit points until they pass the old class', { skip }, async () => {
    const { doc } = await build(state('osric3', 'human', ['thief'], 1));
    const old = structuredClone(doc.items.find((i) => i.type === 'class'));
    Object.assign(old, { _id: randomID(), name: 'Fighter' });
    Object.assign(old.system, { type: 'Fighter', active: false, advancement: [1, 2].map((level) => ({ level, hp: 8 })) });
    doc.items.push(old);
    const snap = P.snapshot(doc, 'osric3');
    const thief = snap.classes.find((c) => c.key === 'thief');
    assert.deepEqual(P.hpGain(snap, thief.id, 6, tables), { gained: 0, stored: 0, dual: true });
    assert.equal(P.classProgress(snap, snap.classes.find((c) => c.key === 'fighter')).ready, false);
    assert.equal(P.splitXp(snap, 100).length, 1, 'only the active class earns experience');
});

test('excluded grants never come back, and due ones are found', { skip: skip || (dump.empty && 'set OSRIC_DUMP to run') }, async () => {
    const thief = await build(state('add1e', 'human', ['thief'], 9), dump);
    let snap = P.snapshot(thief.doc, 'add1e');
    const names = P.pendingGrants(snap, snap.classes[0].itemList, 10).map((g) => g.name);
    assert.ok(names.includes('Read Scrolls'));
    assert.ok(!names.includes('Pick Pockets'));
    // Characters made elsewhere may still list them.
    const raw = [{ id: 'abc', name: 'Pick Pockets', level: 1 }, { id: 'def', name: 'Read Scrolls', level: 10 }];
    assert.deepEqual(P.pendingGrants({ ...snap, ids: new Set() }, raw, 10).map((g) => g.name), ['Read Scrolls']);
    const stored = thief.doc.items.find((i) => i.type === 'class').system.itemList.map((i) => i.name);
    assert.ok(!stored.includes('Open Locks/Disarm Traps'), "ARS's own level-up must not add the OSRIC thief skills to a 1e thief");
    const half = await build(state('osric3', 'half-elf', ['fighter'], 1), dump);
    snap = P.snapshot(half.doc, 'osric3');
    assert.ok(!P.pendingGrants(snap, snap.raceItem.system.itemList, 5).some((g) => /^E: Detect/.test(g.name)));
});
