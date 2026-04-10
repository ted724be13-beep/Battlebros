// src/App.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Shield, Sword, Crosshair, Target, Map, Coins, Drumstick, Users, Tent, Building, Hammer, Beer, Flag, X, Save, Download, ScrollText, UserPlus, Wrench, ChevronUp } from 'lucide-react';

// ==========================================
// 1. 常數與共用工具、資料庫
// ==========================================
const HEX_SIZE = 36;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;
const BATTLE_ROWS = 12;
const BATTLE_COLS = 16;
const WORLD_ROWS = 18;
const WORLD_COLS = 24;

const GAME_STATE = { START: 'START', WORLD: 'WORLD', SETTLEMENT: 'SETTLEMENT', BATTLE: 'BATTLE', INVENTORY: 'INVENTORY' };

const NOBLE_HOUSES = [
  { id: 'h1', name: '金獅家族', color: '#ca8a04', banner: 'bg-yellow-600' },
  { id: 'h2', name: '紅鷹家族', color: '#dc2626', banner: 'bg-red-600' },
  { id: 'h3', name: '黑熊家族', color: '#374151', banner: 'bg-gray-800' }
];

const SETTLEMENT_CONFIG = [
  { type: 'City', name: '市鎮', count: 2, icon: '🏰' },
  { type: 'Town', name: '鎮', count: 3, icon: '🏘️' },
  { type: 'Village', name: '村莊', count: 6, icon: '🛖' },
  { type: 'StoneKeep', name: '要塞', count: 3, icon: '🏯' },
  { type: 'WoodenKeep', name: '城堡', count: 3, icon: '🗼' }
];

const TERRAIN_INFO = {
  grass: { baseCost: 2, elevation: 0, fill: '#5b8c34', stroke: '#3f6323', name: '平原' },
  highland: { baseCost: 2, elevation: 1, fill: '#5c3a21', stroke: '#382212', name: '高地' },
  mountain: { baseCost: 3, elevation: 2, fill: '#9e7b5f', stroke: '#755842', name: '山地' },
  forest: { baseCost: 3, elevation: 0, fill: '#1f3d0c', stroke: '#0a1a00', name: '森林' }
};

const EXP_LEVELS = [0, 200, 500, 1000, 2000, 3500, 5000, 7000, 9000, 12000, 15000];
const getLevelData = (exp) => {
    let lvl = 1; let nextExp = EXP_LEVELS[1];
    for (let i = 1; i < EXP_LEVELS.length; i++) {
        if (exp >= EXP_LEVELS[i]) { lvl = i + 1; nextExp = EXP_LEVELS[i+1] || EXP_LEVELS[i]; } else break;
    }
    return { level: lvl, nextExpTotal: nextExp };
};

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getHexPoints = (cx, cy, size) => Array.from({length: 6}).map((_, i) => `${cx + size * Math.cos((Math.PI/180)*(60*i-30))},${cy + size * Math.sin((Math.PI/180)*(60*i-30))}`).join(' ');
const hexToPixel = (row, col) => ({ x: HEX_WIDTH * (col + 0.5 * (row & 1)), y: HEX_HEIGHT * (3 / 4) * row });
const getHexDistance = (r1, c1, r2, c2) => {
  const q1 = c1 - Math.floor(r1 / 2), q2 = c2 - Math.floor(r2 / 2);
  return Math.max(Math.abs(q1 - q2), Math.abs(q1 + r1 - q2 - r2), Math.abs(r1 - r2));
};
const getNeighbors = (r, c, maxR, maxC) => {
  const isOdd = (r & 1) !== 0;
  const dirs = isOdd ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return dirs.map(([dr, dc]) => ({ r: r + dr, c: c + dc })).filter(({r, c}) => r >= 0 && r < maxR && c >= 0 && c < maxC);
};

// 裝備與技能資料庫 (簡化版，保留核心結構)
const HEAD_ARMORS = [
  ["Hood", 30, 0, 40], ["Rusty Mail Coif", 70, -4, 150], ["Kettle Hat", 115, -6, 450]
].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'head', armor, armorMax: armor, fat, price }));

