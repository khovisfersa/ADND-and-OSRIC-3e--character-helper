import { AMMO, applyOsricPrices } from '../data/equipment.mjs';
import { THIEF_SKILLS } from '../data/shared.mjs';
import * as R from './rules.mjs';

/**
 * Turns a finished wizard state into ARS Actor creation data. No Foundry globals: document
 * access goes through `content`, ids through `randomID`.
 *
 * Class, race and their sub-items are created in the same payload as the actor. Dropping
 * them one by one (ARS's normal path) opens a dialog per grant; this way none is needed,
 * while sub-items keep their source _id so ARS still recognises them on later level-ups.
 */

const ABILITY_IMG = 'icons/sundries/documents/document-sealed-brown-red.webp';
const ARCANE_BOOK_IMG = 'icons/sundries/books/book-clasp-spiral-green.webp';
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Key shared by all forms of one weapon: "Thrown Dagger", "Dagger (thrown)" and "Dagger" match. */
export function weaponKey(name) {
    const words = name.toLowerCase().replace(/\bthrown\b/g, '').replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
    return words.sort().join(' ');
}

export async function buildActor(state, { content, tables, randomID }) {
    const rs = R.ruleset(state);
    const levels = R.startLevels(state);
    const top = R.maxLevel(state);
    const items = [];
    const post = [];
    const ids = new Set();
    const warnings = [];

    const add = (data) => {
        if (data._id && ids.has(data._id)) return items.find((i) => i._id === data._id);
        data._id ??= randomID();
        ids.add(data._id);
        for (const e of data.effects ?? []) e._id ??= randomID();
        delete data.folder;
        delete data.ownership;
        delete data.sort;
        items.push(data);
        return data;
    };

    const effect = (name, changes, img = 'icons/svg/aura.svg') => ({
        _id: randomID(), name, img, type: 'base', transfer: true, disabled: false,
        system: { changes: changes.map(([key, type, value]) => ({ key, type, value, priority: null, phase: 'initial' })) },
    });
    const ability = (name, extra = {}) => ({ name, type: 'ability', img: ABILITY_IMG, system: { description: '' }, effects: [], ...extra });
    const namedAbility = async (names, fallbackName) => {
        const entry = content.find('ability', names);
        if (!entry) return ability(fallbackName ?? names[0]);
        const data = await content.load(entry.uuid);
        data.system.sourceUuid = entry.uuid;
        return data;
    };
    const hasItem = (type, name) => items.some((i) => i.type === type && i.name.toLowerCase() === name.toLowerCase());

    /** Resolve and add what a class or race grants at the starting level. */
    const addGrants = async (source, level, exclude) => {
        const unwanted = (name) => !!name && (exclude?.test(name) || race.exclude?.test(name));
        source.system.itemList = (source.system.itemList ?? []).filter((s) => !unwanted(s.name));
        const dropped = new Set();
        for (const sub of source.system.itemList ?? []) {
            if ((parseInt(sub.level) || 0) > level) continue;
            const id = sub.id || sub.uuid?.split('.').pop();
            if (!id || ids.has(id)) continue;
            const data = await content.loadById(id, sub.uuid);
            if (!data) {
                if (sub.name) warnings.push({ key: 'missingGrant', value: sub.name });
                continue;
            }
            if (unwanted(data.name)) {
                dropped.add(sub);
                continue;
            }
            if (data.type === 'skill' && race.targets?.[data.name]) data.system.features.target = race.targets[data.name];
            const cost = parseInt(sub.cost) || 0;
            if (data.type === 'skill') {
                if (parseInt(sub.skilltarget)) data.system.features.target = String(parseInt(sub.skilltarget));
                data.system.features.cost = cost;
            }
            if (data.type === 'proficiency') data.system.proficiencies.cost = cost;
            data._id = id;
            data.system.sourceUuid = sub.uuid ?? '';
            await addNested(data);
        }
        if (dropped.size) source.system.itemList = source.system.itemList.filter((s) => !dropped.has(s));
    };

    /** Add an item and, when it lists contents, its contents too. */
    const addNested = async (data) => {
        const list = data.system.itemList ?? [];
        if (['container', 'bundle'].includes(data.type) && list.length) {
            delete data._id;
            post.push(data);
            return null;
        }
        if (list.length && data.type !== 'class' && data.type !== 'race') {
            const records = [];
            for (const sub of list) {
                const child = await content.loadById(sub.id || sub.uuid?.split('.').pop(), sub.uuid);
                if (!child || race.exclude?.test(child.name) || rs.raceItemExclude?.test(child.name)) continue;
                const added = await addNested(child);
                if (added) records.push({ id: added._id, uuid: sub.uuid ?? '', sourceuuid: sub.sourceuuid ?? '', name: added.name, type: added.type, img: added.img, quantity: '1' });
            }
            data.system.itemList = records;
        }
        return add(INVENTORY.has(data.type) ? prepareInventory(data) : data);
    };

    // ── Race ──
    const race = rs.races[state.race];
    const raceItem = await buildRace();
    add(raceItem);
    if (raceItem.system.itemList?.length) await addGrants(raceItem, top, rs.raceItemExclude);
    if (raceItem.flags?.['ars-character-creator']?.generated || rs.id === 'add2e') {
        if (!hasItem('ability', `Base Movement ${race.move}`)) {
            add(ability(`Base Movement ${race.move}`, { img: 'icons/svg/wing.svg', effects: [effect(`Base Movement ${race.move}`, [['system.attributes.movement.value', 'add', race.move]], 'icons/svg/wing.svg')] }));
        }
        if (race.infravision) {
            add(ability(`Infravision (${race.infravision} ft)`, { img: 'icons/svg/eye.svg', effects: [effect('Infravision', [['special.vision', 'custom', { range: race.infravision, angle: 360, mode: 'basic' }]], 'icons/svg/eye.svg')] }));
        }
    }
    const extraLanguages = (Array.isArray(state.details.languages) ? state.details.languages : []).filter(Boolean);
    for (const lang of [...race.languages, ...(rs.alignmentTongue ? ['Alignment Tongue'] : []), ...extraLanguages]) {
        const name = `Language: ${lang}`;
        if (!hasItem('ability', name)) {
            const data = await namedAbility([name], name);
            if (data._id && ids.has(data._id)) continue;
            add(data);
        }
    }

    async function buildRace() {
        const label = race.compendium[0];
        const entry = content.find('race', race.compendium);
        const skillmods = Object.entries(race.skillmods).filter(([, v]) => v).map(([name, value]) => ({ name, value }));
        const adjChanges = Object.entries(race.adj ?? {}).map(([k, v]) => [`system.abilities.${k}.value`, 'add', v]);
        if (entry) {
            const data = await content.load(entry.uuid);
            data.system.sourceUuid = entry.uuid;
            // The Constitution save bonus is one per full 3.5 points; the compendium rounds up.
            for (const e of data.effects ?? []) {
                for (const c of e.system?.changes ?? []) {
                    if (/^system\.mods\.saves\./.test(c.key) && typeof c.value?.formula === 'string') c.value.formula = c.value.formula.replace('round(@abilities.con.value/3.5)', 'floor(@abilities.con.value/3.5)');
                }
            }
            if (!rs.useCompendiumRaceMods) {
                data.system.attributes.skillmods = skillmods;
                const touchesScores = (e) => (e.system?.changes ?? e.changes ?? []).some((c) => /^system\.abilities\./.test(c.key));
                data.effects = (data.effects ?? []).filter((e) => !touchesScores(e));
                if (adjChanges.length) data.effects.push(effect(`${label} Racial Ability Modifiers`, adjChanges));
                data.system.itemList = (data.system.itemList ?? []).filter((s) => !rs.raceItemExclude?.test(s.name ?? ''));
            }
            if (race.size) data.system.attributes.size = race.size;
            return data;
        }
        const effects = [];
        if (adjChanges.length) effects.push(effect(`${label} Racial Ability Modifiers`, adjChanges));
        if (race.saveBonus) {
            const formula = '(min(5,max(1,floor(@abilities.con.value/3.5))))';
            effects.push(effect(`${label} Save Bonuses`, ['poison', 'spell', 'rod', 'staff', 'wand'].map((k) => [`system.mods.saves.${k}`, 'custom', { formula, properties: '' }])));
        }
        return {
            name: label, type: 'race', img: 'icons/environment/people/group.webp', effects,
            flags: { 'ars-character-creator': { generated: true } },
            system: { description: '', attributes: { size: race.size ?? (['gnome', 'halfling'].includes(state.race) ? 'small' : 'medium'), skillmods }, proficiencies: { weapon: '', skill: '' }, type: label, itemList: [] },
        };
    }

    // ── Classes ──
    const storedHp = R.advancementHp(state, tables);
    const thiefNames = new RegExp(`^(${THIEF_SKILLS.osric.map((n) => n.replace(/[/]/g, '\\/')).join('|')})$`, 'i');
    for (const key of state.classes) {
        const cls = rs.classes[key];
        const level = levels[key];
        const item = await buildClass(key, cls, level);
        add(item);
        // 1e/2e thief skills use different names than OSRIC, and ARS matches them by name.
        await addGrants(item, level, rs.thiefNames === 'osric' ? undefined : thiefNames);
        if (!item.system.itemList?.length) {
            for (const [lvl, name] of R.classFeatures(state, key)) if (lvl <= level && !hasItem('ability', name)) add(await namedAbility([name], name));
        }
        if (cls.opposition) {
            const data = ability('Opposition Schools');
            data.system.description = `<p>${cls.opposition.map(escape).join(', ')}</p>`;
            add(data);
        }
    }

    async function buildClass(key, cls, level) {
        const label = cls.label ?? cls.compendium[0];
        const entry = cls.compendium ? content.find('class', cls.compendium) : null;
        const imgEntry = !entry && cls.imgFrom ? content.find('class', [cls.imgFrom]) : null;
        const ranks = R.buildRanks(rs, cls);
        let data;
        if (entry) {
            data = await content.load(entry.uuid);
            data.system.sourceUuid = entry.uuid;
            data.system.ranks = ranks;
        } else {
            const future = R.classFeatures(state, key).filter(([l]) => l <= cls.max).map(([l, n]) => `<li>${l}: ${escape(n)}</li>`).join('');
            data = {
                name: label, type: 'class', img: cls.img ?? imgEntry?.img ?? 'icons/equipment/head/helm-bassinet-steel.webp', effects: [],
                flags: { 'ars-character-creator': { generated: true } },
                system: { description: future ? `<ul>${future}</ul>` : '', itemList: [], ranks, features: {} },
            };
        }
        const s = data.system;
        s.active = true;
        s.type = label;
        s.matrixTable = cls.matrix;
        s.xp = R.xpForLevel(cls, level);
        s.xpbonus = R.xpBonus(state, key);
        s.advancement = storedHp[key].map((hp, i) => ({ level: i + 1, hp }));
        s.features = {
            ...(s.features ?? {}),
            acDexFormula: cls.acDex ?? s.features?.acDexFormula ?? '@abilities.dex.defensive',
            lasthitdice: cls.hdLevels,
            bonuscon: !!cls.warrior,
            wisSpellBonusDisabled: !!cls.noWisBonus,
            focus: entry ? s.features.focus : { major: '', minor: '' },
        };
        s.proficiencies = {
            penalty: cls.prof.penalty,
            weapon: { starting: cls.prof.start, earnLevel: cls.prof.every },
            skill: { starting: cls.nwp?.start ?? 0, earnLevel: cls.nwp?.every ?? 0 },
        };
        return data;
    }

    // ── Thief skills ──
    const thief = R.thiefSkills(state, tables);
    for (const row of thief.rows) {
        const existing = rs.thiefNames === 'osric' ? items.find((i) => i.type === 'skill' && i.name.toLowerCase() === row.name.toLowerCase()) : null;
        if (existing) {
            existing.system.features.target = String(row.base);
            if (row.offset) existing.system.features.modifiers.race = row.offset;
            continue;
        }
        add(skillItem(row.name, { groups: 'Thief', formula: '1d100', target: String(row.base), cost: 0, modifiers: { class: row.points, race: row.offset } }));
    }

    // ── Nonweapon proficiencies ──
    if (rs.nwp) {
        const list = R.nwpList(state);
        for (const name of state.nwp) {
            const def = list.find((p) => p.name === name);
            if (!def) continue;
            add(skillItem(name, { formula: '1d20', ability: def.ability, target: '20', cost: def.cost, modifiers: { other: def.mod } }));
        }
        const bonus = R.nwpSlots(state, tables).bonus;
        if (bonus) raceItem.system.proficiencies = { weapon: raceItem.system.proficiencies?.weapon ?? '', skill: String(bonus) };
    }

    function skillItem(name, { groups = '', formula, ability: abil = 'none', target, cost, modifiers }) {
        return {
            name, type: 'skill', img: 'icons/skills/trades/academics-study-reading-book.webp', effects: [],
            system: { description: '', groups, features: { type: 'decending', ability: abil, target, formula, cost, modifiers: { formula: '0', ...modifiers } } },
        };
    }

    // ── Equipment ──
    for (const line of state.cart) {
        const data = line.uuid ? await content.load(line.uuid) : builtinItem(line.builtin, line.qty);
        if (!data) {
            warnings.push({ key: 'missingItem', value: line.name });
            continue;
        }
        delete data._id;
        if (line.uuid) {
            data.system.sourceUuid = line.uuid;
            if (rs.id === 'osric3') applyOsricPrices(data);
        }
        const pack = Math.max(1, Number(data.system.quantity) || 1);
        data.system.quantity = line.uuid ? pack * line.qty : data.system.quantity;
        if (['container', 'bundle'].includes(data.type) && data.system.itemList?.length) {
            data.system.quantity = 1;
            for (let i = 0; i < line.qty; i++) post.push(structuredClone(data));
        } else add(prepareInventory(data));
    }

    // ── Weapon proficiencies (after equipment, so they can point at owned weapons) ──
    for (const prof of state.weaponProfs) {
        const key = weaponKey(prof.name);
        const applied = items.filter((i) => i.type === 'weapon' && weaponKey(i.name) === key).map((i) => ({ id: i._id }));
        const spec = R.specBonus(state, prof);
        add({
            name: prof.spec ? `${prof.name} (${prof.spec === 2 ? 'Double ' : ''}Specialization)` : prof.name,
            type: 'proficiency', img: 'icons/skills/melee/weapons-crossed-swords-yellow.webp', effects: [],
            system: { description: '', proficiencies: { cost: R.profCost(state, prof) }, appliedto: applied, hit: spec.hit, damage: spec.damage, attacks: spec.attacks, speed: 0 },
        });
    }

    // ── Spellbook ──
    if (state.spells.length) {
        const records = state.spells.map((sp) => ({
            id: sp.uuid.split('.').pop(), uuid: sp.uuid, sourceuuid: '', name: sp.name, type: 'spell', img: sp.img, quantity: '1',
            count: 1, cost: 0, level: 0, skilltarget: 0, itemDiff: {},
        }));
        // Reuse the blank book a class grants, keeping its id so ARS does not grant it again.
        const at = items.findIndex((i) => i.type === 'container' && /spell ?book/i.test(i.name));
        const book = at >= 0 ? items.splice(at, 1)[0] : { name: 'Spellbook', type: 'container', img: ARCANE_BOOK_IMG, effects: [], system: { quantity: 1, weight: 5 } };
        book.system.itemList = records;
        post.push(book);
    }

    // ── Actor ──
    const resolved = R.resolveScores(state);
    const hp = R.totalHp(state, tables);
    const d = state.details;
    const coins = R.purse(Math.max(0, (state.gold ?? 0) - R.cartTotal(state)), rs.variant);
    // Read from the class items themselves, exactly as ARS does when a level changes.
    const ranks = items.filter((i) => i.type === 'class').map((c) => c.system.ranks[c.system.advancement.length - 1]);
    const slots = (type) => Object.fromEntries(Array.from({ length: type === 'arcane' ? 10 : 8 }, (_, i) => [i, ranks.reduce((n, r) => n + (Number(r[type]?.[i]) || 0), 0)]));
    const caster = (type) => Math.max(0, ...ranks.map((r) => Number(r.casterlevel?.[type]) || 0));
    const best = (key) => Math.min(20, ...ranks.map((r) => Number(r[key]) || 20));
    const actor = {
        name: d.name.trim(),
        type: 'character',
        items,
        flags: { 'ars-character-creator': { ruleset: rs.id, method: state.abilities.method, rerolls: state.abilities.rerolls } },
        system: {
            // The race item adds its adjustment as an effect, so it is taken back out here.
            abilities: Object.fromEntries(Object.entries(resolved.scores).map(([k, value]) => [k, { value: value - (race.adj?.[k] ?? 0), percent: k === 'str' ? resolved.percent : 0 }])),
            saves: Object.fromEntries(Object.keys(R.bestSaves(state)).map((k) => [k, { value: best(k) }])),
            spellInfo: {
                level: { arcane: { value: caster('arcane') }, divine: { value: caster('divine') } },
                slots: { arcane: { value: slots('arcane') }, divine: { value: slots('divine') } },
            },
            attributes: { thaco: { value: best('thaco') }, hp: { value: hp, max: hp, min: -10, base: 0 }, size: raceItem.system.attributes?.size ?? 'medium' },
            details: {
                alignment: d.alignment, age: String(d.age ?? ''), sex: d.sex ? d.sex[0].toUpperCase() + d.sex.slice(1) : '', height: String(d.height ?? ''), weight: String(d.weight ?? ''),
                deity: d.deity ?? '', patron: d.patron ?? '', notes: d.notes ?? '',
            },
            currency: { pp: '0', ep: '0', gp: String(coins.gp), sp: String(coins.sp), cp: String(coins.cp) },
        },
    };
    return { actor, post, warnings };
}

