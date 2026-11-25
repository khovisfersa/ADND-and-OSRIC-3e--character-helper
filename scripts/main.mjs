export const MODULE_ID = 'ars-character-creator';
const QUERY = `${MODULE_ID}.create`;
let app = null;

export const setting = (key) => game.settings.get(MODULE_ID, key);

Hooks.once('init', () => {
    const world = (key, type, initial, extra = {}) =>
        game.settings.register(MODULE_ID, key, { name: `ARSCC.settings.${key}.name`, hint: `ARSCC.settings.${key}.hint`, scope: 'world', config: true, type, default: initial, ...extra });
    world('allowPlayers', Boolean, true, { requiresReload: true });
    world('lockRuleset', Boolean, false);
    world('allowManual', Boolean, true);
    world('allowIgnoreLimits', Boolean, false);
    world('maxRerolls', Number, 0, { range: { min: 0, max: 20, step: 1 } });
    world('maxStartLevel', Number, 10, { range: { min: 1, max: 20, step: 1 } });
    world('postRolls', Boolean, true);
    world('sourcePacks', String, '');
    game.settings.register(MODULE_ID, 'draft', { scope: 'client', config: false, type: Object, default: {} });

    CONFIG.queries[QUERY] = onCreateQuery;
});

Hooks.once('ready', () => {
    game.modules.get(MODULE_ID).api = { open: openCreator };
});

async function openCreator() {
    if (!game.user.isGM && !setting('allowPlayers')) return void ui.notifications.warn(game.i18n.localize('ARSCC.playersDisabled'));
    const { CharacterCreator } = await import('./app/creator-app.mjs');
    app ??= new CharacterCreator();
    return app.render({ force: true });
}

Hooks.on('renderActorDirectory', (_directory, html) => {
    if (!game.user.isGM && !setting('allowPlayers')) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const header = root.querySelector('.header-actions');
    if (!header || root.querySelector('.ars-cc-open')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ars-cc-open';
    button.innerHTML = '<i class="fa-solid fa-scroll" inert></i> <span></span>';
    button.querySelector('span').textContent = game.i18n.localize('ARSCC.open');
    button.addEventListener('click', openCreator);
    header.append(button);
});

/** Create directly when allowed; otherwise ask the active GM, who confirms. */
export async function createCharacter({ actor, post }) {
    let created;
    if (game.user.can('ACTOR_CREATE')) created = await writeActor(actor, post, game.user.id);
    else {
        if (!game.users.activeGM) throw new Error(game.i18n.localize('ARSCC.noGm'));
        ui.notifications.info(game.i18n.localize('ARSCC.waitingGm'));
        const uuid = await game.users.activeGM.query(QUERY, { actor, post, userId: game.user.id }, { timeout: 5 * 60 * 1000 });
        if (!uuid) {
            ui.notifications.warn(game.i18n.localize('ARSCC.gmDeclined'));
            return null;
        }
        created = await fromUuid(uuid);
    }
    if (created && !game.user.isGM && !game.user.character) await game.user.update({ character: created.id });
    return created;
}

async function writeActor(actor, post, ownerId) {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    if (!game.users.get(ownerId)?.isGM) ownership[ownerId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const doc = await Actor.create({ ...actor, ownership });
    if (!doc) return null;
    // Containers with contents go through ARS, which expands and links what is inside them.
    if (post?.length) await doc.createEmbeddedDocuments('Item', post, { keepId: true, hideChanges: true, skipCombine: true });
    // ARS recalculates hp.max from the class items; a new character starts unhurt.
    const { max, value } = doc.system.attributes.hp;
    if (max > 0 && value !== max) await doc.update({ 'system.attributes.hp.value': max });
    return doc;
}

/** Runs on the GM's client when a player without ACTOR_CREATE finishes the wizard. */
async function onCreateQuery({ actor, post, userId }) {
    const user = game.users.get(userId);
    if (!game.user.isGM || !user || actor?.type !== 'character' || !setting('allowPlayers')) return null;
    const escape = foundry.utils.escapeHTML;
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'ARSCC.title' },
        content: `<p>${game.i18n.format('ARSCC.gmConfirm', { user: escape(user.name), name: escape(String(actor.name)) })}</p>`,
        rejectClose: false,
    });
    if (!ok) return null;
    const { name, type, items, system, flags } = actor;
    const doc = await writeActor({ name, type, items, system, flags: { [MODULE_ID]: flags?.[MODULE_ID] ?? {} } }, post, userId);
    return doc?.uuid ?? null;
}