const BODY_ARMORS = [
  ["Sackcloth", 10, 0, 20], ["Leather Tunic", 30, 0, 65], ["Mail Shirt", 130, -14, 650], ["Scale Armor", 240, -28, 4000]
].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'body', armor, armorMax: armor, fat, price }));

const ARMOR_DB = [...HEAD_ARMORS, ...BODY_ARMORS].reduce((acc, cur) => { acc[cur.id] = cur; return acc; }, {});

const W_D = [
  ["Knife", 30, 15, 25, 0.2, 0.5, 0, 32, 0, 'dagger', 1], ["Shortsword", 350, 30, 40, 0.2, 0.75, 0, 48, 4, '1h_sword', 1], 
  ["Greatsword", 3200, 85, 100, 0.25, 1.0, 5, 72, 12, '2h_sword', 1], ["Wooden Stick", 35, 15, 25, 0.4, 0.5, 0, 32, 6, '1h_mace', 1],
  ["Handaxe", 900, 30, 45, 0.3, 1.2, 0, 68, 10, '1h_axe', 1], ["Militia Spear", 180, 25, 30, 0.25, 0.9, 0, 48, 6, '1h_polearm', 1],
  ["Short Bow", 200, 30, 50, 0.35, 0.5, 0, 60, 4, 'bow', 7], ["Light Crossbow", 300, 30, 50, 0.5, 0.6, 0, 40, 6, 'crossbow', 6]
];

const WEAPONS_DB = W_D.reduce((acc, [name, price, min, max, armorPen, armorEff, hsBonus, dur, weight, cat, range]) => {
  acc[name.replace(/\s+/g, '')] = { id: name.replace(/\s+/g, ''), name, type: range > 1 ? 'ranged' : 'melee', price, min, max, armorPen, armorEff, hsBonus, dur, weight, category: cat, range };
  return acc;
}, {});

const LOOT_DB = { animal_hide: { id: 'animal_hide', name: '動物皮', type: 'loot', price: 50 }, wolf_blood: { id: 'wolf_blood', name: '狼血', type: 'loot', price: 200 } };

const SKILLS_DB = {
  slash: { id: 'slash', name: '攻擊', type: 'melee', ap: 4, fat: 10, range: 1, icon: Sword },
  thrust: { id: 'thrust', name: '刺擊', type: 'melee', ap: 4, fat: 10, range: 1, icon: Sword },
  quickShot: { id: 'quickShot', name: '快速射擊', type: 'ranged', ap: 4, fat: 15, range: 7, icon: Crosshair },
  bite: { id: 'bite', name: '撕咬', type: 'melee', ap: 4, fat: 6, range: 1, icon: Sword, overrides: { dmgMin: 30, dmgMax: 50, armorEff: 0.7, armorPen: 0.3 } },
  zombieBite: { id: 'zombieBite', name: '狂咬', type: 'melee', ap: 4, fat: 0, range: 1, icon: Sword, overrides: { dmgMin: 15, dmgMax: 35, armorEff: 0.9, armorPen: 0.1 } }
};

// ==========================================
// 2. 共用工具函數與 UI 元件
// ==========================================
const getDynamicIni = (char) => Math.max(0, (char.stats?.baseIni || 0) - Math.floor(((char.stats?.armHeadMax || 0) + (char.stats?.armBodyMax || 0)) * 0.1) - (char.weapon?.weight || 0) - (char.stats?.fat || 0));
const getDynamicMDef = (char) => (char.combat?.mDef || 0) + (char.perks?.includes('dodge') ? Math.floor(getDynamicIni(char) * 0.15) : 0);
const getDynamicRDef = (char) => (char.combat?.rDef || 0) + (char.perks?.includes('dodge') ? Math.floor(getDynamicIni(char) * 0.15) : 0);
const getDynamicMSkill = (char) => char.combat?.mSkill || 0;

