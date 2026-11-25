import { MODULE_ID, createCharacter, setting } from '../main.mjs';
import { RULESETS } from '../data/index.mjs';
import { ABILITIES, ALIGNMENTS, BUILD } from '../data/shared.mjs';
import { ContentLibrary } from '../core/content.mjs';
import * as R from '../core/rules.mjs';
import { buildActor } from '../core/builder.mjs';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const T = (key, data) => (data ? game.i18n.format(`ARSCC.${key}`, data) : game.i18n.localize(`ARSCC.${key}`));
const tpl = (name) => `modules/${MODULE_ID}/templates/${name}.hbs`;
const STEP_ICONS = {
    rules: 'fa-book-open', abilities: 'fa-dice-d6', race: 'fa-people-group', class: 'fa-shield-halved', details: 'fa-feather-pointed',
    skills: 'fa-hand-fist', spells: 'fa-wand-sparkles', equipment: 'fa-coins', review: 'fa-scroll',
};
const HP_MODES = ['maxFirst', 'roll', 'average', 'max'];
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'ars-character-creator',
        tag: 'form',
        classes: ['ars-cc'],
        window: { title: 'ARSCC.title', icon: 'fa-solid fa-scroll', resizable: true },
        position: { width: 1080, height: 760 },
        form: { submitOnChange: false, closeOnSubmit: false, handler: () => {} },
        actions: {
            goto: function (_e, el) { this.#go(el.dataset.step); },
            next: function () { this.#move(1); },
            prev: function () { this.#move(-1); },
            restart: CharacterCreator.#onRestart,
            create: CharacterCreator.#onCreate,
            rollAbilities: CharacterCreator.#onRollAbilities,
            autoAssign: CharacterCreator.#onAutoAssign,
            pickSet: function (_e, el) { this.draft.abilities.setIndex = Number(el.dataset.index); this.#changed(); },
            pickRace: CharacterCreator.#onPickRace,
            pickClass: CharacterCreator.#onPickClass,
            pickCombo: function (_e, el) { this.#setClasses(el.dataset.combo.split(',')); },
            rollPercent: CharacterCreator.#onRollPercent,
            rollHp: CharacterCreator.#onRollHp,
            rollGold: CharacterCreator.#onRollGold,
            rollBuild: CharacterCreator.#onRollBuild,
            toggleProf: CharacterCreator.#onToggleProf,
            cycleSpec: CharacterCreator.#onCycleSpec,
            toggleNwp: CharacterCreator.#onToggleNwp,
            toggleSpell: CharacterCreator.#onToggleSpell,
            buy: CharacterCreator.#onBuy,
            qty: CharacterCreator.#onQty,
            preview: async function (_e, el) { (await fromUuid(el.dataset.uuid))?.sheet?.render(true); },
        },
    };

    static PARTS = {
        nav: { template: tpl('nav') },
        body: {
            template: tpl('body'),
            templates: R.STEPS.map((s) => tpl(`steps/${s}`)),
            scrollable: ['', '[data-scroll="weapons"]', '[data-scroll="nwp"]', '[data-scroll="shop"]', '.acc-cart-lines'],
        },
        summary: { template: tpl('summary'), scrollable: [''] },
        footer: { template: tpl('footer') },
    };

    constructor(options = {}) {
        super(options);
        const draft = game.settings.get(MODULE_ID, 'draft');
        const variantRules = Object.values(RULESETS).find((r) => r.variant === String(game.settings.get('ars', 'systemVariant')))?.id ?? 'osric3';
        this.draft = RULESETS[draft?.state?.ruleset] ? foundry.utils.mergeObject(R.newState(draft.state.ruleset), draft.state, { inplace: false }) : R.newState(variantRules);
        this.step = R.STEPS.includes(draft?.step) ? draft.step : 'rules';
        this.filters = { weapon: '', nwp: '', spell: '', spellLevel: '', shop: '', shopCategory: 'weapon', onlyAllowed: true };
        this.busy = false;
    }

    get tables() {
        return CONFIG.ARS;
    }

    get rs() {
        return R.ruleset(this.draft);
    }

    #saveDraft = foundry.utils.debounce(() => game.settings.set(MODULE_ID, 'draft', { state: this.draft, step: this.step }), 400);

    // ───────────────────────── Navigation ─────────────────────────

    #go(step) {
        if (!R.STEPS.includes(step)) return;
        this.step = step;
        this.#saveDraft();
        this.render();
    }

    #move(delta) {
        const visible = this.#visibleSteps();
        this.#go(visible[Math.clamp(visible.indexOf(this.step) + delta, 0, visible.length - 1)]);
    }

    /** The spell step only exists for characters who keep a spellbook. */
    #visibleSteps() {
        const hasBook = this.draft.classes.length && R.spellbookInfo(this.draft, this.tables);
        return R.STEPS.filter((s) => s !== 'spells' || hasBook);
    }

    #changed() {
        R.reconcile(this.draft);
        this.#saveDraft();
        return this.render();
    }

    // ───────────────────────── Rendering ─────────────────────────

    /** Keep the caret where the user was typing when a filter re-renders the list. */
    _syncPartState(partId, newElement, priorElement, state) {
        super._syncPartState(partId, newElement, priorElement, state);
        const el = document.activeElement;
        if (newElement.contains(el) && el.matches('input[type="search"], input[type="text"]')) el.setSelectionRange(el.value.length, el.value.length);
        // Scroll positions belong to one step; a new step starts at the top.
        if (partId === 'body' && priorElement.dataset.step !== newElement.dataset.step) newElement.scrollTop = 0;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        this.content ??= await ContentLibrary.create(setting('sourcePacks').split(',').map((s) => s.trim()).filter(Boolean));
        if (!this.#visibleSteps().includes(this.step)) this.step = 'skills';
        const issues = R.validate(this.draft, this.tables);
        const steps = this.#visibleSteps();
        Object.assign(context, {
            step: this.step,
            bodyTemplate: tpl(`steps/${this.step}`),
            steps: steps.map((id, i) => this.#stepEntry(id, i, issues)),
            summary: this.#summary(),
            issues: issues[this.step].map((i) => ({ ...i, text: this.#issueText(i) })),
            isFirst: this.step === steps[0],
            isLast: this.step === 'review',
            canCreate: !R.hasErrors(issues) && !this.busy,
            busy: this.busy,
            state: this.draft,
        });
        const prepare = { rules: () => this.#ctxRules(), abilities: () => this.#ctxAbilities(), race: () => this.#ctxRace(), class: () => this.#ctxClass(), details: () => this.#ctxDetails(), skills: () => this.#ctxSkills(), spells: () => this.#ctxSpells(), equipment: () => this.#ctxEquipment(), review: () => this.#ctxReview(issues) };
        context.data = prepare[this.step]();
        return context;
    }

    #stepEntry(id, index, issues) {
        const order = R.STEPS.indexOf(id);
        const reached = order <= R.STEPS.indexOf(this.step);
        const errors = issues[id].some((i) => i.level === 'error');
        const s = this.draft;
        const touched = { rules: true, abilities: !issues.abilities.length, race: !!s.race, class: !!s.classes.length, details: !!s.details.name, skills: s.weaponProfs.length > 0, spells: s.spells.length > 0, equipment: s.gold !== null, review: false }[id];
        const status = errors ? (reached || touched ? 'error' : 'todo') : touched ? 'done' : 'todo';
        return { id, label: T(`steps.${id}`), icon: STEP_ICONS[id], n: index + 1, active: id === this.step, status };
    }

    #raceLabel(key) {
        return T(`races.${key}`);
    }

    #classLabel(key) {
        return T(`classes.${key}`);
    }

    #reason(r) {
        return T(`reasons.${r.key}`, {
            ability: r.ability ? T(`abilities.${r.ability}`) : '', value: r.value ?? '', score: r.score ?? '', cls: r.classKey ? this.#classLabel(r.classKey) : '', race: this.draft.race ? this.#raceLabel(this.draft.race) : '',
        });
    }

    #issueText(i) {
        return T(`issues.${i.key}`, { value: i.value ?? '', cls: i.classKey ? this.#classLabel(i.classKey) : '' });
    }

    #summary() {
        const s = this.draft;
        const { scores, percent } = R.resolveScores(s);
        const ready = s.classes.length && s.race;
        const levels = ready ? R.startLevels(s) : {};
        return {
            name: s.details.name?.trim() || T('summary.unnamed'),
            ruleset: T(`rulesets.${s.ruleset}`),
            line: [s.race ? this.#raceLabel(s.race) : '', s.classes.map((c) => `${this.#classLabel(c)} ${levels[c] ?? ''}`).join(' / ')].filter(Boolean).join(' · '),
            alignment: s.details.alignment ? game.i18n.localize(CONFIG.ARS.alignmentTypes[s.details.alignment]) : '',
            scores: ABILITIES.map((k) => ({ key: k, label: T(`abilitiesShort.${k}`), value: scores[k] ?? '—', extra: k === 'str' && percent ? `/${percent === 100 ? '00' : String(percent).padStart(2, '0')}` : '' })),
            ready,
            hp: ready ? R.totalHp(s, this.tables) ?? '—' : '—',
            thaco: ready ? R.bestThaco(s) : '—',
            saves: ready ? Object.entries(this.#saveRows(R.bestSaves(s))).map(([label, value]) => ({ label, value })) : [],
            gold: s.gold === null ? '—' : `${Math.round((s.gold - R.cartTotal(s)) * 100) / 100} ${T('gp')}`,
        };
    }

    #saveRows(b) {
        return { [T('saves.death')]: b.death, [T('saves.petrification')]: b.petrification, [T('saves.wand')]: b.wand, [T('saves.breath')]: b.breath, [T('saves.spell')]: b.spell };
    }

    #ctxRules() {
        const variant = String(game.settings.get('ars', 'systemVariant'));
        return {
            rulesets: Object.values(RULESETS).map((r) => ({ id: r.id, label: T(`rulesets.${r.id}`), hint: T(`rulesetHints.${r.id}`), selected: r.id === this.draft.ruleset, matches: r.variant === variant, locked: setting('lockRuleset') && r.variant !== variant })),
            mismatch: this.rs.variant !== variant ? T('variantMismatch', { world: T(`variants.${variant}`), chosen: T(`variants.${this.rs.variant}`) }) : '',
            maxLevel: setting('maxStartLevel'),
            hpModes: HP_MODES.map((id) => ({ id, label: T(`hpModes.${id}`), selected: id === this.draft.hpMode })),
            canIgnore: game.user.isGM || setting('allowIgnoreLimits'),
            noContent: this.content.isEmpty,
            osricNote: this.draft.ruleset === 'osric3',
            canShortfall: !!this.rs.xpPenalty && (game.user.isGM || setting('allowIgnoreLimits')),
        };
    }

    #ctxAbilities() {
        const a = this.draft.abilities;
        const methods = this.rs.methods.filter((m) => m !== 'manual' || setting('allowManual') || game.user.isGM);
        const base = R.baseScores(this.draft);
        const max = setting('maxRerolls');
        const used = a.pool.map((_, i) => Object.entries(a.assign).find(([, v]) => v === i)?.[0] ?? null);
        const rolled = !!(a.pool.length || a.sets.length || a.dice.length || a.fixed);
        return {
            methods: methods.map((id) => ({ id, label: T(`methods.${id}`), selected: id === a.method })),
            hint: T(`methodHints.${a.method}`),
            isManual: a.method === 'manual',
            isPool: a.pool.length > 0,
            isSets: a.sets.length > 0,
            isDice: a.dice.length > 0,
            rolled,
            limited: max > 0,
            rollsLeft: Math.max(0, max - a.rerolls),
            canRoll: a.method !== 'manual' && (max === 0 || a.rerolls < max),
            rollLabel: rolled ? T('reroll') : T('roll'),
            pool: a.pool.map((v, i) => ({ v, used: !!used[i] })),
            sets: a.sets.map((set, i) => ({ i, n: i + 1, selected: a.setIndex === i, values: ABILITIES.map((k) => set[k]), total: ABILITIES.reduce((x, k) => x + set[k], 0) })),
            headers: ABILITIES.map((k) => T(`abilitiesShort.${k}`)),
            dice: a.dice.map((v, i) => ({ v, i, options: ABILITIES.map((k) => ({ k, label: T(`abilitiesShort.${k}`), selected: a.diceTo[i] === k })) })),
            rows: ABILITIES.map((k) => ({
                key: k, label: T(`abilities.${k}`), value: base[k], manual: a.manual[k] ?? '',
                options: a.pool.map((v, i) => ({ i, v, selected: a.assign[k] === i, taken: used[i] && used[i] !== k })),
                effects: base[k] === null ? [] : this.#abilityEffects(k, base[k]),
            })),
        };
    }

    /** Short preview of what a score does, read from ARS's own tables. */
    #abilityEffects(key, score, percent = 0) {
        const v = this.rs.variant;
        const t = CONFIG.ARS;
        const row = (table) => table?.[v]?.[score] ?? [];
        const first = (x) => (Array.isArray(x) ? x[0] : x);
        switch (key) {
            case 'str': {
                const r = percent && score === 18 ? t.strengthTable[v][[50, 75, 90, 99, 100].find((b) => percent <= b)] : row(t.strengthTable);
                return [`${T('fx.hit')} ${signed(r[0] ?? 0)}`, `${T('fx.dmg')} ${signed(r[1] ?? 0)}`];
            }
            case 'dex': return [`${T('fx.missile')} ${signed(row(t.dexterityTable)[1] ?? 0)}`, `${T('fx.ac')} ${signed(row(t.dexterityTable)[2] ?? 0)}`];
            case 'con': {
                const hp = row(t.constitutionTable)[0] ?? [0];
                return [`${T('fx.hp')} ${[].concat(hp).map(signed).join(' / ')}`];
            }
            case 'int': return [`${T('fx.languages')} ${first(row(t.intelligenceTable)[0]) ?? 0}`];
            case 'wis': return [`${T('fx.magic')} ${signed(Number(first(row(t.wisdomTable)[0])) || 0)}`];
            case 'cha': return [`${T('fx.henchmen')} ${first(row(t.charismaTable)[0]) ?? 0}`];
            default: return [];
        }
    }

    #ctxRace() {
        return {
            races: Object.entries(this.rs.races).map(([key, race]) => {
                const status = R.raceStatus(this.draft, key);
                return {
                    key, label: this.#raceLabel(key), ok: status.ok, selected: this.draft.race === key, reasons: status.reasons.map((r) => this.#reason(r)),
                    adj: Object.entries(race.adj ?? {}).map(([k, v]) => `${T(`abilitiesShort.${k}`)} ${signed(v)}`).join(', ') || T('noAdjust'),
                    move: race.move, infravision: race.infravision ?? 0,
                    classes: Object.keys(race.levels).map((c) => this.#classLabel(c)).join(', '),
                    uuid: this.content.find('race', race.compendium)?.uuid ?? '',
                };
            }),
        };
    }

    #ctxClass() {
        if (!this.draft.race) return { needRace: true };
        const rs = this.rs;
        const es = R.exceptionalStrength(this.draft);
        return {
            classes: Object.entries(rs.classes).map(([key, cls]) => {
                const status = R.classStatus(this.draft, key);
                const bonus = R.xpBonus(this.draft, key);
                return {
                    key, label: this.#classLabel(key), ok: status.ok, selected: this.draft.classes.length === 1 && this.draft.classes[0] === key,
                    reasons: status.reasons.map((r) => this.#reason(r)), warnings: status.warnings.map((r) => this.#reason(r)),
                    cap: status.cap === 0 ? '—' : status.cap >= cls.max && (rs.races[this.draft.race]?.levels[key] === Infinity || this.draft.ignoreLimits) ? T('unlimited') : status.cap,
                    hd: `${cls.firstHd ? cls.firstHd : ''}d${cls.hd}`, prime: cls.prime.map((k) => T(`abilitiesShort.${k}`)).join(', ') || '—', bonusText: bonus ? `${signed(bonus)}% XP` : '',
                    min: ABILITIES.filter((k) => cls.min[k] > 3).map((k) => `${T(`abilitiesShort.${k}`)} ${cls.min[k]}`).join(', ') || '—',
                    uuid: cls.compendium ? this.content.find('class', cls.compendium)?.uuid ?? '' : '',
                };
            }).sort((a, b) => Number(b.ok) - Number(a.ok)),
            combos: R.multiOptions(this.draft).map((m) => ({ ...m, value: m.combo.join(','), label: m.combo.map((c) => this.#classLabel(c)).join(' / '), why: m.ok ? '' : m.reasons.map((r) => this.#reason(r)).join('; ') })),
            raceLabel: this.#raceLabel(this.draft.race),
            strength: es ? { max: es.max, value: this.draft.strPercent ?? '', canEdit: game.user.isGM || setting('allowManual'), canRoll: !this.draft.strPercent || game.user.isGM || setting('maxRerolls') === 0, effects: this.draft.strPercent ? this.#abilityEffects('str', 18, this.draft.strPercent) : [] } : null,
        };
    }

    #ctxDetails() {
        const s = this.draft;
        if (!s.classes.length) return { needClass: true };
        const allowed = R.alignmentsFor(s);
        const levels = R.startLevels(s);
        return {
            alignments: ALIGNMENTS.map((id) => ({ id, label: game.i18n.localize(CONFIG.ARS.alignmentTypes[id]), ok: allowed.includes(id), selected: s.details.alignment === id })),
            sexes: ['male', 'female', 'other'].map((id) => ({ id, label: T(`sex.${id}`), selected: s.details.sex === id })),
            hpRows: s.classes.map((c) => ({ label: this.#classLabel(c), level: levels[c], dice: (s.hp[c] ?? []).join(' + ') || '—' })),
            hpTotal: R.totalHp(s, this.tables) ?? '—',
            hpRolled: R.totalHp(s, this.tables) !== null,
            canRollHp: R.totalHp(s, this.tables) === null || game.user.isGM || setting('maxRerolls') === 0 || ['max', 'average'].includes(s.hpMode),
            hpMode: T(`hpModes.${s.hpMode}`),
            raceLanguages: this.rs.races[s.race].languages.join(', '),
            languages: (s.details.languages ?? []).join(', '),
            languageLimit: R.languageLimit(s, this.tables),
            limitsLanguages: R.languageLimit(s, this.tables) !== null,
            age: this.#ageText(),
        };
    }

    /** "Adult: Str +1, Con +1" for rulesets with age adjustments. */
    #ageText() {
        const categories = R.ageCategories(this.draft);
        if (!categories.length) return '';
        const applied = Object.entries(R.resolveScores(this.draft).applied).filter(([, v]) => v).map(([k, v]) => `${T(`abilitiesShort.${k}`)} ${signed(v)}`);
        return `${T(`ageCategories.${categories.at(-1).key}`)}: ${applied.join(', ') || T('noAdjust')}`;
    }

    #ctxSkills() {
        const s = this.draft;
        if (!s.classes.length) return { needClass: true };
        const w = R.weaponSlots(s);
        const n = R.nwpSlots(s, this.tables);
        const thief = R.thiefSkills(s, this.tables);
        const match = (name, f) => name.toLowerCase().includes(f.toLowerCase());
        const known = new Map(s.weaponProfs.map((p) => [p.name, p]));
        return {
            weapon: { ...w, over: w.used > w.total },
            weapons: this.content.weaponNames(this.rs).filter((name) => known.has(name) || match(name, this.filters.weapon)).map((name) => {
                const p = known.get(name);
                const max = R.maxSpec(s, name);
                return { name, on: !!p, cost: p ? R.profCost(s, p) : 1, allowed: R.allowedGear(s, 'weapon', name), canSpec: !!p && max > 0, specLabel: T(`spec.${p?.spec ?? 0}`), specOn: !!p?.spec };
            }).sort((a, b) => Number(b.on) - Number(a.on) || Number(b.allowed) - Number(a.allowed)),
            hasNwp: this.rs.nwp,
            nwp: { ...n, over: n.used > n.total },
            nwps: this.rs.nwp ? R.nwpList(s).filter((p) => s.nwp.includes(p.name) || match(p.name, this.filters.nwp)).map((p) => ({ ...p, on: s.nwp.includes(p.name), check: p.ability === 'none' ? '—' : `${T(`abilitiesShort.${p.ability}`)} ${p.mod ? signed(p.mod) : ''}` })).sort((a, b) => Number(b.on) - Number(a.on)) : [],
            thief: thief.rows.length ? { ...thief, over: thief.points && thief.points.used > thief.points.total, rows: thief.rows.map((r) => ({ ...r, dexMod: signed(r.dexMod), raceMod: signed(r.raceMod) })) } : null,
            filters: this.filters,
        };
    }

    #ctxSpells() {
        const s = this.draft;
        const book = R.spellbookInfo(s, this.tables);
        const f = this.filters;
        const chosen = new Set(s.spells.map((x) => x.uuid));
        const oppose = (school) => book.opposition.some((o) => String(school).toLowerCase().includes(o.toLowerCase()));
        const all = this.content.arcaneSpells(book.maxLevel, book.folder);
        return {
            book: { ...book, requiredText: book.required.join(', '), oppositionText: book.opposition.join(', '), count: s.spells.length },
            levels: Array.from({ length: book.maxLevel }, (_, i) => ({ n: i + 1, selected: String(f.spellLevel) === String(i + 1) })),
            spells: all.filter((x) => chosen.has(x.uuid) || ((!f.spellLevel || x.level === Number(f.spellLevel)) && x.name.toLowerCase().includes(f.spell.toLowerCase())))
                .map((x) => ({ ...x, on: chosen.has(x.uuid), barred: oppose(x.school), locked: oppose(x.school) && !chosen.has(x.uuid), own: book.school && x.school.toLowerCase().includes(book.school.toLowerCase()) })),
            none: !all.length,
            filters: f,
        };
    }

    #ctxEquipment() {
        const s = this.draft;
        if (!s.classes.length) return { needClass: true };
        const f = this.filters;
        const left = (s.gold ?? 0) - R.cartTotal(s);
        const rows = this.content.shop(this.rs).map((r) => ({ ...r, allowed: r.category === 'gear' || r.ammo || R.allowedGear(s, r.category, r.name, r.shield) }));
        this.shopRows = new Map(rows.map((r) => [r.id, r]));
        return {
            formula: R.goldFormula(s), gold: s.gold, rolled: s.gold !== null,
            canRollGold: s.gold === null || game.user.isGM || setting('maxRerolls') === 0, canEdit: game.user.isGM || setting('allowManual'),
            left: Math.round(left * 100) / 100, over: left < 0,
            categories: ['weapon', 'armor', 'gear'].map((id) => ({ id, label: T(`shop.${id}`), selected: f.shopCategory === id })),
            rows: rows.filter((r) => r.category === f.shopCategory && (!f.onlyAllowed || r.allowed) && r.name.toLowerCase().includes(f.shop.toLowerCase())).map((r) => ({ ...r, afford: r.price <= left })),
            cart: s.cart.map((l, i) => ({ ...l, i, total: Math.round(l.price * l.qty * 100) / 100 })),
            weight: Math.round(s.cart.reduce((x, l) => x + l.weight * l.qty, 0) * 10) / 10,
            filters: f,
        };
    }

    #ctxReview(issues) {
        const all = R.STEPS.flatMap((step) => issues[step].map((i) => ({ step, stepLabel: T(`steps.${step}`), level: i.level, text: this.#issueText(i) })));
        const s = this.draft;
        if (!s.classes.length || !s.race) return { issues: all, incomplete: true };
        return {
            issues: all, clean: !all.length, incomplete: false,
            profs: s.weaponProfs.map((p) => p.name + (p.spec ? ` (${T(`spec.${p.spec}`)})` : '')).join(', ') || '—',
            nwps: s.nwp.join(', '), thief: R.thiefSkills(s, this.tables).rows.map((r) => `${r.name} ${r.total}%`).join(', '),
            spells: s.spells.map((x) => x.name).join(', '), cart: s.cart.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join(', ') || '—',
            xp: s.classes.map((c) => `${this.#classLabel(c)}: ${R.xpForLevel(this.rs.classes[c], R.startLevels(s)[c])}${R.xpBonus(s, c) ? ` (${signed(R.xpBonus(s, c))}%)` : ''}`).join(' · '),
            viaGm: !game.user.can('ACTOR_CREATE'),
        };
    }

    // ───────────────────────── Form input ─────────────────────────

    async _onFirstRender(context, options) {
        await super._onFirstRender(context, options);
        this.element.addEventListener('change', (event) => this.#onInput(event));
        this.element.addEventListener('input', foundry.utils.debounce((event) => event.target.dataset.filter && this.#onFilter(event.target), 250));
        this.element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.target.matches('input')) {
                event.preventDefault();
                event.target.blur();
            }
        });
    }

    /** Compendiums may change between sessions. */
    _onClose(options) {
        super._onClose(options);
        this.content = null;
    }

    #onFilter(el) {
        this.filters[el.dataset.filter] = el.type === 'checkbox' ? el.checked : el.value;
        this.render({ parts: ['body'] });
    }

    async #onInput(event) {
        const el = event.target;
        if (el.dataset.filter) {
            if (el.tagName === 'SELECT' || el.type === 'checkbox') this.#onFilter(el);
            return;
        }
        const path = el.dataset.bind;
        if (!path) return;
        const s = this.draft;
        let value = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.type === 'number') value = value === '' ? null : Number(value);

        if (path === 'ruleset') {
            if (value === s.ruleset) return;
            const rerolls = s.abilities.rerolls;
            this.draft = R.switchRuleset(s, value);
            this.draft.abilities.rerolls = rerolls;
        } else if (path === 'abilities.method') {
            this.draft.abilities = { ...R.newState(s.ruleset).abilities, method: value, rerolls: s.abilities.rerolls };
        } else if (path.startsWith('assign.')) {
            const key = path.split('.')[1];
            const old = s.abilities.assign[key];
            for (const [k, v] of Object.entries(s.abilities.assign)) if (value !== null && v === value && k !== key) s.abilities.assign[k] = old ?? null;
            s.abilities.assign[key] = value;
        } else if (path.startsWith('diceTo.')) {
            s.abilities.diceTo[Number(path.split('.')[1])] = value || null;
        } else if (path === 'details.languages') {
            s.details.languages = value.split(',').map((x) => x.trim()).filter(Boolean);
        } else if (path === 'startLevel') {
            s.startLevel = Math.clamp(Math.trunc(value || 1), 1, setting('maxStartLevel'));
        } else {
            foundry.utils.setProperty(s, path, value);
            if (path === 'hpMode') s.hp = {};
        }
        await this.#changed();
    }

    // ───────────────────────── Dice ─────────────────────────

    /** Roll dice with Foundry's Roll so results use the table's randomizer; collected for one chat card. */
    #collector() {
        const rolls = [];
        const dice = async (n, faces) => {
            const roll = await new Roll(`${n}d${faces}`).evaluate();
            rolls.push(roll);
            return roll.dice[0].results.map((r) => r.result);
        };
        return { dice, rolls };
    }

    async #post(title, detail, rolls) {
        if (!setting('postRolls')) return;
        const escape = foundry.utils.escapeHTML;
        const name = this.draft.details.name?.trim() || game.user.name;
        await ChatMessage.create({
            speaker: { alias: name }, rolls: rolls.map((r) => r.toJSON?.() ?? r), sound: CONFIG.sounds.dice,
            content: `<div class="ars-cc-card"><strong>${escape(title)}</strong><p>${detail}</p></div>`,
        });
    }

    async #formula(formula) {
        const roll = await new Roll(formula).evaluate();
        return { total: roll.total, roll };
    }

    static async #onRollAbilities() {
        const a = this.draft.abilities;
        const max = setting('maxRerolls');
        if (max > 0 && a.rerolls >= max) return void ui.notifications.warn(T('noRerolls'));
        const { dice, rolls } = this.#collector();
        const result = await R.rollAbilities(a.method, dice);
        Object.assign(a, { pool: [], sets: [], dice: [], fixed: null, assign: {}, setIndex: null, diceTo: [] }, result);
        a.rerolls += 1;
        this.draft.strPercent = null;
        const text = result.pool ? result.pool.join(', ') : result.dice ? result.dice.join(', ') : result.sets ? result.sets.map((x) => ABILITIES.map((k) => x[k]).join(' ')).join('<br>') : ABILITIES.map((k) => `${T(`abilitiesShort.${k}`)} ${result.fixed[k]}`).join(', ');
        await this.#post(`${T('steps.abilities')} · ${T(`methods.${a.method}`)} (#${a.rerolls})`, text, rolls);
        await this.#changed();
    }

    static #onAutoAssign() {
        const a = this.draft.abilities;
        const order = a.pool.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
        ABILITIES.forEach((k, i) => (a.assign[k] = order[i] ?? null));
        this.#changed();
    }

    static async #onRollPercent() {
        const es = R.exceptionalStrength(this.draft);
        if (!es) return;
        const { total, roll } = await this.#formula('1d100');
        this.draft.strPercent = Math.min(total, es.max);
        await this.#post(T('exceptional'), `18/${String(total).padStart(2, '0')}${total > es.max ? ` → ${es.max}` : ''}`, [roll]);
        await this.#changed();
    }

    static async #onRollHp() {
        const { dice, rolls } = this.#collector();
        this.draft.hp = await R.rollHp(this.draft, this.tables, dice);
        if (rolls.length) await this.#post(T('hp'), Object.entries(this.draft.hp).map(([c, v]) => `${this.#classLabel(c)}: ${v.join(' + ')}`).join('<br>'), rolls);
        await this.#changed();
    }

    static async #onRollGold() {
        const formula = R.goldFormula(this.draft);
        const { total, roll } = await this.#formula(formula);
        this.draft.gold = total;
        await this.#post(T('startingGold'), `${formula} = ${total} ${T('gp')}`, [roll]);
        await this.#changed();
    }

    static async #onRollBuild() {
        const s = this.draft;
        const race = this.rs.races[s.race];
        const years = (await this.#formula(R.ageFormula(s))).total;
        let inches, pounds;
        if (race.build) {
            inches = (await this.#formula(`${race.build.height}+${race.build.heightDice}`)).total;
            pounds = (await this.#formula(`${race.build.weight}+${race.build.weightDice}`)).total;
            const variation = (await this.#formula('1d6')).total;
            const sign = variation === 1 ? -1 : variation === 6 ? 1 : 0;
            if (sign) {
                inches += sign * (await this.#formula('1d4')).total;
                pounds += sign * (await this.#formula('1d20')).total;
            }
        } else {
            const [hb, hd, wb, wd] = (BUILD[s.race] ?? BUILD.human)[s.details.sex === 'female' ? 'female' : 'male'];
            inches = (await this.#formula(`${hb}+${hd}`)).total;
            pounds = (await this.#formula(`${wb}+${wd}`)).total;
        }
        Object.assign(s.details, { age: String(years), height: `${Math.floor(inches / 12)}'${inches % 12}"`, weight: `${pounds} lb` });
        await this.#changed();
    }

    // ───────────────────────── Choices ─────────────────────────

    static #onPickRace(_event, el) {
        if (!R.raceStatus(this.draft, el.dataset.key).ok) return;
        this.draft.race = el.dataset.key;
        this.draft.classes = this.draft.classes.filter((c) => R.classStatus(this.draft, c).ok);
        this.#changed();
    }

    static #onPickClass(_event, el) {
        if (R.classStatus(this.draft, el.dataset.key).ok) this.#setClasses([el.dataset.key]);
    }

    #setClasses(classes) {
        const s = this.draft;
        if (classes.length === s.classes.length && classes.every((c) => s.classes.includes(c))) return;
        // Choices that depend on the class start over; purchases and details stay.
        Object.assign(s, { classes, hp: {}, gold: null, weaponProfs: [], nwp: [], thiefPoints: {}, spells: [] });
        this.#changed();
    }

    static #onToggleProf(_event, el) {
        const list = this.draft.weaponProfs;
        const i = list.findIndex((p) => p.name === el.dataset.name);
        if (i >= 0) list.splice(i, 1);
        else list.push({ name: el.dataset.name, spec: 0 });
        this.#changed();
    }

    static #onCycleSpec(_event, el) {
        const prof = this.draft.weaponProfs.find((p) => p.name === el.dataset.name);
        if (!prof) return;
        prof.spec = ((prof.spec ?? 0) + 1) % (R.maxSpec(this.draft, prof.name) + 1);
        this.#changed();
    }

    static #onToggleNwp(_event, el) {
        const list = this.draft.nwp;
        const name = el.dataset.name;
        if (R.freeNwp(this.draft).includes(name)) return;
        if (list.includes(name)) list.splice(list.indexOf(name), 1);
        else list.push(name);
        this.#changed();
    }

    static #onToggleSpell(_event, el) {
        const list = this.draft.spells;
        const i = list.findIndex((x) => x.uuid === el.dataset.uuid);
        if (i >= 0) list.splice(i, 1);
        else {
            const book = R.spellbookInfo(this.draft, this.tables);
            const spell = this.content.arcaneSpells(book.maxLevel, book.folder).find((x) => x.uuid === el.dataset.uuid);
            if (spell) list.push({ uuid: spell.uuid, name: spell.name, img: spell.img, level: spell.level });
        }
        this.#changed();
    }

    static #onBuy(_event, el) {
        const row = this.shopRows?.get(el.dataset.id);
        if (!row) return;
        const line = this.draft.cart.find((l) => l.id === row.id);
        if (line) line.qty += 1;
        else this.draft.cart.push({ id: row.id, uuid: row.uuid ?? null, builtin: row.builtin ?? null, name: row.name, price: row.price, weight: row.weight, qty: 1 });
        this.#changed();
    }

    static #onQty(_event, el) {
        const line = this.draft.cart[Number(el.dataset.index)];
        if (!line) return;
        line.qty += Number(el.dataset.delta);
        if (line.qty <= 0) this.draft.cart.splice(Number(el.dataset.index), 1);
        this.#changed();
    }

    static async #onRestart() {
        const ok = await DialogV2.confirm({ window: { title: 'ARSCC.restart' }, content: `<p>${T('restartConfirm')}</p>` });
        if (!ok) return;
        const { rerolls } = this.draft.abilities;
        this.draft = R.newState(this.draft.ruleset);
        this.draft.abilities.rerolls = rerolls;
        this.step = 'rules';
        this.#changed();
    }

    static async #onCreate() {
        if (this.busy || R.hasErrors(R.validate(this.draft, this.tables))) return;
        this.busy = true;
        await this.render({ parts: ['footer'] });
        try {
            const payload = await buildActor(this.draft, { content: this.content, tables: this.tables, randomID: foundry.utils.randomID });
            const actor = await createCharacter(payload);
            if (!actor) return;
            if (payload.warnings.length) {
                console.warn(`${MODULE_ID} |`, payload.warnings);
                ui.notifications.warn(T('missingItems', { list: payload.warnings.map((w) => w.value).join(', ') }));
            }
            await game.settings.set(MODULE_ID, 'draft', {});
            this.draft = R.newState(this.draft.ruleset);
            this.step = 'rules';
            await this.close();
            actor.sheet?.render(true);
        } catch (error) {
            console.error(`${MODULE_ID} |`, error);
            ui.notifications.error(T('createFailed', { error: error.message }));
        } finally {
            this.busy = false;
            if (this.rendered) this.render({ parts: ['footer'] });
        }
    }
}
