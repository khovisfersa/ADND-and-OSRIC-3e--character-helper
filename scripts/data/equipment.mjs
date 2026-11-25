/** Built-in price lists: used for 1e/2e weapons and armor, and for OSRIC when no compendium is available. */
const DAMAGE = { s: 'slashing', p: 'piercing', b: 'bludgeoning' };
const SIZE = { S: 'small', M: 'medium', L: 'large' };
const lines = (rows) => rows.trim().split('\n').map((l) => l.trim().split('|'));

// name | gp | lb | type | dmg S-M | dmg L | speed | mode | range | rate | size
const weapons = (rows) => lines(rows).map(([name, cost, weight, type, normal, large, speed, mode, range, rate, size]) => {
    const [short, medium, long] = (range || '').split('/');
    return {
        kind: 'weapon', name, cost: Number(cost), weight: Number(weight), damageType: DAMAGE[type], normal, large, speed: Number(speed),
        mode: mode || 'melee', range: short ? { short, medium, long } : null, perRound: rate || '1/1', size: SIZE[size] || 'medium',
    };
});
const armors = (rows) => lines(rows).map(([name, cost, weight, ac, type, bulk]) => ({
    kind: 'armor', name, cost: Number(cost), weight: Number(weight), ac: Number(ac), type: type || 'armor', bulk: bulk || 'none',
}));
const gear = (rows) => lines(rows).map(([name, cost, weight, kind, quantity]) => ({
    kind: kind || 'item', name, cost: Number(cost), weight: Number(weight), quantity: Number(quantity || 1),
}));

export const WEAPONS_1E = weapons(`
Axe, Battle|5|7.5|s|1d8|1d8|7|melee
Axe, Hand|1|5|s|1d6|1d4|4|melee
Axe, Hand (thrown)|1|5|s|1d6|1d4|4|thrown|10/20/30
Club|0.02|3|b|1d6|1d3|4|melee
Dagger|2|1|p|1d4|1d3|2|melee|||S
Dagger (thrown)|2|1|p|1d4|1d3|2|thrown|10/20/30|2/1|S
Dart|0.5|0.5|p|1d3|1d2|2|thrown|15/30/45|3/1|S
Flail, Footman's|3|15|b|1d6+1|2d4|7|melee
Flail, Horseman's|8|3.5|b|1d4+1|1d4+1|6|melee
Halberd|9|17.5|s|1d10|2d6|9|melee|||L
Hammer, War|1|5|b|1d4+1|1d4|4|melee
Javelin|0.5|2|p|1d6|1d6|0|thrown|20/40/60
Lance, Heavy|6|15|p|2d4+1|3d6|7|melee|||L
Mace, Footman's|8|10|b|1d6+1|1d6|7|melee
Mace, Horseman's|4|5|b|1d6|1d4|6|melee
Morning Star|5|12.5|b|2d4|1d6+1|7|melee
Pick, Footman's|8|6|p|1d6+1|2d4|7|melee
Quarterstaff|0|5|b|1d6|1d6|4|melee|||L
Scimitar|15|4|s|1d8|1d8|4|melee
Spear|1|5|p|1d6|1d8|7|melee
Spear (thrown)|1|5|p|1d6|1d8|7|thrown|10/20/30
Sword, Bastard|25|10|s|2d4|2d8|6|melee
Sword, Broad|10|7.5|s|2d4|1d6+1|5|melee
Sword, Long|15|6|s|1d8|1d12|5|melee
Sword, Short|8|3.5|p|1d6|1d8|3|melee|||S
Sword, Two-Handed|30|25|s|1d10|3d6|10|melee|||L
Trident|4|5|p|1d6+1|3d4|7|melee
Bow, Long|60|10|p|1d6|1d6|0|ranged|70/140/210|2/1|L
Bow, Short|15|5|p|1d6|1d6|0|ranged|50/100/150|2/1
Bow, Composite Long|100|8|p|1d6|1d6|0|ranged|60/120/210|2/1|L
Bow, Composite Short|75|5|p|1d6|1d6|0|ranged|50/100/180|2/1
Crossbow, Heavy|20|8|p|1d4+1|1d6+1|0|ranged|80/160/240|1/2
Crossbow, Light|12|5|p|1d4|1d4|0|ranged|60/120/180|1/1
Sling|0.75|0.5|b|1d4+1|1d6+1|0|ranged|50/100/200|1/1|S
`);