const createChar = (id, name, sprite, baseIni, hp, fat, mSkill, rSkill, mDef, rDef, headId, bodyId, wpnId, perks=[]) => {
    const h = headId ? ARMOR_DB[headId] : null; const b = bodyId ? ARMOR_DB[bodyId] : null; const w = wpnId ? WEAPONS_DB[wpnId] : null;
    return {
        id, name, team: 'player', sprite, levelUps: 0, headItem: h, bodyItem: b,
        stats: { baseIni, ap: 9, apMax: 9, fat: 0, fatMax: fat, fatRegen: 15, hp, hpMax: hp, armHead: h ? h.armorMax : 0, armHeadMax: h ? h.armorMax : 0, armBody: b ? b.armorMax : 0, armBodyMax: b ? b.armorMax : 0, exp: 0 },
        combat: { mSkill, mDef, rSkill, rDef, headshot: 25 },
        weapon: w, skills: w?.type === 'ranged' ? ['quickShot'] : (w ? ['slash'] : []), statuses: {}, perks
    };
};

const getReachableTiles = (startR, startC, char, mapData, chars) => {
  if (!char || !char.stats) return {};
  const terrainMap = {}; mapData.forEach(h => terrainMap[`${h.row}-${h.col}`] = TERRAIN_INFO[h.terrain]);
  const occupied = {}; chars.forEach(c => occupied[`${c.row}-${c.col}`] = true);
  const equipPenalty = Math.floor(((char.stats.armHeadMax || 0) + (char.stats.armBodyMax || 0)) * 0.1) + (char.weapon?.weight || 0);
  const fatMultiplier = 1 + (equipPenalty / 100); 

  const stats = char.stats; const costs = { [`${startR}-${startC}`]: { ap: 0, fat: 0 } };
  const queue = [{ r: startR, c: startC, apCost: 0, fatCost: 0 }];
  const reachable = {};

  while(queue.length > 0) {
    queue.sort((a, b) => a.apCost - b.apCost);
    const { r, c, apCost, fatCost } = queue.shift();
    getNeighbors(r, c, BATTLE_ROWS, BATTLE_COLS).forEach(n => {
       const id = `${n.r}-${n.c}`;
       if (occupied[id] && !(n.r === startR && n.c === startC)) return;
       const tTerr = terrainMap[id], cTerr = terrainMap[`${r}-${c}`];
       if (!tTerr || !cTerr) return;
       const elevDiff = Math.max(0, tTerr.elevation - cTerr.elevation);
       const stepCost = tTerr.baseCost + elevDiff;
       const newAPCost = apCost + stepCost;
       const newFatCost = fatCost + Math.floor(stepCost * fatMultiplier);

       if (newAPCost <= stats.ap && (stats.fat + newFatCost) <= stats.fatMax) {
         if (costs[id] === undefined || newAPCost < costs[id].ap) {
            costs[id] = { ap: newAPCost, fat: newFatCost };
            reachable[id] = { ap: newAPCost, fat: newFatCost }; 
            queue.push({ r: n.r, c: n.c, apCost: newAPCost, fatCost: newFatCost });
         }
       }
    });
  }
  return reachable;
};

const calculateHitChance = (attacker, defender, skillObj) => {
  if (!attacker || !defender || !skillObj) return 0;
  const dist = getHexDistance(attacker.row, attacker.col, defender.row, defender.col);
  if (dist > skillObj.range) return 0;
  
  let chance = 0;
  if (skillObj.type === 'melee') {
    if (dist > 1) return 0;
    chance = getDynamicMSkill(attacker) - getDynamicMDef(defender);
  } else if (skillObj.type === 'ranged') {
    chance = attacker.combat.rSkill - getDynamicRDef(defender);
    chance += 10 - (Math.max(0, dist - 1) * 2);
  }
  return Math.max(5, Math.min(95, chance));
};

