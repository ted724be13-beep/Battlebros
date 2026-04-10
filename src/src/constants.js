// src/constants.js
export const HEX_SIZE = 36;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;
export const BATTLE_ROWS = 12;
export const BATTLE_COLS = 16;
export const WORLD_ROWS = 18;
export const WORLD_COLS = 24;

export const GAME_STATE = { START: 'START', WORLD: 'WORLD', SETTLEMENT: 'SETTLEMENT', BATTLE: 'BATTLE', INVENTORY: 'INVENTORY' };

export const NOBLE_HOUSES = [
  { id: 'h1', name: '金獅家族', color: '#ca8a04', banner: 'bg-yellow-600' },
  { id: 'h2', name: '紅鷹家族', color: '#dc2626', banner: 'bg-red-600' },
  { id: 'h3', name: '黑熊家族', color: '#374151', banner: 'bg-gray-800' }
];

export const TERRAIN_INFO = {
  grass: { baseCost: 2, elevation: 0, fill: '#5b8c34', stroke: '#3f6323', name: '平原' },
  highland: { baseCost: 2, elevation: 1, fill: '#5c3a21', stroke: '#382212', name: '高地' },
  mountain: { baseCost: 3, elevation: 2, fill: '#9e7b5f', stroke: '#755842', name: '山地' },
  forest: { baseCost: 3, elevation: 0, fill: '#1f3d0c', stroke: '#0a1a00', name: '森林' }
};

export const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const getHexPoints = (cx, cy, size) => Array.from({length: 6}).map((_, i) => `${cx + size * Math.cos((Math.PI/180)*(60*i-30))},${cy + size * Math.sin((Math.PI/180)*(60*i-30))}`).join(' ');
export const hexToPixel = (row, col) => ({ x: HEX_WIDTH * (col + 0.5 * (row & 1)), y: HEX_HEIGHT * (3 / 4) * row });
export const getHexDistance = (r1, c1, r2, c2) => {
  const q1 = c1 - Math.floor(r1 / 2), q2 = c2 - Math.floor(r2 / 2);
  return Math.max(Math.abs(q1 - q2), Math.abs(q1 + r1 - q2 - r2), Math.abs(r1 - r2));
};

export const getNeighbors = (r, c, maxR, maxC) => {
  const isOdd = (r & 1) !== 0;
  const dirs = isOdd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return dirs.map(([dr, dc]) => ({ r: r + dr, c: c + dc })).filter(({r, c}) => r >= 0 && r < maxR && c >= 0 && c < maxC);
};

// 簡化版的資料庫，保留結構
export const HEAD_ARMORS = [ ["Hood", 30, 0, 40], ["Nasal Helmet", 105, -5, 350] ].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'head', armor, armorMax: armor, fat, price }));
export const BODY_ARMORS = [ ["Sackcloth", 10, 0, 20], ["Mail Hauberk", 150, -18, 1000] ].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'body', armor, armorMax: armor, fat, price }));
export const ARMOR_DB = [...HEAD_ARMORS, ...BODY_ARMORS].reduce((acc, cur) => { acc[cur.id] = cur; return acc; }, {});

export const WEAPONS_DB = {
  Knife: { id: 'Knife', name: 'Knife', type: 'melee', price: 25, min: 15, max: 25, armorPen: 0.2, armorEff: 0.5, hsBonus: 0, dur: 32, weight: 0, category: 'dagger', range: 1 },
  ArmingSword: { id: 'ArmingSword', name: 'Arming Sword', type: 'melee', price: 1250, min: 40, max: 45, armorPen: 0.2, armorEff: 0.8, hsBonus: 0, dur: 56, weight: 6, category: '1h_sword', range: 1 },
  ShortBow: { id: 'ShortBow', name: 'Short Bow', type: 'ranged', price: 200, min: 30, max: 50, armorPen: 0.35, armorEff: 0.5, hsBonus: 0, dur: 60, weight: 4, category: 'bow', range: 7 }
};

export const createChar = (id, name, sprite, baseIni, hp, fat, mSkill, rSkill, mDef, rDef, headId, bodyId, wpnId) => {
    const h = headId ? ARMOR_DB[headId] : null; const b = bodyId ? ARMOR_DB[bodyId] : null; const w = wpnId ? WEAPONS_DB[wpnId] : null;
    return {
        id, name, team: 'player', sprite, levelUps: 0, headItem: h, bodyItem: b,
        stats: { baseIni, ap: 9, apMax: 9, fat: 0, fatMax: fat, fatRegen: 15, hp, hpMax: hp, armHead: h ? h.armorMax : 0, armHeadMax: h ? h.armorMax : 0, armBody: b ? b.armorMax : 0, armBodyMax: b ? b.armorMax : 0, exp: 0 },
        combat: { mSkill, mDef, rSkill, rDef, headshot: 25 },
        weapon: w, skills: w?.type === 'ranged' ? ['quickShot'] : (w ? ['slash'] : []), statuses: {}, perks: []
    };
};