const INVENTORY = new Set(['item', 'armor', 'weapon', 'container', 'potion', 'currency']);

/** What ARSItem#_preCreate does for owned items; it does not run for items created inside an actor payload. */
export function prepareInventory(data) {
    const s = data.system;
    s.quantity = Number(s.quantity) || 1;
    const ammo = s.attributes?.type === 'ammunition';
    s.location = { parent: '', ...(s.location ?? {}), state: (data.type === 'weapon' || data.type === 'armor') && !ammo ? 'equipped' : 'carried' };
    if (data.type === 'weapon' && s.attack && !s.attack.modes) {
        const mode = ['melee', 'thrown', 'ranged'].includes(s.attack.type) ? s.attack.type : 'melee';
        s.attack.modes = { melee: { enabled: mode === 'melee' }, thrown: { enabled: mode === 'thrown' }, ranged: { enabled: mode === 'ranged' } };
    }
    return data;
}

const IMG = {
    weapon: 'icons/weapons/swords/sword-guard-engraved-worn.webp', ranged: 'icons/weapons/bows/shortbow-recurve.webp', ammo: 'icons/weapons/ammunition/arrow-broadhead-green.webp',
    armor: 'icons/equipment/chest/breastplate-helmet-metal.webp', shield: 'icons/equipment/shield/heater-steel-worn.webp', item: 'icons/svg/item-bag.svg', container: 'icons/containers/bags/pack-leather-brown.webp',
};

