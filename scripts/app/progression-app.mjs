import { MODULE_ID, setting } from '../main.mjs';
import { ContentLibrary } from '../core/content.mjs';
import { prepareInventory } from '../core/builder.mjs';
import * as P from '../core/progression.mjs';
import * as R from '../core/rules.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const T = (key, data) => (data ? game.i18n.format(`ARSCC.${key}`, data) : game.i18n.localize(`ARSCC.${key}`));
const tpl = (name) => `modules/${MODULE_ID}/templates/progression/${name}.hbs`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const SAVE_LABELS = { death: 'death', petrification: 'petrification', wand: 'wand', breath: 'breath', spell: 'spell' };
const newChoices = () => ({ die: null, rolled: false, weapons: [], upgrades: [], nwp: [], points: {}, spells: [], payTraining: false, weeks: null });

/** Experience and level advancement for one character. */
export class ProgressionApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['ars-cc', 'ars-cc-progress'],
        window: { icon: 'fa-solid fa-arrow-trend-up', resizable: true },
        position: { width: 720, height: 680 },
        form: { submitOnChange: false, closeOnSubmit: false, handler: () => {} },
        actions: {
            awardXp: ProgressionApp.#onAwardXp,
            startLevel: ProgressionApp.#onStartLevel,
            back: function () { this.classId = null; this.render(); },
            rollHp: ProgressionApp.#onRollHp,
            rollWeeks: ProgressionApp.#onRollWeeks,
            toggleWeapon: function (_e, el) { this.#toggle(this.choices.weapons, el.dataset.name); },
            toggleUpgrade: function (_e, el) { this.#toggle(this.choices.upgrades, el.dataset.id); },
            toggleNwp: function (_e, el) { this.#toggle(this.choices.nwp, el.dataset.name); },
            toggleSpell: ProgressionApp.#onToggleSpell,
            preview: async function (_e, el) { (await fromUuid(el.dataset.uuid))?.sheet?.render(true); },
            apply: ProgressionApp.#onApply,
        },
    };

    static PARTS = {
        body: { template: tpl('body'), templates: [tpl('overview'), tpl('level')], scrollable: ['', '[data-scroll="weapons"]', '[data-scroll="nwp"]', '[data-scroll="spells"]'] },
        footer: { template: tpl('footer') },
    };

    constructor(actor, options = {}) {
        super({ ...options, id: `ars-cc-progress-${actor.id}` });
        this.actor = actor;
        this.classId = null;
        this.award = null;
        this.force = false;
        this.choices = newChoices();
        this.filters = { weapon: '', nwp: '', spell: '' };
        this.busy = false;
    }

    get title() {
        return T('progress.title', { name: this.actor.name });
    }

    get tables() {
        return CONFIG.ARS;
    }

    get canForce() {
        return game.user.isGM;
    }

    #snapshot() {
        const source = this.actor.toObject();
        // Scores as ARS derives them: ancestry and magic included.
        source.system.abilities = Object.fromEntries(Object.entries(this.actor.system.abilities).map(([k, v]) => [k, { value: v.value, percent: v.percent }]));
        return P.snapshot(source, P.rulesetOf(source, game.settings.get('ars', 'systemVariant')));
    }

    #toggle(list, value) {
        const i = list.indexOf(value);
        if (i >= 0) list.splice(i, 1);
        else list.push(value);
        this.render();
    }

    // ───────────────────────── Rendering ─────────────────────────

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const snap = (this.snap = this.#snapshot());
        if (this.classId && !snap.classes.some((c) => c.id === this.classId)) this.classId = null;
        const base = { actorName: this.actor.name, ruleset: T(`rulesets.${snap.rulesetId}`), busy: this.busy, inLevel: !!this.classId };
        if (!this.classId) return Object.assign(context, base, { bodyTemplate: tpl('overview'), data: this.#ctxOverview(snap) });
        this.content ??= await ContentLibrary.create(setting('sourcePacks').split(',').map((s) => s.trim()).filter(Boolean));
        const plan = (this.plan = P.planLevel(snap, this.classId, this.tables));
        const issues = P.checkChoices(snap, plan, this.choices, this.tables);
        return Object.assign(context, base, {
            bodyTemplate: tpl('level'), data: this.#ctxLevel(snap, plan),
            issues: issues.map((i) => ({ ...i, text: T(`issues.${i.key}`, { value: i.value ?? '', cls: plan.name }) })),
            canApply: !this.busy && !issues.some((i) => i.level === 'error'),
        });
    }

    #ctxOverview(snap) {
        const award = Number(this.award) || 0;
        return {
            classes: snap.classes.map((c) => {
                const p = P.classProgress(snap, c);
                return {
                    ...p, canLevel: p.active && p.level > 0 && !p.topRank && (p.ready || (this.force && this.canForce)),
                    xpText: p.xp.toLocaleString(game.i18n.lang), nextText: p.next.toLocaleString(game.i18n.lang), missingText: p.missing.toLocaleString(game.i18n.lang),
                    bonusText: p.bonus ? `${signed(p.bonus)}% XP` : '',
                    status: !p.active ? T('progress.inactive') : p.atCap ? T('progress.atCap', { level: p.cap }) : p.ready ? T('progress.ready') : '',
                };
            }),
            none: !snap.classes.length,
            award: this.award ?? '', canAward: game.user.isGM || setting('playersAwardXp'),
            split: award ? P.splitXp(snap, award).map((s) => ({ ...s, text: signed(s.gain) })) : [],
            canForce: this.canForce, force: this.force,
        };
    }

    #ctxLevel(snap, plan) {
        const c = this.choices;
        const match = (name, f) => name.toLowerCase().includes(f.toLowerCase());
        const hp = Number.isFinite(c.die) ? P.hpGain(snap, plan.classId, c.die, this.tables) : null;
        const fixed = /^\d+$/.test(plan.formula);
        const weeks = c.weeks ?? null;
        const training = P.training(snap, plan.level - 1, weeks);
        const state = P.stateOf(snap, plan.classId);
        const known = new Set(snap.profs.map((p) => p.name.replace(/ \((Double )?Specialization\)$/, '').toLowerCase()));
        const upgrades = plan.weapon.available ? P.specializable(snap, plan.classId).filter((u) => u.cost <= plan.weapon.available) : [];
        const weaponUsed = c.weapons.length + upgrades.filter((u) => c.upgrades.includes(u.id)).reduce((n, u) => n + u.cost, 0);
        const changes = [
            plan.thaco.from !== plan.thaco.to ? { label: T('thaco'), from: plan.thaco.from, to: plan.thaco.to } : null,
            plan.attacks ? { label: T('progress.attacks'), ...plan.attacks } : null,
            plan.turn ? { label: T('progress.turn'), ...plan.turn } : null,
            plan.baseAC ? { label: T('progress.baseAC'), ...plan.baseAC } : null,
            plan.move ? { label: T('move'), ...plan.move } : null,
            ...plan.saves.filter((s) => SAVE_LABELS[s.key]).map((s) => ({ label: T(`saves.${s.key}`), from: s.from, to: s.to })),
            ...plan.slots.map((s) => ({ label: T('progress.slots', { type: T(`progress.${s.type}`), level: s.level }), from: s.from, to: s.to })),
            ...plan.skillGains.map((s) => ({ label: s.name, from: `${s.from}%`, to: `${s.to}%` })),
            ...plan.specs.map((s) => ({ label: s.name, from: s.from, to: s.to })),
        ].filter(Boolean);
        const grants = [
            ...plan.features,
            ...P.pendingGrants(snap, snap.classes.find((k) => k.id === plan.classId).itemList, plan.level).map((g) => g.name).filter(Boolean),
        ];
        let spells = null;
        if (plan.spells) {
            const chosen = new Set(c.spells.map((s) => s.uuid));
            const oppose = (school) => plan.spells.opposition.some((o) => String(school).toLowerCase().includes(o.toLowerCase()));
            spells = {
                ...plan.spells, used: c.spells.length, requiredText: plan.spells.required.join(', '),
                rows: this.content.arcaneSpells(plan.spells.maxLevel, plan.spells.folder)
                    .filter((s) => chosen.has(s.uuid) || (!plan.spells.known.includes(s.name.toLowerCase()) && match(s.name, this.filters.spell)))
                    .map((s) => ({ ...s, on: chosen.has(s.uuid), barred: oppose(s.school) })),
            };
        }
        return {
            name: plan.name, level: plan.level, formula: plan.formula, fixed,
            die: c.die ?? '', hp, hpText: hp ? (hp.dual ? T('progress.dualHp') : T('progress.hpGain', { value: hp.gained })) : '',
            canRoll: !fixed && (!c.rolled || game.user.isGM || setting('maxRerolls') === 0), canType: game.user.isGM || setting('allowManual'),
            changes, grants,
            training: training && { ...training, weeksText: weeks ?? '—', needRoll: !!training.dice, options: (training.options ?? []).map((n) => ({ n, selected: (weeks ?? 1) === n })), pay: c.payTraining, purse: Math.round(P.purseGp(snap) * 100) / 100, costText: training.cost.toLocaleString(game.i18n.lang) },
            weapon: plan.weapon.available ? {
                used: weaponUsed, available: plan.weapon.available, over: weaponUsed > plan.weapon.available,
                rows: this.content.weaponNames(R.ruleset(state)).filter((n) => !known.has(n.toLowerCase()) && (c.weapons.includes(n) || match(n, this.filters.weapon)))
                    .map((name) => ({ name, on: c.weapons.includes(name), allowed: R.allowedGear(state, 'weapon', name) })).sort((a, b) => Number(b.on) - Number(a.on) || Number(b.allowed) - Number(a.allowed)),
                upgrades: upgrades.map((u) => ({ ...u, on: c.upgrades.includes(u.id) })),
            } : null,
            nwp: plan.nwp?.available ? {
                used: c.nwp.reduce((n, name) => n + R.nwpCost(state, name), 0), available: plan.nwp.available,
                rows: R.nwpList(state).filter((p) => !snap.names.has(`skill|${p.name.toLowerCase()}`) && (c.nwp.includes(p.name) || match(p.name, this.filters.nwp))).map((p) => ({ ...p, on: c.nwp.includes(p.name) })).sort((a, b) => Number(b.on) - Number(a.on)),
            } : null,
            points: plan.points ? {
                ...plan.points, used: plan.points.rows.reduce((n, r) => n + (Number(c.points[r.id]) || 0), 0),
                rows: plan.points.rows.map((r) => ({ ...r, add: c.points[r.id] ?? 0, final: r.total + (Number(c.points[r.id]) || 0) })),
            } : null,
            spells, filters: this.filters,
        };
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.addEventListener('change', (event) => this.#onInput(event));
        this.element.addEventListener('input', foundry.utils.debounce((event) => {
            if (!event.target.dataset.filter) return;
            this.filters[event.target.dataset.filter] = event.target.value;
            this.render({ parts: ['body'] });
        }, 250));
        this.element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.matches('input')) {
                event.preventDefault();
                event.target.blur();
            }
        });
        // Follow XP and level changes made elsewhere, such as on the sheet.
        this.hooks = ['updateActor', 'updateItem', 'createItem', 'deleteItem'].map((name) => [name, Hooks.on(name, (doc) => {
            if ((doc.parent ?? doc) === this.actor && !this.busy && this.rendered) this.render();
        })]);
    }

    _onClose(options) {
        super._onClose(options);
        for (const [name, id] of this.hooks ?? []) Hooks.off(name, id);
        this.content = null;
    }

    _syncPartState(partId, newElement, priorElement, state) {
        super._syncPartState(partId, newElement, priorElement, state);
        const el = document.activeElement;
        if (newElement.contains(el) && el.matches('input[type="search"]')) el.setSelectionRange(el.value.length, el.value.length);
        if (partId === 'body' && priorElement.dataset.view !== newElement.dataset.view) newElement.scrollTop = 0;
    }

    #onInput(event) {
        const el = event.target;
        const bind = el.dataset.bind;
        if (!bind) return;
        const number = el.value === '' ? null : Number(el.value);
        if (bind === 'award') this.award = number;
        else if (bind === 'force') this.force = el.checked;
        else if (bind === 'die') this.choices.die = number === null ? null : Math.max(0, Math.trunc(number));
        else if (bind === 'pay') this.choices.payTraining = el.checked;
        else if (bind === 'weeks') this.choices.weeks = number;
        else if (bind.startsWith('points.')) this.choices.points[bind.slice(7)] = number ?? 0;
        this.render();
    }

    // ───────────────────────── Actions ─────────────────────────

    async #post(title, lines, rolls = []) {
        if (!setting('postRolls')) return;
        const escape = foundry.utils.escapeHTML;
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }), rolls: rolls.map((r) => r.toJSON?.() ?? r), sound: rolls.length ? CONFIG.sounds.dice : undefined,
            content: `<div class="ars-cc-card"><strong>${escape(title)}</strong><ul>${lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul></div>`,
        });
    }

    static async #onAwardXp() {
        const total = Math.trunc(Number(this.award) || 0);
        if (!total || this.busy) return;
        const split = P.splitXp(this.snap, total);
        if (!split.length) return;
        this.busy = true;
        try {
            await this.actor.updateEmbeddedDocuments('Item', split.map((s) => ({ _id: s.id, 'system.xp': Math.max(0, s.xp + s.gain) })));
            await this.#post(T('progress.awarded', { name: this.actor.name, xp: total }), split.map((s) => `${s.name}: ${signed(s.gain)}`));
            this.award = null;
        } finally {
            this.busy = false;
            this.render();
        }
    }

    static async #onStartLevel(_event, el) {
        this.classId = el.dataset.id;
        this.choices = newChoices();
        const plan = P.planLevel(this.snap, this.classId, this.tables);
        if (/^\d+$/.test(plan.formula)) Object.assign(this.choices, { die: Number(plan.formula), rolled: true });
        await this.render();
    }

    static async #onRollHp() {
        const roll = await new Roll(this.plan.formula, this.actor.getRollData?.() ?? {}).evaluate();
        this.choices.die = P.adjustDie(this.snap, roll.total);
        this.choices.rolled = true;
        await this.#post(T('progress.hpRoll', { name: this.plan.name, level: this.plan.level }), [`${this.plan.formula} = ${roll.total}`], [roll]);
        await this.render();
    }

    static async #onRollWeeks() {
        const roll = await new Roll('1d3').evaluate();
        this.choices.weeks = roll.total;
        await this.render();
    }

    static #onToggleSpell(_event, el) {
        const i = this.choices.spells.findIndex((s) => s.uuid === el.dataset.uuid);
        if (i >= 0) this.choices.spells.splice(i, 1);
        else {
            const spell = this.content.arcaneSpells(this.plan.spells.maxLevel, this.plan.spells.folder).find((s) => s.uuid === el.dataset.uuid);
            if (spell) this.choices.spells.push(spell);
        }
        this.render();
    }

    static async #onApply() {
        if (this.busy) return;
        const snap = this.#snapshot();
        const plan = P.planLevel(snap, this.classId, this.tables);
        if (P.checkChoices(snap, plan, this.choices, this.tables).some((i) => i.level === 'error')) return this.render();
        const progress = P.classProgress(snap, snap.classes.find((c) => c.id === this.classId));
        if (!progress.ready && !(this.force && this.canForce)) return void ui.notifications.warn(T('progress.notReady'));
        this.busy = true;
        await this.render();
        try {
            await applyLevel(this.actor, snap, plan, this.choices, this.content, this.tables);
            const gained = P.hpGain(snap, plan.classId, this.choices.die, this.tables).gained;
            await this.#post(T('progress.reached', { name: this.actor.name, cls: plan.name, level: plan.level }), [T('progress.hpGain', { value: gained }), ...this.choices.weapons, ...this.choices.nwp, ...this.choices.spells.map((s) => s.name)]);
            this.classId = null;
            this.choices = newChoices();
        } catch (error) {
            console.error(`${MODULE_ID} |`, error);
            ui.notifications.error(T('progress.failed', { error: error.message }));
        } finally {
            this.busy = false;
            this.render();
        }
    }
}