export const WEAPONS_2E = weapons(`
Axe, Battle|5|7|s|1d8|1d8|7|melee
Axe, Hand|1|5|s|1d6|1d4|4|melee
Axe, Hand (thrown)|1|5|s|1d6|1d4|4|thrown|10/20/30
Club|0|3|b|1d6|1d3|4|melee
Dagger|2|1|p|1d4|1d3|2|melee|||S
Dagger (thrown)|2|1|p|1d4|1d3|2|thrown|10/20/30|2/1|S
Dart|0.5|0.5|p|1d3|1d2|2|thrown|10/20/40|3/1|S
Flail, Footman's|15|15|b|1d6+1|2d4|7|melee
Flail, Horseman's|8|5|b|1d4+1|1d4+1|6|melee
Glaive|6|8|s|1d6|1d10|8|melee|||L
Halberd|10|15|s|1d10|2d6|9|melee|||L
Javelin|0.5|2|p|1d6|1d6|4|thrown|20/40/60
Knife|0.5|0.5|p|1d3|1d2|2|melee|||S
Lance, Heavy|15|15|p|1d8+1|3d6|8|melee|||L
Lance, Light|6|5|p|1d6|1d8|6|melee|||L
Mace, Footman's|8|10|b|1d6+1|1d6|7|melee
Mace, Horseman's|5|6|b|1d6|1d4|6|melee
Morning Star|10|12|b|2d4|1d6+1|7|melee
Pick, Footman's|8|6|p|1d6+1|2d4|7|melee
Pick, Horseman's|7|4|p|1d4+1|1d4|5|melee
Quarterstaff|0|4|b|1d6|1d6|4|melee|||L
Scimitar|15|4|s|1d8|1d8|5|melee
Sickle|0.6|3|s|1d4+1|1d4|4|melee|||S
Spear|0.8|5|p|1d6|1d8|6|melee
Spear (thrown)|0.8|5|p|1d6|1d8|6|thrown|10/20/30
Sword, Bastard|25|10|s|1d8|1d12|6|melee
Sword, Broad|10|4|s|2d4|1d6+1|5|melee
Sword, Long|15|4|s|1d8|1d12|5|melee
Sword, Short|10|3|p|1d6|1d8|3|melee|||S
Sword, Two-Handed|50|15|s|1d10|3d6|10|melee|||L
Trident|15|5|p|1d6+1|3d4|7|melee|||L
Warhammer|2|6|b|1d4+1|1d4|4|melee
Bow, Long|75|3|p|1d6|1d6|8|ranged|70/140/210|2/1|L
Bow, Short|30|2|p|1d6|1d6|7|ranged|50/100/150|2/1
Bow, Composite Long|100|3|p|1d6|1d6|7|ranged|60/120/210|2/1|L
Bow, Composite Short|75|2|p|1d6|1d6|6|ranged|50/100/180|2/1
Crossbow, Hand|300|3|p|1d3|1d2|5|ranged|20/40/60|1/1|S
Crossbow, Heavy|50|14|p|1d4+1|1d6+1|10|ranged|80/160/240|1/2
Crossbow, Light|35|7|p|1d4|1d4|7|ranged|60/120/180|1/1
Sling|0.05|0|b|1d4+1|1d6+1|6|ranged|50/100/200|1/1|S
`);

// name | gp | lb | AC (or shield bonus) | type | bulk
export const ARMOR_1E = armors(`
Padded Armor|4|10|8|armor|fairly
Leather Armor|5|15|8
Studded Leather Armor|15|20|7|armor|fairly
Ring Mail|30|25|7|armor|fairly
Scale Mail|45|40|6|armor|fairly
Chain Mail|75|30|5|armor|fairly
Splint Mail|80|40|4|armor|bulky
Banded Mail|90|35|4|armor|bulky
Plate Mail|400|45|3|armor|bulky
Shield, Large|15|10|1|shield
Shield, Small|10|5|1|shield
Shield, Small Wooden|1|3|1|shield
`);
export const ARMOR_2E = armors(`
Padded Armor|4|10|8
Leather Armor|5|15|8
Studded Leather Armor|20|25|7
Ring Mail|100|30|7
Brigandine|120|35|6
Hide Armor|15|30|6
Scale Mail|120|40|6
Chain Mail|75|40|5
Splint Mail|80|40|4
Banded Mail|200|35|4
Bronze Plate Mail|400|45|4
Plate Mail|600|50|3
Field Plate|2000|60|2
Full Plate|4000|70|1
Buckler|1|3|1|shield
Shield, Small|3|5|1|shield
Shield, Medium|7|10|1|shield
Shield, Body|10|15|1|shield
`);

