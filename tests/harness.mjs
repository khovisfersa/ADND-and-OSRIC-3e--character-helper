/**
 * Loads Foundry's shared data layer and ARS's data models in Node, so generated documents
 * can be checked against the real schemas. Paths come from the environment:
 *   FOUNDRY_APP  <Foundry install>/resources/app
 *   ARS_SRC      checkout of advanced-roleplay-system/src
 *   OSRIC_DUMP   optional JSON dump of the osric-compendium "items" pack
 */
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.FOUNDRY_APP ?? 'C:/Program Files/Foundry Virtual Tabletop/resources/app';
const ARS_SRC = process.env.ARS_SRC;
const url = (...p) => pathToFileURL(path.join(...p)).href;

export async function loadArs() {
    if (!ARS_SRC || !fs.existsSync(path.join(APP, 'common'))) return null;
    await import(url(APP, 'common/primitives/_module.mjs'));
    globalThis.CONST = await import(url(APP, 'common/constants.mjs'));
    const utils = await import(url(APP, 'common/utils/_module.mjs'));
    const fields = await import(url(APP, 'common/data/fields.mjs'));
    const abstract = await import(url(APP, 'common/abstract/_module.mjs'));
    const data = await import(url(APP, 'common/data/_module.mjs'));
    globalThis.foundry = { utils, CONST, abstract, data: { ...data, fields } };
    globalThis.game = { system: { version: 'test' }, i18n: { localize: (s) => s } };
    globalThis.logger = console;
    // config.js imports runtime code (canvas, psionics UI); only its tables are needed here.
    registerHooks({
        resolve(specifier, context, next) {
            if ((context.parentURL ?? '').endsWith('module/config.js')) return { url: 'stub:' + specifier, shortCircuit: true };
            return next(specifier, context);
        },
        load(target, context, next) {
            if (!target.startsWith('stub:')) return next(target, context);
            return { format: 'module', shortCircuit: true, source: stubSource() };
        },
    });
    const { ARS } = await import(url(ARS_SRC, 'module/config.js'));
    const model = async (p) => (await import(url(ARS_SRC, 'module/data-models', p))).default;
    const items = {};
    for (const t of ['ability', 'armor', 'class', 'container', 'proficiency', 'race', 'skill', 'spell', 'weapon', 'item', 'currency', 'potion']) items[t] = await model(`items/${t}.js`);
    return { ARS, character: await model('actors/character.js'), items };
}

const stubSource = () => 'export default {};';

/** A ContentLibrary stand-in backed by a dump of the OSRIC items pack. */
export function dumpContent() {
    const file = process.env.OSRIC_DUMP;
    if (!file || !fs.existsSync(file)) return emptyContent();
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    const effects = Object.fromEntries(rows.filter(([k]) => k.startsWith('!items.effects!')).map(([, v]) => [v._id, v]));
    const docs = rows.filter(([k]) => k.startsWith('!items!')).map(([, v]) => ({ ...v, effects: v.effects.map((id) => effects[id]).filter(Boolean) }));
    const byId = new Map(docs.map((d) => [d._id, d]));
    const uuid = (d) => `Compendium.osric-compendium.items.Item.${d._id}`;
    return {
        docs, empty: false,
        find: (type, names) => {
            const d = docs.find((x) => x.type === type && names.some((n) => n.toLowerCase() === x.name.toLowerCase()));
            return d ? { uuid: uuid(d), img: d.img, name: d.name, type } : null;
        },
        load: async (u) => structuredClone(byId.get(u.split('.').pop()) ?? null),
        loadById: async (id) => structuredClone(byId.get(id) ?? null),
        uuidOf: (type, name) => uuid(docs.find((d) => d.type === type && d.name === name)),
    };
}
export const emptyContent = () => ({ empty: true, find: () => null, load: async () => null, loadById: async () => null });

let seq = 0;
export const randomID = () => `test${String(++seq).padStart(12, '0')}`;
/** Deterministic dice (mulberry32). */
export function seeded(seed) {
    let s = seed;
    const next = () => {
        s = (s + 0x6d2b79f5) | 0;
        let x = Math.imul(s ^ (s >>> 15), 1 | s);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    return async (n, faces) => Array.from({ length: n }, () => 1 + Math.floor(next() * faces));
}