/** Write one level to the actor. Everything is loaded before the first write. */
export async function applyLevel(actor, snap, plan, choices, content, tables) {
    const changes = P.levelChanges(snap, plan, choices, tables);
    const grants = [];
    const cls = snap.classes.find((c) => c.id === plan.classId);
    const top = Math.max(...snap.classes.map((c) => P.levelOf(c) + (c.id === plan.classId ? 1 : 0)));
    for (const [list, level] of [[cls.itemList, plan.level], [snap.raceItem?.system.itemList ?? [], top]]) {
        for (const sub of P.pendingGrants(snap, list, level)) {
            const id = sub.id || sub.uuid?.split('.').pop();
            if (grants.some((g) => g._id === id)) continue;
            const data = await content.loadById(id, sub.uuid);
            if (!data || !P.pendingGrants(snap, [{ ...sub, name: data.name }], level).length) continue;
            const cost = parseInt(sub.cost) || 0;
            if (data.type === 'skill') {
                if (parseInt(sub.skilltarget)) data.system.features.target = String(parseInt(sub.skilltarget));
                data.system.features.cost = cost;
            }
            if (data.type === 'proficiency') data.system.proficiencies.cost = cost;
            data._id = id;
            data.system.sourceUuid = sub.uuid ?? '';
            grants.push(data);
        }
    }
    const spells = [];
    for (const s of choices.spells) {
        const data = await content.load(s.uuid);
        if (!data) continue;
        delete data._id;
        data.system.sourceUuid = s.uuid;
        data.system.quantity = 1;
        spells.push(data);
    }

    const options = { hideChanges: true, skipCombine: true };
    await actor.updateEmbeddedDocuments('Item', changes.updates);
    if (grants.length) await actor.createEmbeddedDocuments('Item', grants.map((g) => (['weapon', 'armor', 'item', 'container'].includes(g.type) ? prepareInventory(g) : g)), { ...options, keepId: true });
    if (changes.create.length) await actor.createEmbeddedDocuments('Item', changes.create, options);
    if (spells.length) await addToBook(actor, snap.book?._id, spells, options);
    await actor.update(changes.actor);
    return changes;
}

async function addToBook(actor, bookId, spells, options) {
    let book = bookId ? actor.items.get(bookId) : null;
    if (!book) [book] = await actor.createEmbeddedDocuments('Item', [{ name: 'Spellbook', type: 'container', img: 'icons/sundries/books/book-clasp-spiral-green.webp', system: { quantity: 1, weight: 5, itemList: [] } }], options);
    const made = await actor.createEmbeddedDocuments('Item', spells, { ...options, arsContainerContents: true });
    const list = foundry.utils.deepClone(book.toObject().system.itemList ?? []);
    for (const s of made ?? []) list.push({ id: s.id, uuid: s.uuid, sourceuuid: '', type: s.type, name: s.name, img: s.img, quantity: '1' });
    await book.update({ 'system.itemList': list });
}