/** ARS item data for a built-in price list row. */
export function builtinItem(row, qty = 1) {
    const attrs = (material, extra = {}) => ({ material, identified: true, ...extra });
    const common = { description: '', weight: row.weight, cost: { value: row.cost, currency: 'gp' }, quantity: (row.quantity ?? 1) * qty };
    switch (row.kind) {
        case 'weapon':
            return {
                name: row.name, type: 'weapon', img: row.mode === 'ranged' ? IMG.ranged : IMG.weapon, effects: [],
                system: {
                    ...common, attributes: attrs(row.mode === 'ranged' ? 'wood_thin' : 'metal', { size: row.size }), size: row.size, weaponstyle: row.name.toLowerCase().replace(/\s*\(thrown\)/, ''),
                    attack: { speed: row.speed, type: row.mode, perRound: row.perRound, range: row.range ?? { short: '', medium: '', long: '' } },
                    damage: { type: row.damageType, normal: row.normal, large: row.large },
                },
            };
        case 'ammo':
            return {
                name: row.name, type: 'weapon', img: IMG.ammo, effects: [],
                system: {
                    ...common, attributes: attrs('wood_thin', { type: 'ammunition' }), attack: { speed: 0, type: 'ranged', perRound: '1/1' },
                    damage: { type: AMMO[row.name].type, normal: AMMO[row.name].normal, large: AMMO[row.name].large },
                },
            };
        case 'armor':
            return {
                name: row.name, type: 'armor', img: row.type === 'shield' ? IMG.shield : IMG.armor, effects: [],
                system: { ...common, attributes: attrs('metal'), protection: { type: row.type, ac: row.ac, modifier: 0, bulk: row.bulk } },
            };
        case 'container':
            return { name: row.name, type: 'container', img: IMG.container, effects: [], system: { ...common, attributes: attrs('leather_book'), itemList: [] } };
        default:
            return { name: row.name, type: 'item', img: IMG.item, effects: [], system: { ...common, attributes: attrs('leather_book', { type: 'gear' }) } };
    }
}
