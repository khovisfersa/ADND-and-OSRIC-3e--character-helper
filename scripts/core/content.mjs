import { ARMOR_1E, ARMOR_2E, GEAR, WEAPONS_1E, WEAPONS_2E, osricCost } from '../data/equipment.mjs';
import { toGp } from './rules.mjs';

const TYPES = new Set(['class', 'race', 'ability', 'spell', 'weapon', 'armor', 'item', 'container', 'potion', 'bundle', 'skill', 'proficiency']);
const FIELDS = ['system.cost', 'system.weight', 'system.quantity', 'system.level', 'system.type', 'system.school', 'system.sphere', 'system.attributes.type', 'system.attributes.magic', 'system.protection', 'system.damage', 'system.attack', 'folder'];

/** Read access to the Items this user can see: world items first, then compendiums in order. */
export class ContentLibrary {
    #entries = [];
    #byId = new Map();

    /** @param {string[]} packIds Restrict to these packs; empty means every visible Item pack. */
    static async create(packIds = []) {
        const lib = new ContentLibrary();
        const all = game.packs.filter((p) => p.documentName === 'Item' && p.visible);
        const packs = packIds.length ? packIds.map((id) => all.find((p) => p.collection === id)).filter(Boolean) : all;
        for (const item of game.items) if (item.testUserPermission(game.user, 'OBSERVER')) lib.#push(item, item.uuid, item.folder?.name ?? '');
        for (const pack of packs) {
            try {
                const index = await pack.getIndex({ fields: FIELDS });
                for (const e of index) lib.#push(e, e.uuid ?? `Compendium.${pack.collection}.Item.${e._id}`, lib.#folderPath(pack, e.folder));
            } catch (error) {
                console.warn(`ars-character-creator | could not read ${pack.collection}`, error);
            }
        }
        return lib;
    }

    #folderPath(pack, id) {
        const names = [];
        for (let f = pack.folders?.get(id); f; f = f.folder) names.unshift(f.name);
        return names.join('/');
    }

    #push(doc, uuid, folder) {
        if (!TYPES.has(doc.type)) return;
        const entry = { uuid, id: doc.id ?? doc._id, name: doc.name, type: doc.type, img: doc.img, folder, system: doc.system ?? {} };
        this.#entries.push(entry);
        if (!this.#byId.has(entry.id)) this.#byId.set(entry.id, entry);
    }

    /** First item of a type whose name is one of `names`. */
    find(type, names) {
        const wanted = names.map((n) => n.toLowerCase());
        return this.#entries.find((e) => e.type === type && wanted.includes(e.name.toLowerCase())) ?? null;
    }

    async load(uuid) {
        const doc = await fromUuid(uuid);
        if (!doc) return null;
        const data = doc.toObject();
        data._id = doc.id;
        return data;
    }

    /** Sub-items are often linked with the world uuid they were authored with, so fall back to the id. */
    async loadById(id, uuid) {
        const entry = this.#byId.get(id);
        if (entry) return this.load(entry.uuid);
        if (uuid?.startsWith('Compendium.')) return this.load(uuid);
        return null;
    }

    /** Arcane spells up to a level; `folder` narrows to the caster's own list when packs are organised by class. */
    arcaneSpells(maxLevel, folder) {
        const spells = this.#entries.filter((e) => e.type === 'spell' && String(e.system.type).toLowerCase() === 'arcane' && Number(e.system.level) >= 1 && Number(e.system.level) <= maxLevel);
        const inFolder = spells.filter((e) => folder.test(e.folder));
        // A spell shared by two lists is offered once, at its lowest level.
        return dedupe((inFolder.length ? inFolder : spells).sort((a, b) => Number(a.system.level) - Number(b.system.level)))
            .map((e) => ({ uuid: e.uuid, name: e.name, img: e.img, level: Number(e.system.level), school: e.system.school ?? '' }))
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    }

    /** Purchasable goods for a ruleset. */
    shop(ruleset) {
        const rows = [];
        const native = ruleset.id === 'osric3';
        const hasCompendiumGear = this.#entries.some((e) => e.type === 'weapon' && e.uuid.startsWith('Compendium.'));
        for (const e of this.#entries) {
            const category = { weapon: 'weapon', armor: 'armor', item: 'gear', container: 'gear', bundle: 'gear', potion: 'gear' }[e.type];
            if (!category || e.system.attributes?.magic) continue;
            if (!native && (category === 'weapon' || category === 'armor') && e.uuid.startsWith('Compendium.osric-compendium.')) {
                if (e.system.attributes?.type !== 'ammunition') continue;
            }
            const cost = native ? osricCost(e.name, e.system.cost) : e.system.cost;
            const price = toGp(cost?.value, cost?.currency ?? 'gp', ruleset.variant);
            if (!(price > 0) && !/club|staff|sling/i.test(e.name)) continue;
            if (/^(brawl|boulder|movement|shillelagh|fire seed|produced flame)/i.test(e.name)) continue;
            rows.push({
                id: e.uuid, uuid: e.uuid, name: e.name, img: e.img, category, price: round(price), weight: (Number(e.system.weight) || 0) * Math.max(1, Number(e.system.quantity) || 1), shield: e.system.protection?.type === 'shield',
                info: shopInfo(e), ammo: e.system.attributes?.type === 'ammunition', mode: e.system.attack?.type,
            });
        }
        const builtin = native ? (hasCompendiumGear ? [] : [...WEAPONS_1E, ...ARMOR_1E, ...GEAR]) : [...(ruleset.id === 'add1e' ? [...WEAPONS_1E, ...ARMOR_1E] : [...WEAPONS_2E, ...ARMOR_2E]), ...(hasCompendiumGear ? [] : GEAR)];
        for (const row of builtin) {
            rows.push({
                id: `builtin:${row.name}`, builtin: row, name: row.name, img: null, category: row.kind === 'armor' ? 'armor' : row.kind === 'weapon' || row.kind === 'ammo' ? 'weapon' : 'gear',
                price: row.cost, weight: row.weight * (row.quantity ?? 1), shield: row.type === 'shield', ammo: row.kind === 'ammo', mode: row.mode,
                info: row.kind === 'weapon' ? `${row.normal} / ${row.large}` : row.kind === 'armor' ? (row.type === 'shield' ? '+1' : `AC ${row.ac}`) : (row.quantity ?? 1) > 1 ? `×${row.quantity}` : '',
            });
        }
        return dedupe(rows, (r) => `${r.category}|${r.name.toLowerCase()}`).sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Weapon names a character can be proficient with; thrown/melee forms share one entry. */
    weaponNames(ruleset) {
        const names = this.shop(ruleset).filter((r) => r.category === 'weapon' && !r.ammo && !/holy water|lamp oil|caltrop|grapple/i.test(r.name)).map((r) => r.name.replace(/\s*\(thrown\)/i, '').replace(/^Thrown\s+/i, ''));
        return [...new Set(names)].sort((a, b) => a.localeCompare(b));
    }

    get isEmpty() {
        return !this.#entries.length;
    }
}

const round = (n) => Math.round(n * 1000) / 1000;

function shopInfo(e) {
    if (e.type === 'weapon') return [e.system.damage?.normal, e.system.damage?.large].filter(Boolean).join(' / ');
    if (e.type === 'armor') return e.system.protection?.type === 'shield' ? `+${e.system.protection.ac}` : `AC ${e.system.protection?.ac ?? 10}`;
    return '';
}

function dedupe(list, key = (e) => e.name.toLowerCase()) {
    const seen = new Set();
    return list.filter((e) => (seen.has(key(e)) ? false : seen.add(key(e))));
}