// name | gp | lb each | kind | quantity
export const GEAR = gear(`
Backpack|2|2|container
Bedroll|0.5|5
Belt Pouch|1|0.5|container
Candle|0.01|0.1
Crowbar|0.5|5
Flint and Steel|0.5|0.1
Grappling Hook|0.8|4
Holy Symbol|25|1
Iron Spikes (12)|1|5
Lantern, Hooded|7|2
Mirror, Small|10|0.5
Oil Flask|0.06|1
Parchment Sheet|1|0
Rations, 1 week|10|10
Rope, Hemp (50 ft)|1|20
Rope, Silk (50 ft)|10|8
Sack, Large|0.2|0.5|container
Spellbook (blank)|50|5|container
Thieves' Tools|30|1
Torch|0.01|1
Waterskin|0.8|1
Arrow|0.3|0.1|ammo|12
Bolt|1|0.1|ammo|12
Sling Bullet|0.12|0.5|ammo|12
`);
/** Damage of the ammunition rows above. */
export const AMMO = {
    Arrow: { normal: '1d6', large: '1d6', type: 'piercing' },
    Bolt: { normal: '1d4', large: '1d4', type: 'piercing' },
    'Sling Bullet': { normal: '1d4+1', large: '1d6+1', type: 'bludgeoning' },
};

/**
 * Where the OSRIC compendium (2.2) and the OSRIC 3.0 tables disagree:
 * name | price | currency | lb | speed | S-M | L | range increment | also usable in melee
 */
const OSRIC3 = new Map(lines(`
Blanket (Woollen)|2|sp
Gown (Woolen)|5|sp
Lamp (Bronze)|1|sp
Sack (Small)|10|cp
Tunic (Woollen)|3|sp
Firewood|||3
Pole Arm|6|gp||13
Sword (Bastard)||||6|2d4|2d8
Sword (Scimitar)||||5
Sword (Two-Handed)||||10
Mace (Heavy)||||7
Warhammer (Heavy)||||7
Thrown Light Warhammer||||6||||y
Thrown Javelin|||2|8||||y
Thrown Spear||||7|||15|y
Thrown Dagger||||||||y
Thrown Dagger (Silver)||||||||y
Thrown Hand Axe||||||||y
Thrown Club||||||||y
Composite Bow (Long)|||8
Composite Bow (Short)|||5
Crossbow (Heavy)|||||||80
`).map(([name, cost, currency, weight, speed, normal, large, range, melee]) => [name, { cost, currency, weight, speed, normal, large, range, melee }]));

/** Price of a compendium item under OSRIC 3.0: {value, currency}. */
export const osricCost = (name, cost) => {
    const fix = OSRIC3.get(name);
    return fix?.cost ? { value: Number(fix.cost), currency: fix.currency } : cost;
};

/** Bring a compendium item's numbers in line with OSRIC 3.0 (mutates the item data). */
export function applyOsricPrices(data) {
    const fix = OSRIC3.get(data.name);
    if (!fix) return data;
    const s = data.system;
    if (fix.cost) s.cost = { ...s.cost, ...osricCost(data.name, s.cost) };
    if (fix.weight) s.weight = Number(fix.weight);
    if (fix.speed && s.attack) s.attack.speed = Number(fix.speed);
    if (fix.normal && s.damage) Object.assign(s.damage, { normal: fix.normal, large: fix.large });
    if (fix.range && s.attack) s.attack.range = { short: fix.range, medium: String(fix.range * 2), long: String(fix.range * 3) };
    if (fix.melee && s.attack) s.attack.modes = { melee: { enabled: true }, thrown: { enabled: true }, ranged: { enabled: false } };
    return data;
}