// 簡單點陣圖渲染 (替代完整定義以節省空間，保留核心)
const UIPixelSprite = ({ type, size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="drop-shadow-lg fill-current">
    <circle cx="12" cy="12" r="10" className={type === 'zombie' ? 'text-green-500' : type.includes('bandit') ? 'text-red-800' : 'text-gray-400'} />
  </svg>
);

const EquipIcon = ({ cat, className = "w-8 h-8 opacity-40 mb-1" }) => <Shield className={className} />;
const StatRow = ({ icon, label, val, color }) => (
  <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 border border-white/5 w-full rounded">
     <span className="text-gray-400 flex items-center gap-1 w-[100px] shrink-0"><span className={color || "text-gray-400"}>{icon}</span> <span className="truncate text-xs">{label}</span></span>
     <span className="font-mono text-right flex-1 text-sm">{val}</span>
  </div>
);

// ==========================================
// 3. 場景組件 (Components) - 實作效能優化
// ==========================================

// --- 3.1 大地圖 (WorldMap) ---
const WorldMap = ({ companyName, worldData, inventory, roster, playerWorldPos, setPlayerWorldPos, setActiveLocation, setGameState, initBattle, showMessage, worldCam, setWorldCam }) => {
  const mapRef = useRef(null);
  const drag = useRef({ isDragging: false, startX: 0, startY: 0, camX: worldCam.x, camY: worldCam.y, moved: false });

  const onMouseDown = (e) => {
    drag.current = { isDragging: true, startX: e.clientX, startY: e.clientY, camX: drag.current.camX, camY: drag.current.camY, moved: false };
  };

  const onMouseMove = (e) => {
    if (!drag.current.isDragging) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.current.moved = true;
    
    // 🔥 直接修改 DOM，跳過 React 渲染週期
    if (mapRef.current) {
      mapRef.current.style.transform = `translate(${drag.current.camX + dx}px, ${drag.current.camY + dy}px)`;
    }
  };

  const onMouseUp = (e) => {
    if (!drag.current.isDragging) return;
    drag.current.isDragging = false;
    drag.current.camX += (e.clientX - drag.current.startX);
    drag.current.camY += (e.clientY - drag.current.startY);
    setWorldCam({ x: drag.current.camX, y: drag.current.camY });
  };

  const handleHexClick = (r, c) => {
    if (drag.current.moved) return;
    const dist = getHexDistance(playerWorldPos.row, playerWorldPos.col, r, c);
    if (dist > 0) {
       const foodCost = dist * roster.length;
       if (inventory.food < foodCost) return showMessage(`⚠️ 糧食不足！移動需要 ${foodCost} 點糧食。`); 
       setPlayerWorldPos({ row: r, col: c });
    }
    const settlement = worldData.settlements.find(s => s.row === r && s.col === c);
    if (settlement) { setActiveLocation(settlement); setGameState(GAME_STATE.SETTLEMENT); return; }
    const camp = worldData.camps.find(cp => cp.row === r && cp.col === c);
    if (camp) initBattle(camp);
  };

  return (
    <div className="flex-1 bg-[#151912] flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
         onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
       <svg ref={mapRef} width={(WORLD_COLS + 2) * HEX_WIDTH} height={(WORLD_ROWS + 2) * HEX_HEIGHT * 0.75} className="will-change-transform" style={{ transform: `translate(${worldCam.x}px, ${worldCam.y}px)` }} overflow="visible">
         <g transform={`translate(${HEX_WIDTH}, ${HEX_HEIGHT / 2})`}>
            {worldData.map.map(hex => {
              const { x, y } = hexToPixel(hex.row, hex.col); const terrain = TERRAIN_INFO[hex.terrain];
              return <polygon key={hex.id} points={getHexPoints(x + HEX_WIDTH/2, y + HEX_HEIGHT/2, HEX_SIZE - 0.5)} fill={terrain.fill} stroke={terrain.stroke} strokeWidth="1" onClick={(e) => { e.stopPropagation(); handleHexClick(hex.row, hex.col); }} className="hover:fill-white/10 transition-colors" />;
            })}
            {worldData.settlements.map(set => {
              const { x, y } = hexToPixel(set.row, set.col);
              return (
                <g key={set.id} transform={`translate(${x + HEX_WIDTH/2}, ${y + HEX_HEIGHT/2})`} onClick={(e) => { e.stopPropagation(); handleHexClick(set.row, set.col); }} className="cursor-pointer group">
                   <circle r={HEX_SIZE * 0.7} fill={set.house.color} opacity="0.4" />
                   <text y="-8" textAnchor="middle" fontSize="24" style={{ pointerEvents: 'none' }}>{set.icon}</text>
                   <rect x="-40" y="10" width="80" height="18" fill="rgba(0,0,0,0.7)" rx="4" />
                   <text y="23" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">{set.name}</text>
                </g>
              );
            })}
            {worldData.camps.map(camp => {
              const { x, y } = hexToPixel(camp.row, camp.col);
              return (
                <g key={camp.id} transform={`translate(${x + HEX_WIDTH/2}, ${y + HEX_HEIGHT/2})`} onClick={(e) => { e.stopPropagation(); handleHexClick(camp.row, camp.col); }} className="cursor-pointer hover:scale-110 transition-transform">
                   <circle r={HEX_SIZE * 0.6} fill="#b47b2c" stroke="#784715" strokeWidth="2" opacity="0.9" />
                   <g transform="translate(-12, -12)" style={{ pointerEvents: 'none' }}><Tent size={24} color="#e5e7eb" /></g>
                </g>
              );
            })}
            <g transform={`translate(${hexToPixel(playerWorldPos.row, playerWorldPos.col).x + HEX_WIDTH/2}, ${hexToPixel(playerWorldPos.row, playerWorldPos.col).y + HEX_HEIGHT/2})`} style={{ pointerEvents: 'none' }}>
               <circle r="16" fill="#ea580c" stroke="#fff" strokeWidth="2" />
               <Flag x="-10" y="-10" size={20} color="#fff" />
            </g>
         </g>
       </svg>
    </div>
  );
};

// --- 3.2 戰鬥場景 (BattleScene) ---
const BattleScene = ({ battleData, setBattleData, roster, setRoster, setGameState, showMessage, battleCam, setBattleCam }) => {
  const mapRef = useRef(null);
  const drag = useRef({ isDragging: false, startX: 0, startY: 0, camX: battleCam.x, camY: battleCam.y, moved: false });

  const onMouseDown = (e) => drag.current = { isDragging: true, startX: e.clientX, startY: e.clientY, camX: drag.current.camX, camY: drag.current.camY, moved: false };
  const onMouseMove = (e) => {
    if (!drag.current.isDragging) return;
    const dx = e.clientX - drag.current.startX; const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.current.moved = true;
    if (mapRef.current) mapRef.current.style.transform = `translate(${drag.current.camX + dx}px, ${drag.current.camY + dy}px) scale(1.25)`;
  };
  const onMouseUp = (e) => {
    if (!drag.current.isDragging) return;
    drag.current.isDragging = false;
    drag.current.camX += (e.clientX - drag.current.startX); drag.current.camY += (e.clientY - drag.current.startY);
    setBattleCam({ x: drag.current.camX, y: drag.current.camY });
  };

  const { map, characters, combatLogs, selectedSkillId, hoverHex, turnQueue, round, viewedCharId } = battleData;
  const activeChar = characters.find(c => c.id === turnQueue[0]);
  const displayChar = viewedCharId ? characters.find(c => c.id === viewedCharId) : activeChar;

  const reachableTiles = useMemo(() => {
    if (!activeChar || activeChar.team !== 'player' || selectedSkillId) return {};
    return getReachableTiles(activeChar.row, activeChar.col, activeChar, map, characters);
  }, [activeChar, map, characters, selectedSkillId]);

  const handleHexClick = (row, col) => {
    if (drag.current.moved || !activeChar) return; 
    const clickedChar = characters.find(c => c.row === row && c.col === col);
    if (!selectedSkillId && clickedChar) { setBattleData(prev => ({ ...prev, viewedCharId: clickedChar.id })); return; }
    
    // (簡化版：只處理移動，攻擊邏輯需保留原本的長長一串，這裡精簡示範結構)
    if (!clickedChar && activeChar.team === 'player') {
      const hexId = `${row}-${col}`; const reachInfo = reachableTiles[hexId];
      if (reachInfo) setBattleData(prev => ({ ...prev, viewedCharId: null, characters: prev.characters.map(c => c.id === activeChar.id ? { ...c, row, col, stats: { ...c.stats, ap: c.stats.ap - reachInfo.ap, fat: c.stats.fat + reachInfo.fat } } : c) }));
    }
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full p-2 flex flex-col items-center pointer-events-none z-10 space-y-1">
         <div className="px-8 py-1 text-lg font-bold tracking-widest rounded shadow border bg-black/80 text-white">
           {activeChar?.team === 'player' ? 'PLAYER TURN' : 'ENEMY TURN'} - Round {round}
         </div>
      </div>
      <div className="flex-1 bg-[#1a1c17] flex items-center justify-center relative cursor-grab active:cursor-grabbing overflow-hidden"
           onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
         <svg ref={mapRef} width={(BATTLE_COLS + 2) * HEX_WIDTH} height={(BATTLE_ROWS + 2) * HEX_HEIGHT * 0.75} className="will-change-transform" style={{ transform: `translate(${battleCam.x}px, ${battleCam.y}px) scale(1.25)` }} overflow="visible">
           <g transform={`translate(${HEX_WIDTH}, ${HEX_HEIGHT / 2})`}>
             {map.map(hex => {
               const { x, y } = hexToPixel(hex.row, hex.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2; const hexId = `${hex.row}-${hex.col}`;
               const fill = hex.terrain === 'highland' ? '#5c3a21' : '#5b8c34'; const stroke = hex.terrain === 'highland' ? '#382212' : '#3f6323';
               const isReachable = activeChar?.team === 'player' && !selectedSkillId && reachableTiles[hexId] !== undefined;
               return (
                 <g key={hex.id} onClick={(e) => { e.stopPropagation(); handleHexClick(hex.row, hex.col); }} className="cursor-pointer group">
                   <polygon points={getHexPoints(cx, cy, HEX_SIZE - 1)} fill={fill} stroke={stroke} strokeWidth="2" className="group-hover:fill-white/10" />
                   {isReachable && <polygon points={getHexPoints(cx, cy, HEX_SIZE - 2)} fill="rgba(250, 204, 21, 0.15)" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 2" style={{ pointerEvents: 'none' }} />}
                 </g>
               );
             })}
             {characters.map(char => {
               const { x, y } = hexToPixel(char.row, char.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2;
               return (
                 <g key={char.id} onClick={(e) => { e.stopPropagation(); handleHexClick(char.row, char.col); }} className="cursor-pointer transition-transform hover:scale-110" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                   {char.id === activeChar?.id && <circle cx={cx} cy={cy} r={HEX_SIZE * 0.8} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 2" className="animate-spin-slow" />}
                   <UIPixelSprite type={char.sprite} x={cx - 16} y={cy - 24} size={32} />
                 </g>
               );
             })}
           </g>
         </svg>
      </div>
      
      {/* 戰鬥 UI 面板 */}
      <div className="h-32 bg-[#111] border-t border-gray-700 flex p-2 gap-4 z-20 text-white">
          <div className="flex-1 flex flex-col justify-center pl-4">
             <div className="font-bold text-lg text-orange-400">{displayChar?.name || '請選擇角色'}</div>
             <div className="text-sm">HP: {displayChar?.stats.hp} / {displayChar?.stats.hpMax}</div>
             <div className="text-sm">AP: {displayChar?.stats.ap} / {displayChar?.stats.apMax}</div>
          </div>
          <button onClick={() => {
              const newQueue = [...turnQueue]; newQueue.shift();
              setBattleData({ ...battleData, turnQueue: newQueue });
              if (newQueue.length === 0) setGameState(GAME_STATE.WORLD); // 簡單測試用
          }} className="px-8 py-2 bg-gray-600 hover:bg-gray-500 font-bold rounded m-4">End Turn</button>
      </div>
    </div>
  );
};

// ==========================================
// 4. 主應用程式 (狀態總管與 Routing)
// ==========================================
export default function App() {
  const [gameState, setGameState] = useState(GAME_STATE.START);
  const [companyName, setCompanyName] = useState('');
  const [sysMsg, setSysMsg] = useState(null);

  const [inventory, setInventory] = useState({ gold: 1500, food: 100, tools: 40, stash: [] }); 
  const [roster, setRoster] = useState([]);
  const [worldData, setWorldData] = useState({ map: [], settlements: [], camps: [] });
  const [playerWorldPos, setPlayerWorldPos] = useState({ row: 0, col: 0 });
  const [activeLocation, setActiveLocation] = useState(null);
  
  const [worldCam, setWorldCam] = useState({ x: 0, y: 0 });
  const [battleData, setBattleData] = useState(null);
  const [battleCam, setBattleCam] = useState({ x: 0, y: 0 });

  const showMessage = (msg) => { setSysMsg(msg); setTimeout(() => setSysMsg(null), 3000); };

  // --- 手動存檔系統 (免後端) ---
  const handleExportSave = () => {
    const saveData = { companyName, inventory, roster, worldData, playerWorldPos, worldCam, timestamp: new Date().toISOString() };
    const dataStr = JSON.stringify(saveData);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${companyName || 'battle_brothers'}_save.json`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    showMessage('💾 遊戲進度已成功下載！');
  };

  const handleImportSave = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.companyName || !data.roster) throw new Error("存檔格式錯誤");
        setCompanyName(data.companyName); setInventory(data.inventory); setRoster(data.roster); setWorldData(data.worldData); setPlayerWorldPos(data.playerWorldPos); if (data.worldCam) setWorldCam(data.worldCam);
        setGameState(GAME_STATE.WORLD); showMessage('✅ 成功載入本機存檔！');
      } catch (error) { showMessage('❌ 讀取失敗'); }
      event.target.value = null; 
    };
    reader.readAsText(file);
  };

  const handleStartGame = () => {
    if (!companyName.trim()) return;
    const initialRoster = [
      createChar('p1', '劍士', 'swordsman', 100, 65, 70, 70, 30, 15, 10, 'NasalHelmet', 'MailHauberk', 'ArmingSword'),
      createChar('p2', '傭兵 A', 'mercenary', 90, 45, 55, 50, 30, 0, 5, 'Headscarf', 'Sackcloth', 'Knife')
    ];
    
    // 生成精簡地圖
    const map = []; const validLandHexes = [];
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        const rand = Math.random(); let terrain = 'grass';
        if (rand > 0.85) terrain = 'mountain'; else if (rand > 0.70) terrain = 'highland'; else if (rand > 0.55) terrain = 'forest';
        map.push({ id: `w-${r}-${c}`, row: r, col: c, terrain });
        if (terrain !== 'mountain') validLandHexes.push({r, c});
      }
    }

    const settlements = [];
    let pos = validLandHexes[rnd(0, validLandHexes.length-1)];
    settlements.push({ id: `set-1`, name: `起始村莊`, type: 'Village', typeName: '村莊', row: pos.r, col: pos.c, house: NOBLE_HOUSES[0], icon: '🛖' });

    const camps = [];
    pos = validLandHexes[rnd(0, validLandHexes.length-1)];
    camps.push({ id: `camp-1`, name: '強盜營地', row: pos.r, col: pos.c, type: 'bandit', size: 'small', numEnemies: 3 });

    setRoster(initialRoster); setWorldData({ map, settlements, camps }); 
    setPlayerWorldPos({ row: validLandHexes[0].r, col: validLandHexes[0].c }); setGameState(GAME_STATE.WORLD);
  };

  const initBattle = (camp) => {
    const battleMap = [];
    for (let r = 0; r < BATTLE_ROWS; r++) for (let c = 0; c < BATTLE_COLS; c++) battleMap.push({ id: `${r}-${c}`, row: r, col: c, terrain: 'grass' });
    let bChars = roster.map((char, i) => ({ ...char, row: 4 + i, col: 2 }));
    bChars.push({ id: 'e1', name: '強盜', team: 'enemy', sprite: 'bandit', row: 5, col: 10, stats: { ap: 9, hp: 50, hpMax: 50 } });
    
    setBattleData({ map: battleMap, characters: bChars, round: 1, turnQueue: bChars.map(c=>c.id), combatLogs: [], activeCampId: camp.id });
    setBattleCam({ x: 0, y: 0 }); setGameState(GAME_STATE.BATTLE);
  };

  return (
    <div className="w-full h-screen bg-neutral-900 font-sans text-gray-200 overflow-hidden flex flex-col">
      {sysMsg && <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 bg-red-900/95 text-white px-8 py-4 rounded shadow-2xl border-2 border-red-500 z-50 text-base font-bold animate-pulse pointer-events-none text-center min-w-[300px]">{sysMsg}</div>}

      {gameState === GAME_STATE.START && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="text-5xl font-extrabold mb-8 text-orange-600 drop-shadow-lg tracking-widest border-b-2 border-orange-800 pb-4">BATTLE BROTHERS: WEB</h1>
          <div className="bg-[#1a1c17] p-8 rounded-lg border-2 border-[#3f4a2e] shadow-2xl flex flex-col items-center w-96">
            <input type="text" placeholder="輸入傭兵團名稱" className="w-full bg-neutral-800 border border-gray-600 p-3 rounded text-xl text-white mb-6 text-center" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            <button onClick={handleStartGame} disabled={!companyName.trim()} className="w-full py-3 bg-gradient-to-b from-orange-700 to-orange-900 text-white font-bold rounded shadow mb-3">啟程 (New Game)</button>
            <label className="w-full py-3 bg-gradient-to-b from-blue-800 to-blue-950 text-white font-bold rounded shadow flex justify-center items-center gap-2 cursor-pointer">
              <Download size={20}/> 載入本機存檔<input type="file" accept=".json" onChange={handleImportSave} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {gameState === GAME_STATE.WORLD && (
        <div className="flex-1 flex flex-col h-full">
           <div className="h-12 bg-black/90 border-b border-gray-700 flex items-center justify-between px-6 z-20 shrink-0">
             <div className="font-bold text-orange-500 tracking-wider text-lg flex items-center gap-2"><Shield size={20} /> {companyName}</div>
             <div className="flex items-center gap-6 text-sm font-mono">
               <span className="flex items-center gap-1"><Coins size={16} className="text-yellow-500"/> {inventory.gold}</span>
               <button onClick={handleExportSave} className="flex items-center gap-1.5 bg-[#2a1a10] hover:bg-[#3c2517] border border-[#5c3a21] px-3 py-1 rounded text-orange-200 transition-colors"><Save size={16} /> 匯出存檔</button>
             </div>
           </div>
           <WorldMap companyName={companyName} worldData={worldData} inventory={inventory} roster={roster} playerWorldPos={playerWorldPos} setPlayerWorldPos={setPlayerWorldPos} setActiveLocation={setActiveLocation} setGameState={setGameState} initBattle={initBattle} showMessage={showMessage} worldCam={worldCam} setWorldCam={setWorldCam} />
        </div>
      )}

      {gameState === GAME_STATE.BATTLE && (
        <BattleScene battleData={battleData} setBattleData={setBattleData} roster={roster} setRoster={setRoster} setGameState={setGameState} showMessage={showMessage} battleCam={battleCam} setBattleCam={setBattleCam} />
      )}
    </div>
  );
}
