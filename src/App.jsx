import React, { useState, useMemo, useEffect } from 'react';
import { Shield, Sword, Crosshair, Target, Map, Coins, Drumstick, Users, Tent, Building, ArrowRight, Hammer, Beer, PlusCircle, Flag, X, Save, Download, ScrollText, UserPlus, Wrench, ChevronUp } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Firebase 初始化
let app, auth, db, appId;
try {
  const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
} catch (e) {
  console.error('Firebase init error', e);
}

// ==========================================
// 1. 常數與共用工具設定
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
    let lvl = 1;
    let nextExp = EXP_LEVELS[1];
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

// ==========================================
// 2. 裝備、戰利品與技能資料庫
// ==========================================
const HEAD_ARMORS = [
  ["Mouthpiece", 10, 0, 15], ["Headscarf", 20, 0, 30], ["Hood", 30, 0, 40], ["Straw Hat", 30, 0, 60], ["Nomad Head Wrap", 30, 0, 40],
  ["Leather Headband", 30, 0, 30], ["Cultist Hood", 30, 0, 20], ["Dark Cowl", 40, 0, 100], ["Aketon Cap", 40, -1, 70], ["Leather Head Wrap", 40, -2, 60],
  ["Full Leather Cap", 45, -3, 80], ["Bear Headpiece", 50, -3, 100], ["Rusty Mail Coif", 70, -4, 150], ["Mail Coif", 80, -4, 200], ["Closed Mail Coif", 90, -4, 250],
  ["Reinforced Mail Coif", 100, -5, 300], ["Nasal Helmet", 105, -5, 350], ["Kettle Hat", 115, -6, 450], ["Flat Top Helmet", 125, -7, 500]
].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'head', armor, armorMax: armor, fat, price }));

const BODY_ARMORS = [
  ["Sackcloth", 10, 0, 20], ["Linen Tunic", 20, 0, 45], ["Leather Wraps", 20, 0, 40], ["Leather Tunic", 30, 0, 65], ["Thick Furs", 30, -1, 40],
  ["Padded Surcoat", 50, -4, 90], ["Gambeson", 65, -6, 150], ["Padded Leather", 80, -8, 200], ["Patched Mail Shirt", 90, -10, 250],
  ["Leather Lamellar Armor", 95, -10, 300], ["Basic Mail Shirt", 115, -12, 450], ["Mail Shirt", 130, -14, 650], ["Mail Hauberk", 150, -18, 1000],
  ["Scale Armor", 240, -28, 4000], ["Coat of Scales", 300, -38, 6000]
].map(([name, armor, fat, price]) => ({ id: name.replace(/\s+/g, ''), name, type: 'body', armor, armorMax: armor, fat, price }));

const ARMOR_DB = [...HEAD_ARMORS, ...BODY_ARMORS].reduce((acc, cur) => { acc[cur.id] = cur; return acc; }, {});

const W_D = [
  ["Knife", 30, 15, 25, 0.2, 0.5, 0, 32, 0, 'dagger', 1], ["Dagger", 180, 15, 35, 0.2, 0.6, 0, 40, 0, 'dagger', 1], ["Notched Blade", 350, 20, 30, 0.2, 0.6, 0, 44, 3, 'dagger', 1], ["Rondel Dagger", 400, 20, 40, 0.2, 0.7, 0, 50, 0, 'dagger', 1], ["Qatal Dagger", 1000, 30, 45, 0.2, 0.7, 0, 60, 0, 'dagger', 1],
  ["Broken Ancient Sword", 200, 30, 35, 0.2, 0.75, 0, 24, 3, '1h_sword', 1], ["Shortsword", 350, 30, 40, 0.2, 0.75, 0, 48, 4, '1h_sword', 1], ["Saif", 350, 35, 40, 0.2, 0.65, 0, 48, 4, '1h_sword', 1], ["Falchion", 500, 35, 45, 0.2, 0.7, 0, 48, 6, '1h_sword', 1], ["Cruel Falchion", 900, 35, 45, 0.2, 0.7, 0, 52, 4, '1h_sword', 1], ["Ancient Sword", 850, 38, 43, 0.2, 0.8, 0, 42, 6, '1h_sword', 1], ["Scimitar", 1000, 40, 45, 0.2, 0.7, 0, 48, 6, '1h_sword', 1], ["Arming Sword", 1250, 40, 45, 0.2, 0.8, 0, 56, 6, '1h_sword', 1], ["Shamshir", 2900, 45, 50, 0.2, 0.75, 0, 72, 8, '1h_sword', 1], ["Noble Sword", 3200, 45, 50, 0.2, 0.85, 0, 72, 8, '1h_sword', 1], ["Fencing Sword", 1550, 35, 50, 0.2, 0.75, 0, 48, 4, '1h_sword', 1],
  ["Rhomphaia", 1300, 45, 65, 0.2, 1.05, 5, 42, 10, '2h_sword', 1], ["Warbrand", 1600, 50, 75, 0.2, 0.75, 5, 64, 10, '2h_sword', 1], ["Longsword", 1700, 65, 85, 0.25, 1.0, 5, 60, 10, '2h_sword', 1], ["Greatsword", 3200, 85, 100, 0.25, 1.0, 5, 72, 12, '2h_sword', 1],
  ["Wooden Stick", 35, 15, 25, 0.4, 0.5, 0, 32, 6, '1h_mace', 1], ["Claw Club", 100, 20, 30, 0.5, 0.75, 0, 76, 10, '1h_mace', 1], ["Bludgeon", 90, 20, 35, 0.4, 0.75, 0, 64, 8, '1h_mace', 1], ["Nomad Mace", 100, 25, 35, 0.4, 0.9, 0, 64, 8, '1h_mace', 1], ["Light Southern Mace", 400, 30, 40, 0.4, 1.1, 0, 72, 10, '1h_mace', 1], ["Morning Star", 650, 30, 45, 0.4, 1.0, 0, 72, 10, '1h_mace', 1], ["Heavy Southern Mace", 2000, 35, 50, 0.4, 1.2, 0, 80, 10, '1h_mace', 1], ["Winged Mace", 2000, 35, 55, 0.4, 1.1, 0, 80, 10, '1h_mace', 1], ["Gnarly Staff", 1000, 25, 35, 0.4, 0.7, 0, 56, 4, '1h_mace', 1], ["Pickaxe", 150, 20, 35, 0.5, 1.0, 0, 48, 10, '1h_mace', 1],
  ["Two-Handed Spiked Mace", 900, 50, 70, 0.6, 1.15, 0, 72, 14, '2h_mace', 1], ["Two-Handed Mace", 1100, 50, 75, 0.5, 1.15, 0, 80, 14, '2h_mace', 1], ["Two-Handed Flanged Mace", 1900, 75, 95, 0.5, 1.25, 0, 120, 16, '2h_mace', 1], ["Polemace", 1400, 60, 75, 0.4, 1.2, 5, 64, 14, '2h_mace', 1], ["Goedendag", 600, 45, 75, 0.25, 1.1, 0, 64, 14, '2h_mace', 1],
  ["Hatchet", 210, 25, 40, 0.3, 1.1, 0, 52, 6, '1h_axe', 1], ["Handaxe", 900, 30, 45, 0.3, 1.2, 0, 68, 10, '1h_axe', 1], ["Fighting Axe", 2800, 35, 55, 0.3, 1.3, 0, 80, 12, '1h_axe', 1], ["Crude Axe", 800, 30, 40, 0.4, 1.2, 0, 82, 12, '1h_axe', 1], ["Axehammer", 800, 20, 30, 0.6, 2.0, 0, 96, 10, '1h_axe', 1],
  ["Woodcutter's Axe", 400, 35, 70, 0.4, 1.25, 0, 48, 14, '2h_axe', 1], ["Heavy Rusty Axe", 2000, 75, 90, 0.5, 1.5, 0, 96, 16, '2h_axe', 1], ["Bardiche", 2200, 75, 95, 0.4, 1.3, 0, 64, 16, '2h_axe', 1], ["Greataxe", 2400, 80, 100, 0.4, 1.5, 0, 80, 16, '2h_axe', 1], ["Man Splitter", 1500, 90, 120, 0.4, 1.6, 0, 64, 34, '2h_axe', 1], ["Longaxe", 1200, 70, 95, 0.3, 1.1, 5, 72, 14, '2h_axe', 1],
  ["Militia Spear", 180, 25, 30, 0.25, 0.9, 0, 48, 6, '1h_polearm', 1], ["Ancient Spear", 150, 20, 35, 0.25, 1.0, 0, 36, 6, '1h_polearm', 1], ["Goblin Skewer", 300, 25, 35, 0.25, 0.7, 0, 36, 3, '1h_polearm', 1], ["Boar Spear", 750, 30, 35, 0.25, 0.95, 0, 64, 8, '1h_polearm', 1], ["Fire Lance", 750, 30, 35, 0.25, 1.1, 0, 48, 12, '1h_polearm', 1], ["Fighting Spear", 2250, 35, 40, 0.25, 1.0, 0, 72, 10, '1h_polearm', 1],
  ["Pitchfork", 150, 30, 50, 0.3, 0.75, 5, 40, 14, '2h_polearm', 1], ["Broken Ancient Bladed Pike", 350, 35, 55, 0.3, 0.8, 5, 26, 12, '2h_polearm', 1], ["Hooked Blade", 700, 40, 70, 0.3, 1.1, 5, 55, 12, '2h_polearm', 1], ["Jagged Pike", 800, 50, 70, 0.25, 0.9, 5, 40, 8, '2h_polearm', 1], ["Battle Standard", 1500, 50, 70, 0.3, 1.0, 0, 64, 15, '2h_polearm', 1], ["Ancient Bladed Pike", 600, 55, 80, 0.3, 1.25, 5, 30, 14, '2h_polearm', 1], ["Warscythe", 700, 55, 80, 0.3, 1.05, 0, 36, 16, '2h_polearm', 1], ["Pike", 900, 60, 80, 0.3, 1.0, 5, 64, 14, '2h_polearm', 1], ["Swordlance", 1300, 60, 80, 0.3, 0.9, 0, 52, 14, '2h_polearm', 1], ["Billhook", 1400, 55, 85, 0.3, 1.4, 5, 72, 14, '2h_polearm', 1],
  ["Wonky Bow", 100, 30, 50, 0.35, 0.5, 0, 48, 6, 'bow', 7], ["Boondock Bow", 250, 25, 40, 0.35, 0.55, 0, 52, 3, 'bow', 6], ["Short Bow", 200, 30, 50, 0.35, 0.5, 0, 60, 4, 'bow', 7], ["Reinforced Boondock Bow", 500, 30, 50, 0.35, 0.6, 0, 62, 4, 'bow', 7], ["Composite Bow", 400, 40, 55, 0.35, 0.7, 0, 80, 6, 'bow', 6], ["Hunting Bow", 600, 40, 60, 0.35, 0.55, 0, 80, 6, 'bow', 7], ["War Bow", 2900, 50, 70, 0.35, 0.6, 0, 100, 6, 'bow', 7], ["Masterwork Bow", 3500, 50, 75, 0.35, 0.65, 0, 110, 6, 'bow', 7],
  ["Light Crossbow", 300, 30, 50, 0.5, 0.6, 0, 40, 6, 'crossbow', 6], ["Crossbow", 750, 40, 60, 0.5, 0.7, 0, 48, 8, 'crossbow', 6], ["Heavy Crossbow", 3200, 50, 70, 0.5, 0.75, 0, 64, 12, 'crossbow', 6], ["Spiked Impaler", 2000, 50, 70, 0.5, 0.75, 0, 72, 10, 'crossbow', 6]
];

const WEAPONS_DB = W_D.reduce((acc, [name, price, min, max, armorPen, armorEff, hsBonus, dur, weight, cat, range]) => {
  acc[name.replace(/\s+/g, '')] = { id: name.replace(/\s+/g, ''), name, type: range > 1 ? 'ranged' : 'melee', price, min, max, armorPen, armorEff, hsBonus, dur, weight, category: cat, range };
  return acc;
}, {});

const LOOT_DB = {
  animal_hide: { id: 'animal_hide', name: '動物皮', type: 'loot', price: 50 },
  wolf_blood: { id: 'wolf_blood', name: '狼血', type: 'loot', price: 200 },
  slime: { id: 'slime', name: '黏液', type: 'loot', price: 60 },
  silk: { id: 'silk', name: '絲線', type: 'loot', price: 30 }
};

const SKILLS_DB = {
  slash: { id: 'slash', name: '攻擊', type: 'melee', ap: 4, fat: 10, range: 1, icon: Sword },
  thrust: { id: 'thrust', name: '刺擊', type: 'melee', ap: 4, fat: 10, range: 1, icon: Sword },
  quickShot: { id: 'quickShot', name: '快速射擊', type: 'ranged', ap: 4, fat: 15, range: 7, icon: Crosshair },
  aimedShot: { id: 'aimedShot', name: '瞄準射擊', type: 'ranged', ap: 7, fat: 25, range: 7, icon: Target },
  wolfBite: { id: 'wolfBite', name: '狼咬', type: 'melee', ap: 0, fat: 10, range: 1, icon: Sword, oncePerTurn: true, overrides: { dmgMin: 20, dmgMax: 40, armorEff: 0.4, armorPen: 0.15 } },
  bite: { id: 'bite', name: '撕咬', type: 'melee', ap: 4, fat: 6, range: 1, icon: Sword, overrides: { dmgMin: 30, dmgMax: 50, armorEff: 0.7, armorPen: 0.3 } },
  snakeBite: { id: 'snakeBite', name: '蛇咬', type: 'melee', ap: 5, fat: 5, range: 1, icon: Sword, overrides: { dmgMin: 50, dmgMax: 70, armorEff: 0.7, armorPen: 0.3 } },
  spiderBite: { id: 'spiderBite', name: '蛛咬', type: 'melee', ap: 6, fat: 10, range: 1, icon: Sword, overrides: { dmgMin: 20, dmgMax: 40, armorEff: 0.7, armorPen: 0.3 } },
  web: { id: 'web', name: '蛛網', type: 'ranged', ap: 6, fat: 25, range: 3, icon: Target, isStatus: true, hitChance: 50 },
  zombieBite: { id: 'zombieBite', name: '狂咬', type: 'melee', ap: 4, fat: 0, range: 1, icon: Sword, overrides: { dmgMin: 15, dmgMax: 35, armorEff: 0.9, armorPen: 0.1 } },
  darkCurse: { id: 'darkCurse', name: '黑咒', type: 'ranged', ap: 3, fat: 10, range: 5, icon: Target, isStatus: true, hitChance: 100 },
  raiseDead: { id: 'raiseDead', name: '穢土轉身', type: 'ranged', ap: 3, fat: 10, range: 5, icon: Target, isStatus: true, hitChance: 100 }
};

const EquipIcon = ({ cat, className = "w-8 h-8 opacity-40 mb-1" }) => {
  switch(cat) {
     case 'head': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3a7 7 0 00-7 7v6a2 2 0 002 2h10a2 2 0 002-2v-6a7 7 0 00-7-7z"/><path d="M9 13h6"/></svg>;
     case 'body': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 4l-4 4v4l4-2v10h10V10l4 2V8l-4-4H7z"/></svg>;
     case 'dagger': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3l-2 10h4L12 3zM10 15h4v2h-4zM11 18h2v4h-2z"/></svg>;
     case '1h_sword': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l-1 12h2L12 2zM9 15h6v2H9zM11 18h2v4h-2z"/></svg>;
     case '2h_sword': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1l-1.5 14h3L12 1zM8 16h8v2H8zM11 19h2v4h-2z"/></svg>;
     case '1h_mace': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="6" r="3"/><path d="M11 9h2v13h-2z"/></svg>;
     case '2h_mace': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3h6v6H9zM11 9h2v13h-2z"/></svg>;
     case '1h_axe': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4h2v18h-2zM13 5c3 0 5 2 5 4s-2 4-5 4V5z"/></svg>;
     case '2h_axe': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 2h2v20h-2zM13 4c4 0 6 2 6 5s-2 5-6 5V4zM11 4c-4 0-6 2-6 5s2 5 6 5V4z"/></svg>;
     case '1h_polearm': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l-2 5h4L12 2zM11 7h2v15h-2z"/></svg>;
     case '2h_polearm': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l-3 7h6L12 2zM11 9h2v13h-2zM9 7c1 1 2 2 2 2v-2H9z"/></svg>;
     case 'bow': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3c6 4 6 14 0 18M8 3v18M6 12h4"/></svg>;
     case 'crossbow': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M6 6c2-2 10-2 12 0M8 10h8M12 6v6"/></svg>;
     case 'shield': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
     case 'accessory': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
     case 'loot': return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>;
     default: return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/></svg>;
  }
};

// ==========================================
// 3. 核心戰鬥公式與尋路
// ==========================================
const getDynamicIni = (char) => {
  if (!char || !char.stats) return 0;
  const equipPenalty = Math.floor(((char.stats.armHeadMax || 0) + (char.stats.armBodyMax || 0)) * 0.1) + (char.weapon?.weight || 0);
  let ini = (char.stats.baseIni || 0) - equipPenalty - (char.stats.fat || 0);
  if (char.statuses?.poison > 0) ini -= 10;
  if (char.statuses?.webbed > 0) ini = Math.floor(ini * 0.5);
  if (char.statuses?.cursed > 0) ini += 50;
  return Math.max(0, ini);
};
const getDynamicMDef = (char) => {
  if (!char || !char.combat) return 0;
  let def = char.combat.mDef || 0;
  if (char.perks?.includes('dodge')) def += Math.floor(getDynamicIni(char) * 0.15);
  if (char.statuses?.webbed > 0) def = Math.floor(def * 0.5);
  if (char.statuses?.cursed > 0) def += 5;
  return def > 50 ? 50 + Math.floor((def - 50) / 2) : def; 
};
const getDynamicRDef = (char) => {
  if (!char || !char.combat) return 0;
  let def = char.combat.rDef || 0;
  if (char.perks?.includes('dodge')) def += Math.floor(getDynamicIni(char) * 0.15);
  if (char.statuses?.webbed > 0) def = Math.floor(def * 0.5);
  if (char.statuses?.cursed > 0) def += 10;
  return def > 50 ? 50 + Math.floor((def - 50) / 2) : def; 
};
const getDynamicMSkill = (char) => {
  if (!char || !char.combat) return 0;
  let skill = char.combat.mSkill || 0;
  if (char.statuses?.cursed > 0) skill += 15;
  return skill;
};

const getReachableTiles = (startR, startC, char, mapData, chars) => {
  if (!char || !char.stats) return {};
  const terrainMap = {};
  mapData.forEach(hex => terrainMap[`${hex.row}-${hex.col}`] = TERRAIN_INFO[hex.terrain]);
  const occupied = {}; chars.forEach(c => occupied[`${c.row}-${c.col}`] = true);

  const equipPenalty = Math.floor(((char.stats.armHeadMax || 0) + (char.stats.armBodyMax || 0)) * 0.1) + (char.weapon?.weight || 0);
  const fatMultiplier = 1 + (equipPenalty / 100); 

  const stats = char.stats;
  const costs = { [`${startR}-${startC}`]: { ap: 0, fat: 0 } };
  const queue = [{ r: startR, c: startC, apCost: 0, fatCost: 0 }];
  const reachable = {};

  while(queue.length > 0) {
    queue.sort((a, b) => a.apCost - b.apCost);
    const { r, c, apCost, fatCost } = queue.shift();
    getNeighbors(r, c, BATTLE_ROWS, BATTLE_COLS).forEach(n => {
       const id = `${n.r}-${n.c}`;
       if (occupied[id] && !(n.r === startR && n.c === startC)) return;
       const targetTerrain = terrainMap[id], currentTerrain = terrainMap[`${r}-${c}`];
       if (!targetTerrain || !currentTerrain) return;
       const elevDiff = Math.max(0, targetTerrain.elevation - currentTerrain.elevation);
       const stepCost = targetTerrain.baseCost + elevDiff;
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
  if (skillObj.isStatus) return skillObj.hitChance || 100;
  
  let chance = 0;
  if (skillObj.type === 'melee') {
    if (dist > 1) return 0;
    chance = getDynamicMSkill(attacker) - getDynamicMDef(defender);
  } else if (skillObj.type === 'ranged') {
    chance = attacker.combat.rSkill - getDynamicRDef(defender);
    const distPenaltyCount = Math.max(0, dist - 1);
    chance += (skillObj.id === 'quickShot' ? -(distPenaltyCount * 4) : 10 - (distPenaltyCount * 2));
  }
  return Math.max(5, Math.min(95, chance));
};

// ==========================================
// 4. 點陣圖與屬性生成
// ==========================================
const spritePalettes = {
  swordsman: { 'S': '#94a3b8', 'D': '#475569', 'E': '#0f172a', 'F': '#ffedd5', 'A': '#64748b', 'C': '#1e293b', 'R': '#b91c1c' },
  mercenary: { 'S': '#a1a1aa', 'D': '#52525b', 'E': '#0f172a', 'F': '#ffedd5', 'A': '#78716c', 'C': '#292524', 'R': '#ca8a04' },
  goblin: { 'G': '#166534', 'D': '#14532d', 'E': '#ef4444', 'F': '#064e3b', 'L': '#b45309', 'B': '#78350f', 'W': '#d97706', 'S': '#cbd5e1' },
  goblinSpear: { 'G': '#166534', 'D': '#14532d', 'E': '#ef4444', 'F': '#064e3b', 'L': '#b45309', 'B': '#78350f', 'P': '#713f12', 'I': '#e2e8f0' },
  bandit: { 'S': '#b45309', 'D': '#78350f', 'E': '#000000', 'F': '#fca5a5', 'A': '#451a03', 'B': '#27272a', 'W': '#ca8a04' },
  direwolf: { 'W': '#3f3f46', 'D': '#27272a', 'E': '#ef4444' },
  serpent: { 'S': '#15803d', 'G': '#166534', 'E': '#ef4444' },
  spider: { 'X': '#09090b', 'R': '#dc2626' },
  zombie: { 'Z': '#86efac', 'P': '#4c1d95', 'E': '#000' },
  fallenHero: { 'F': '#9a3412', 'S': '#71717a', 'E': '#000' },
  necromancer: { 'N': '#171717', 'M': '#52525b', 'E': '#dc2626' }
};

const spriteData = {
  swordsman: ["    RRRR    ", "   RRRRRR   ", "   SSSSSS   ", "  SDDSSDDS  ", "  S EEFEE S ", "  S FFFFF S ", "   FFFFFF   ", "  AACCCCAA  ", " AAAACCAAAA ", " A AAACCA A ", " AA AAAAA A ", "  A AAAAA A "],
  mercenary: ["            ", "    SSSS    ", "   SDDDDS   ", "  S EEFEE S ", "  S FFFFF S ", "   FFFFFF   ", "   FFFFFF   ", "  AABBBBAA  ", " AAAABBAAAA ", " A AAABBA A ", " AA AAAAA A ", "  A AAAAA A "],
  goblin: ["            ", "    GGGG    ", "   GDGGDG   ", " GGGGEGGEGGG", " G GGGGGG G ", "   GGFGFG   ", "   GGGGGG   ", "  LLBBBBLL  ", "  LLLLLLLL  ", " W LLLLLL   ", " WSLLLLLL   ", " W LLLLLL   "],
  goblinSpear: ["  I         ", "  P  GGGG   ", "  P GDGGDG  ", " PGGGGEGGEGG", " P G GGGGGG ", " P   GGFGFG ", " P   GGGGGG ", " P  LLBBBBLL", " P  LLLLLLLL", " P   LLLLLL ", " P   LLLLLL ", " P   LLLLLL "],
  banditMelee: ["            ", "    SSSS    ", "   SDDDDS   ", "  S EEFEE S ", "  S FFFFF S ", "   FFFFFF   ", "   FFFFFF   ", "  AABBBBAA  ", " AAAABBAAAA ", " A AAABBA A ", " AA AAAAA A ", "  A AAAAA A "],
  banditRanged: ["            ", "    SSSS    ", "   SDDDDS   ", "  S EEFEE S ", "  S FFFFF S ", "   FFFFFF   ", "   FFFFFF   ", "  AABBBBAA  ", " AAAABBAAAA ", " W AAABBA   ", " W  AAAAA   ", " W  AAAAA   "],
  direwolf: ["            ", "            ", "   WWWWWW   ", "  W W  W W  ", "  WWEDDEWW  ", " WWWWWWWWWW ", " WWWWWWWWWW ", "  WWWWWWWW  ", "  W W  W W  ", "  W W  W W  ", "            ", "            "],
  serpent: ["            ", "            ", "    SSSS    ", "   SEGGES   ", "   SSSSSS   ", "    SSSS    ", "   SSSSSS   ", "  SS    SS  ", "  S      S  ", "  S      S  ", "   SS  SS   ", "            "],
  spider: ["            ", "  X      X  ", "   X    X   ", "  X X  X X  ", " X XXXXXX X ", "   XERREX   ", "  XXXXXXXX  ", "  X X  X X  ", " X  X  X  X ", " X  X  X  X ", "            ", "            "],
  zombie: ["            ", "    ZZZZ    ", "   ZPPPPZ   ", "  Z EEFEE Z ", "  Z PPPPP Z ", "   ZZZZZZ   ", "   PZZZZP   ", "  PPZZZZPP  ", " PPPPZZPPPP ", " P PZZZZP P ", " PP PPPP PP ", "  P PPPP P  "],
  fallenHero: ["            ", "    SSSS    ", "   SDDDDS   ", "  S EEFEE S ", "  S FFFFF S ", "   FFFFFF   ", "   FFFFFF   ", "  FFFFFFFF  ", " FFFFFFFFFF ", " F FFFFFF F ", " FF FFFF FF ", "  F FFFF F  "],
  necromancer: ["            ", "    NNNN    ", "   NMMMMN   ", "  N EENEE N ", "  N NNNNN N ", "   NNNNNN   ", "   NNNNNN   ", "  NNNNNNNN  ", " NNNNNNNNNN ", " N NNNNNN N ", " NN NNNN NN ", "  N NNNN N  "]
};

const MapPixelSprite = ({ type, x, y, size }) => {
  const data = spriteData[type] || spriteData['mercenary'];
  const palette = spritePalettes[type.replace('Melee', '').replace('Ranged', '')] || spritePalettes['mercenary'];
  const pixelW = size / data[0].length;
  return (
    <g transform={`translate(${x}, ${y})`}>
      {data.map((row, r) => row.split('').map((char, c) => char === ' ' ? null : <rect key={`${r}-${c}`} x={c * pixelW} y={r * pixelW} width={pixelW + 0.5} height={pixelW + 0.5} fill={palette[char]} />))}
    </g>
  );
};
const UIPixelSprite = ({ type, size = 48 }) => <svg width={size} height={size} viewBox="0 0 12 12" className="drop-shadow-lg"><MapPixelSprite type={type} x={0} y={0} size={12} /></svg>;

const createChar = (id, name, sprite, baseIni, hp, fat, mSkill, rSkill, mDef, rDef, headId, bodyId, wpnId, perks=[]) => {
    const h = headId ? ARMOR_DB[headId] : null;
    const b = bodyId ? ARMOR_DB[bodyId] : null;
    const w = wpnId ? WEAPONS_DB[wpnId] : null;
    return {
        id, name, team: 'player', sprite, levelUps: 0, headItem: h, bodyItem: b,
        stats: { baseIni, ap: 9, apMax: 9, fat: 0, fatMax: fat, fatRegen: 15, hp, hpMax: hp, armHead: h ? h.armorMax : 0, armHeadMax: h ? h.armorMax : 0, armBody: b ? b.armorMax : 0, armBodyMax: b ? b.armorMax : 0, exp: 0 },
        combat: { mSkill, mDef, rSkill, rDef, headshot: 25 },
        weapon: w, skills: w?.type === 'ranged' ? ['quickShot'] : (w ? ['slash'] : []), statuses: {}, perks
    };
};

const getArmor = (list, minPrice, maxPrice) => {
    const valid = list.filter(a => a.price >= minPrice && a.price <= maxPrice);
    return valid.length > 0 ? valid[rnd(0, valid.length - 1)] : list[0];
};

const generateEnemy = (faction, size, beastType, id, r, c, isSummoned=false) => {
  const isLarge = size === 'large';
  let role = ''; let rand = Math.random();
  
  if (faction === 'bandit') {
      if (isLarge && rand < 0.15) role = 'leader'; else if (rand < 0.35) role = 'ranged'; else if (rand < 0.65) role = 'raider'; else role = 'thug';
  } else if (faction === 'undead') {
      if (isLarge && rand < 0.1) role = 'necromancer'; else if (isLarge && rand < 0.3) role = 'fallen_hero'; else if (rand < 0.6) role = 'armed_zombie'; else role = 'zombie';
  } else if (faction === 'goblin') {
      if (isLarge && rand < 0.15) role = 'overseer'; else if (isLarge && rand < 0.35) role = 'wolfrider'; else if (rand < 0.6) role = 'ambusher'; else role = 'skirmisher';
  } else {
      role = beastType || 'direwolf';
  }

  let e = { id, team: 'enemy', row: r, col: c, statuses: {}, turnUsedSkills: [], beastType: faction === 'beast' ? role : null };

  if (faction === 'beast') {
      e.sprite = role; e.perks = ['dodge'];
      if (role === 'direwolf') {
          e.name = '恐狼'; e.stats = { baseIni: 150, ap: 12, apMax: 12, fat: 0, fatMax: 180, fatRegen: 20, hp: 130, hpMax: 130, expValue: 200, armHeadMax: 30, armBodyMax: 30 };
          e.combat = { mSkill: 60, rSkill: 0, mDef: 10, rDef: 10, headshot: 25 }; e.skills = ['bite'];
      } else if (role === 'serpent') {
          e.name = '毒蛇'; e.stats = { baseIni: 50, ap: 9, apMax: 9, fat: 0, fatMax: 110, fatRegen: 15, hp: 130, hpMax: 130, expValue: 175, armHeadMax: 40, armBodyMax: 40 };
          e.combat = { mSkill: 65, rSkill: 0, mDef: rnd(10,15), rDef: 25, headshot: 25 }; e.skills = ['snakeBite']; e.perks.push('poisonWeapons');
      } else if (role === 'spider') {
          e.name = '蜘蛛'; e.stats = { baseIni: 50, ap: 11, apMax: 11, fat: 0, fatMax: 130, fatRegen: 20, hp: 60, hpMax: 60, expValue: 100, armHeadMax: 20, armBodyMax: 20 };
          e.combat = { mSkill: 60, rSkill: 0, mDef: rnd(10,15), rDef: rnd(20,25), headshot: 25 }; e.skills = ['spiderBite', 'web']; e.perks.push('poisonWeapons');
      }
      e.stats.armHead = e.stats.armHeadMax; e.stats.armBody = e.stats.armBodyMax;
      return e;
  }

  if (faction === 'undead') {
      e.perks = ['undead']; e.stats = { baseIni: 45, fat: 0, fatMax: 9999, fatRegen: 9999 };
      if (role === 'zombie') {
          e.name = '殭屍'; e.sprite = 'zombie'; e.stats = { ...e.stats, ap: 6, apMax: 6, hp: 100, hpMax: 100, expValue: 100, armHeadMax: rnd(0,50), armBodyMax: rnd(2,30) };
          e.combat = { mSkill: 45, rSkill: 0, mDef: 0, rDef: 0, headshot: 25 }; e.skills = ['zombieBite'];
          const wArr = ['Bludgeon', 'MilitiaSpear', 'Pickaxe', 'WoodenStick']; e.weapon = WEAPONS_DB[wArr[rnd(0,3)]];
      } else if (role === 'armed_zombie') {
          e.name = '武裝殭屍'; e.sprite = 'zombie'; e.stats = { ...e.stats, ap: 6, apMax: 6, hp: 130, hpMax: 130, expValue: 150, armHeadMax: rnd(20,140), armBodyMax: rnd(30,115) };
          e.combat = { mSkill: 50, rSkill: 0, mDef: 0, rDef: 0, headshot: 25 }; e.skills = ['zombieBite'];
          const wArr = ['Handaxe', 'Bludgeon', 'Shortsword', 'MilitiaSpear']; e.weapon = WEAPONS_DB[wArr[rnd(0,3)]];
      } else if (role === 'fallen_hero') {
          e.name = '墮落英雄'; e.sprite = 'fallenHero'; e.stats = { ...e.stats, ap: 7, apMax: 7, hp: 180, hpMax: 180, expValue: 250, armHeadMax: 255, armBodyMax: rnd(85,260) };
          e.combat = { mSkill: 65, rSkill: 0, mDef: 5, rDef: 0, headshot: 25 }; e.skills = ['zombieBite'];
          const wArr = ['FightingAxe', 'WingedMace', 'ArmingSword', 'Greataxe', 'Longsword']; e.weapon = WEAPONS_DB[wArr[rnd(0,4)]];
      } else if (role === 'necromancer') {
          e.name = '死靈法師'; e.sprite = 'necromancer'; e.stats = { baseIni: 45, ap: 7, apMax: 7, fat: 0, fatMax: 90, fatRegen: 15, hp: 50, hpMax: 50, expValue: 400, armHeadMax: rnd(30,40), armBodyMax: rnd(55,80) };
          e.combat = { mSkill: 50, rSkill: 0, mDef: 5, rDef: 10, headshot: 25 }; e.skills = ['darkCurse', 'raiseDead']; e.weapon = WEAPONS_DB['Dagger']; e.perks = [];
      }
      e.stats.armHead = e.stats.armHeadMax; e.stats.armBody = e.stats.armBodyMax;
      if (isSummoned) e.stats.hp = Math.floor(e.stats.hpMax / 2);
      return e;
  }

  if (faction === 'bandit') {
      e.sprite = role === 'ranged' ? 'banditRanged' : 'banditMelee';
      if (role === 'leader') {
          e.name = '強盜領袖'; e.stats = { baseIni: 125, ap: 9, apMax: 9, fat: 0, fatMax: 130, fatRegen: 20, hp: 100, hpMax: 100, expValue: 375 };
          e.combat = { mSkill: 75, rSkill: 65, mDef: 15, rDef: 10, headshot: 25 }; e.weapon = WEAPONS_DB['Greatsword'] || WEAPONS_DB['Handaxe']; e.skills = ['slash'];
          e.headItem = getArmor(HEAD_ARMORS, 150, 400); e.bodyItem = getArmor(BODY_ARMORS, 200, 500);
      } else if (role === 'ranged') {
          e.name = '強盜射手'; e.stats = { baseIni: 110, ap: 9, apMax: 9, fat: 0, fatMax: 115, fatRegen: 20, hp: 60, hpMax: 60, expValue: 225 };
          e.combat = { mSkill: 50, rSkill: 60, mDef: 5, rDef: rnd(10,15), headshot: 25 }; e.weapon = WEAPONS_DB['ShortBow'] || WEAPONS_DB['LightCrossbow']; e.skills = ['quickShot'];
          e.headItem = getArmor(HEAD_ARMORS, 0, 80); e.bodyItem = getArmor(BODY_ARMORS, 40, 150);
      } else if (role === 'raider') {
          e.name = '強盜掠奪者'; e.stats = { baseIni: 115, ap: 9, apMax: 9, fat: 0, fatMax: 125, fatRegen: 20, hp: 75, hpMax: 75, expValue: 250 };
          e.combat = { mSkill: rnd(65,70), rSkill: rnd(55,60), mDef: 10, rDef: 10, headshot: 25 }; e.weapon = WEAPONS_DB['Shortsword'] || WEAPONS_DB['Handaxe']; e.skills = ['slash'];
          e.headItem = getArmor(HEAD_ARMORS, 60, 200); e.bodyItem = getArmor(BODY_ARMORS, 100, 300);
      } else {
          e.name = '強盜暴徒'; e.stats = { baseIni: 95, ap: 9, apMax: 9, fat: 0, fatMax: 95, fatRegen: 15, hp: 55, hpMax: 55, expValue: 150 };
          e.combat = { mSkill: 55, rSkill: 45, mDef: 0, rDef: 0, headshot: 25 }; e.weapon = WEAPONS_DB['WoodenStick']; e.skills = ['slash'];
          e.headItem = getArmor(HEAD_ARMORS, 0, 50); e.bodyItem = getArmor(BODY_ARMORS, 0, 60);
      }
  } else {
      e.sprite = (role === 'ambusher' || role === 'overseer') ? 'goblin' : 'goblinSpear';
      e.headItem = getArmor(HEAD_ARMORS, 15, 80); e.bodyItem = getArmor(BODY_ARMORS, 40, 100);
      if (role === 'overseer') {
          e.name = '哥布林監工'; e.stats = { baseIni: 120, ap: 9, apMax: 9, fat: 0, fatMax: 130, fatRegen: 15, hp: 70, hpMax: 70, expValue: 400 };
          e.combat = { mSkill: 75, rSkill: 80, mDef: 15, rDef: 20, headshot: 25 }; e.weapon = WEAPONS_DB['SpikedImpaler'] || WEAPONS_DB['HeavyCrossbow']; e.skills = ['quickShot'];
          e.headItem = getArmor(HEAD_ARMORS, 150, 300); e.bodyItem = getArmor(BODY_ARMORS, 150, 300);
      } else if (role === 'wolfrider') {
          e.name = '哥布林狼騎'; e.stats = { baseIni: 130, ap: 13, apMax: 13, fat: 0, fatMax: 150, fatRegen: 20, hp: 60, hpMax: 60, expValue: 150 };
          e.combat = { mSkill: 75, rSkill: 50, mDef: 15, rDef: 15, headshot: 25 }; e.weapon = WEAPONS_DB['Shortsword']; e.skills = ['slash', 'wolfBite'];
      } else if (role === 'ambusher') {
          e.name = '哥布林伏擊者'; e.stats = { baseIni: 140, ap: 9, apMax: 9, fat: 0, fatMax: 100, fatRegen: 15, hp: 40, hpMax: 40, expValue: 250 };
          e.combat = { mSkill: 60, rSkill: 75, mDef: 10, rDef: 20, headshot: 25 }; e.weapon = WEAPONS_DB['BoondockBow'] || WEAPONS_DB['ShortBow']; e.skills = ['quickShot'];
      } else {
          e.name = '哥布林散兵'; e.stats = { baseIni: 130, ap: 9, apMax: 9, fat: 0, fatMax: 100, fatRegen: 20, hp: 40, hpMax: 40, expValue: 200 };
          e.combat = { mSkill: 70, rSkill: 60, mDef: 15, rDef: 5, headshot: 25 }; e.weapon = WEAPONS_DB['GoblinSkewer']; e.skills = ['thrust']; e.perks = ['poisonWeapons'];
      }
  }
  e.stats.armHeadMax = e.headItem ? e.headItem.armorMax : 0; e.stats.armHead = e.stats.armHeadMax;
  e.stats.armBodyMax = e.bodyItem ? e.bodyItem.armorMax : 0; e.stats.armBody = e.stats.armBodyMax;
  return e;
};

const StatRow = ({ icon, label, val, color }) => (
  <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 border border-white/5 w-full rounded">
     <span className="text-gray-400 flex items-center gap-1 w-[100px] shrink-0"><span className={color || "text-gray-400"}>{icon}</span> <span className="truncate text-xs">{label}</span></span>
     <span className="font-mono text-right flex-1 text-sm">{val}</span>
  </div>
);

// ==========================================
// 主應用程式
// ==========================================
export default function App() {
  const [gameState, setGameState] = useState(GAME_STATE.START);
  const [companyName, setCompanyName] = useState('');
  const [sysMsg, setSysMsg] = useState(null);
  const showMessage = (msg) => { setSysMsg(msg); setTimeout(() => setSysMsg(null), 3000); };

  const [user, setUser] = useState(null);
  const [hasSave, setHasSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [inventory, setInventory] = useState({ gold: 1500, food: 100, tools: 40, stash: [] }); 
  const [roster, setRoster] = useState([]);
  const [worldData, setWorldData] = useState({ map: [], settlements: [], camps: [] });
  const [playerWorldPos, setPlayerWorldPos] = useState({ row: 0, col: 0 });
  const [activeLocation, setActiveLocation] = useState(null);
  
  const [activeContract, setActiveContract] = useState(null); 
  const [settlementView, setSettlementView] = useState(null); 
  
  const [selectedRosterId, setSelectedRosterId] = useState(null);
  const [levelUpState, setLevelUpState] = useState(null); 
  
  const [worldCam, setWorldCam] = useState({ x: 0, y: 0 });
  const [worldDrag, setWorldDrag] = useState({ isDragging: false, startX: 0, startY: 0, lastCamX: 0, lastCamY: 0, moved: false });
  
  const [battleData, setBattleData] = useState(null);
  const [battleCam, setBattleCam] = useState({ x: 0, y: 0 });
  const [battleDrag, setBattleDrag] = useState({ isDragging: false, startX: 0, startY: 0, lastCamX: 0, lastCamY: 0, moved: false });

  const getStashMax = () => 40 - (inventory.food > 0 ? 1 : 0) - (inventory.tools > 0 ? 1 : 0);

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token); else await signInAnonymously(auth); } catch (e) {}
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const checkSave = async () => { try { const snap = await getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'saves', 'slot1')); if (snap.exists()) setHasSave(true); } catch(e){} };
    checkSave();
  }, [user]);

  useEffect(() => {
    const handleGlobalMouseUp = () => { setWorldDrag(p => p.isDragging ? { ...p, isDragging: false } : p); setBattleDrag(p => p.isDragging ? { ...p, isDragging: false } : p); };
    window.addEventListener('mouseup', handleGlobalMouseUp); return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const reachableTiles = useMemo(() => {
    if (gameState !== GAME_STATE.BATTLE || !battleData || battleData.turnQueue.length === 0) return {};
    const activeChar = battleData.characters.find(c => c.id === battleData.turnQueue[0]);
    if (!activeChar || activeChar.team !== 'player' || battleData.selectedSkillId) return {};
    return getReachableTiles(activeChar.row, activeChar.col, activeChar, battleData.map, battleData.characters);
  }, [gameState, battleData]);

  useEffect(() => {
    if (gameState === GAME_STATE.BATTLE && battleData) {
      const playerAlive = battleData.characters.some(c => c.team === 'player' && c.stats.hp > 0);
      const enemyAlive = battleData.characters.some(c => c.team === 'enemy' && c.stats.hp > 0);
      
      if (!playerAlive || !enemyAlive) {
         if (playerAlive) {
            let msg = "✨ 戰鬥勝利！營地已被清除。";
            let earnedGold = 0;
            if (activeContract && activeContract.targetCampId === battleData.activeCampId) {
               earnedGold = activeContract.reward;
               msg += ` 任務完成！獲得 ${earnedGold} 金幣。`;
               setActiveContract(null);
            }
            
            const maxLootSpace = 40 - (inventory.food > 0 ? 1 : 0) - (inventory.tools > 0 ? 1 : 0) - (inventory.stash?.length || 0);
            const acquiredLoot = (battleData.loot || []).slice(0, Math.max(0, maxLootSpace));
            if (acquiredLoot.length > 0) msg += ` 獲得 ${acquiredLoot.length} 件戰利品！`;
            
            setInventory(prev => ({...prev, gold: prev.gold + earnedGold, stash: [...(prev.stash || []), ...acquiredLoot]}));
            showMessage(msg);
            
            setWorldData(prev => ({ ...prev, camps: prev.camps.filter(c => c.id !== battleData.activeCampId)}));
            
            let nextRoster = battleData.characters.filter(c => c.team === 'player').map(c => {
               const oldLevel = getLevelData(roster.find(oldC => oldC.id === c.id)?.stats.exp || 0).level;
               const newLevel = getLevelData(c.stats.exp).level;
               if (newLevel > oldLevel) c.levelUps = (c.levelUps || 0) + (newLevel - oldLevel);
               return c;
            });
            setRoster(nextRoster); 
         } else {
            showMessage("☠️ 部隊全滅，遊戲結束。");
         }
         setBattleData(null);
         setGameState(GAME_STATE.WORLD);
      }
    }
  }, [battleData?.characters, gameState, activeContract]);

  useEffect(() => {
    if (gameState !== GAME_STATE.BATTLE || !battleData) return;
    const activeCharId = battleData.turnQueue[0];
    const activeChar = battleData.characters.find(c => c.id === activeCharId);
    
    if (activeChar && activeChar.team === 'enemy') {
        const timer = setTimeout(() => {
            setBattleData(prev => {
                if (!prev || prev.turnQueue[0] !== activeCharId) return prev;
                const myCharIdx = prev.characters.findIndex(c => c.id === activeCharId);
                if (myCharIdx === -1) return prev;
                let myChar = { ...prev.characters[myCharIdx] };
                let newChars = [...prev.characters];
                let newLogs = [...prev.combatLogs];
                let acted = false;

                if (myChar.sprite === 'necromancer') {
                    const raiseUses = myChar.turnUsedSkills?.filter(s=>s==='raiseDead').length || 0;
                    if (raiseUses < 2 && myChar.stats.ap >= 3 && myChar.stats.fat + 10 <= myChar.stats.fatMax) {
                        const emptyNeighbors = getNeighbors(myChar.row, myChar.col, BATTLE_ROWS, BATTLE_COLS).filter(n => !newChars.some(c=>c.row===n.r && c.col===n.c));
                        if (emptyNeighbors.length > 0) {
                            const spot = emptyNeighbors[rnd(0, emptyNeighbors.length-1)];
                            const newZ = generateEnemy('undead', 'small', null, `summon-${Math.random()}`, spot.r, spot.c, true);
                            newZ.stats.hp = Math.floor(newZ.stats.hpMax / 2); newZ.stats.ap = 0; 
                            newChars.push(newZ);
                            myChar.stats.ap -= 3; myChar.stats.fat += 10;
                            if (!myChar.turnUsedSkills) myChar.turnUsedSkills = []; myChar.turnUsedSkills.push('raiseDead');
                            newLogs = [`${myChar.name} 施放了【穢土轉身】！`, ...newLogs].slice(0, 2);
                            acted = true;
                        }
                    }
                    if (!acted && myChar.stats.ap >= 3 && myChar.stats.fat + 10 <= myChar.stats.fatMax) {
                        const allies = newChars.filter(c => c.team === 'enemy' && c.id !== myChar.id && !c.statuses?.cursed);
                        if (allies.length > 0) {
                            const target = allies[rnd(0, allies.length-1)];
                            target.statuses = { ...target.statuses, cursed: 2 };
                            myChar.stats.ap -= 3; myChar.stats.fat += 10;
                            newLogs = [`${myChar.name} 對 ${target.name} 施加了【黑咒】！`, ...newLogs].slice(0, 2);
                            acted = true;
                        }
                    }
                }

                if (!acted) {
                    const playerChars = newChars.filter(c => c.team === 'player' && c.stats.hp > 0);
                    if (playerChars.length > 0) {
                        let closestTarget = null; let minDistance = Infinity;
                        playerChars.forEach(p => {
                           const dist = getHexDistance(myChar.row, myChar.col, p.row, p.col);
                           if (dist < minDistance) { minDistance = dist; closestTarget = p; }
                        });

                        let skillIdToUse = null;
                        for (let sId of myChar.skills || []) {
                            const sObj = SKILLS_DB[sId];
                            if (!sObj) continue;
                            if (sObj.oncePerTurn && myChar.turnUsedSkills?.includes(sId)) continue;
                            if (myChar.stats.ap >= sObj.ap && (myChar.stats.fat + sObj.fat) <= myChar.stats.fatMax && sObj.range >= minDistance) { skillIdToUse = sId; break; }
                        }
                        if (!skillIdToUse) skillIdToUse = myChar.skills?.[0]; 

                        const skillObj = SKILLS_DB[skillIdToUse];
                        if (skillObj) {
                            if (minDistance > skillObj.range) {
                                const reachable = getReachableTiles(myChar.row, myChar.col, myChar, prev.map, newChars);
                                let bestTile = null; let bestDist = minDistance;
                                for (const hexId in reachable) {
                                    const [r, c] = hexId.split('-').map(Number);
                                    const d = getHexDistance(r, c, closestTarget.row, closestTarget.col);
                                    if (d < bestDist) { bestDist = d; bestTile = { r, c, ap: reachable[hexId].ap, fat: reachable[hexId].fat }; }
                                }
                                if (bestTile) { myChar.row = bestTile.r; myChar.col = bestTile.c; myChar.stats.ap -= bestTile.ap; myChar.stats.fat += bestTile.fat; minDistance = bestDist; }
                            }

                            if (minDistance <= skillObj.range && myChar.stats.ap >= skillObj.ap && (myChar.stats.fat + skillObj.fat) <= myChar.stats.fatMax) {
                                if (skillObj.oncePerTurn) {
                                    if (!myChar.turnUsedSkills) myChar.turnUsedSkills = [];
                                    myChar.turnUsedSkills.push(skillIdToUse);
                                }
                                myChar.stats.ap -= skillObj.ap; myChar.stats.fat += skillObj.fat;
                                acted = true;

                                if (skillObj.isStatus) {
                                    const roll = Math.floor(Math.random() * 100) + 1;
                                    if (roll <= (skillObj.hitChance || 100)) {
                                        if (skillIdToUse === 'web') { closestTarget.statuses = { ...closestTarget.statuses, webbed: 3 }; newLogs = [`${myChar.name} 用蛛網束縛了 ${closestTarget.name}！`, ...newLogs].slice(0, 2); }
                                    } else { newLogs = [`${myChar.name} 的技能未命中。`, ...newLogs].slice(0, 2); }
                                } else {
                                    const hitChance = calculateHitChance(myChar, closestTarget, skillObj);
                                    const roll = Math.floor(Math.random() * 100) + 1;
                                    let logMsg = `${myChar.name} 發動 ${skillObj.name}... (${hitChance}%, 骰出 ${roll}) => `;

                                    let targetIdx = newChars.findIndex(c => c.id === closestTarget.id);
                                    let targetChar = { ...newChars[targetIdx] };

                                    if (roll <= hitChance) {
                                        const isHeadshot = Math.floor(Math.random() * 100) + 1 <= (myChar.combat?.headshot || 25 + (skillObj.hsBonus || 0));
                                        logMsg += isHeadshot ? `【爆頭！】` : `命中！`;

                                        const wpn = myChar.weapon;
                                        const baseDmg = skillObj.overrides ? rnd(skillObj.overrides.dmgMin, skillObj.overrides.dmgMax) : rnd(wpn?.min || 5, wpn?.max || 10);
                                        let armorDmg = Math.floor(baseDmg * (skillObj.overrides ? skillObj.overrides.armorEff : (wpn?.armorEff || 0.5)));
                                        let hpDmgBase = Math.floor(baseDmg * (skillObj.overrides ? skillObj.overrides.armorPen : (wpn?.armorPen || 0.1)));

                                        let currentArmor = isHeadshot ? targetChar.stats.armHead : targetChar.stats.armBody;
                                        let actualArmorDmg = armorDmg; let remainingArmor = currentArmor - armorDmg;
                                        if (remainingArmor < 0) { actualArmorDmg = currentArmor; remainingArmor = 0; }

                                        let hpDmg = hpDmgBase - Math.floor(remainingArmor * 0.1);
                                        if (remainingArmor === 0 && actualArmorDmg < armorDmg) {
                                           const extra = Math.floor(baseDmg * (1 - (skillObj.overrides ? skillObj.overrides.armorPen : (wpn?.armorPen || 0.1)))) - actualArmorDmg;
                                           if (extra > 0) hpDmg += extra;
                                        }
                                        if (hpDmg < 0) hpDmg = 0;
                                        if (isHeadshot) hpDmg = Math.floor(hpDmg * 1.5);

                                        logMsg += `造成 ${actualArmorDmg} 護甲與 ${hpDmg} 傷害。`;

                                        if (isHeadshot) targetChar.stats.armHead = remainingArmor; else targetChar.stats.armBody = remainingArmor;
                                        targetChar.stats.hp -= hpDmg;

                                        if (myChar.perks?.includes('poisonWeapons') && hpDmg >= 6) { targetChar.statuses = { ...targetChar.statuses, poison: 3 }; logMsg += ` 並中毒！`; }

                                        if (targetChar.stats.hp <= 0) {
                                           logMsg += ` ${targetChar.name} 被擊殺！`;
                                           myChar.stats.exp = (myChar.stats.exp || 0) + (targetChar.stats.expValue || 0); 
                                        }
                                        newChars[targetIdx] = targetChar;
                                    } else { logMsg += `未命中。`; }
                                    newLogs = [logMsg, ...newLogs].slice(0, 2);
                                }
                            }
                        }
                    }
                }

                newChars[myCharIdx] = myChar;
                let nextQueue = [...prev.turnQueue];
                
                newChars.forEach((c, idx) => {
                   if (c.stats.hp <= 0 && c.team === 'enemy' && c.perks?.includes('undead') && Math.random() < 0.5) {
                       c.stats.hp = Math.floor(c.stats.hpMax * 0.5); c.stats.ap = 0; 
                       newLogs = [`${c.name} 倒下後又再度站起！`, ...newLogs].slice(0, 2);
                   }
                });

                const deadIds = newChars.filter(c => c.stats.hp <= 0).map(c => c.id);
                if (deadIds.length > 0) {
                   newChars = newChars.filter(c => c.stats.hp > 0);
                   nextQueue = nextQueue.filter(id => !deadIds.includes(id));
                }

                if (!acted || myChar.stats.ap < 3) nextQueue.shift(); 
                let nextState = { ...prev, characters: newChars, combatLogs: newLogs, turnQueue: nextQueue, aiTick: (prev.aiTick || 0) + 1 };
                if (nextQueue.length === 0 && newChars.some(c => c.team === 'enemy') && newChars.some(c => c.team === 'player')) {
                   const { updatedChars, queue } = generateTurnQueue(newChars);
                   nextState.characters = updatedChars; nextState.turnQueue = queue; nextState.round = prev.round + 1;
                }
                return nextState;
            });
        }, 800); 
        return () => clearTimeout(timer);
    }
  }, [gameState, battleData?.turnQueue?.[0], battleData?.aiTick]);

  // --------------------- Handlers --------------------- //

  const handleSaveGame = async () => {
    if (!user || !db) return showMessage('⚠️ 無法儲存：未連線到伺服器。');
    setIsSaving(true);
    try {
       await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'saves', 'slot1'), JSON.parse(JSON.stringify({ companyName, inventory, roster, worldData, playerWorldPos, worldCam, timestamp: new Date().toISOString() })));
       setHasSave(true); showMessage('✨ 遊戲進度已安全儲存於雲端！');
    } catch (e) { showMessage('❌ 儲存失敗！'); }
    setIsSaving(false);
  };

  const handleLoadGame = async () => {
    if (!user || !db) return;
    setIsLoading(true);
    try {
       const snap = await getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'saves', 'slot1'));
       if (snap.exists()) {
          const data = snap.data();
          setCompanyName(data.companyName); setInventory(data.inventory); setRoster(data.roster); setWorldData(data.worldData); setPlayerWorldPos(data.playerWorldPos); setWorldCam(data.worldCam || {x:0, y:0});
          setGameState(GAME_STATE.WORLD); showMessage('✅ 成功載入遊戲進度！');
       } else showMessage('⚠️ 找不到儲存紀錄。');
    } catch(e) { showMessage('❌ 讀取失敗！'); }
    setIsLoading(false);
  };

  const generateTurnQueue = (chars) => {
     let updatedChars = chars.map(c => {
         let apMax = c.stats.apMax; let statusMods = { ...c.statuses };
         if (statusMods.cursed > 0) apMax += 5;
         if (statusMods.poison > 0) { apMax = Math.max(1, apMax - 1); statusMods.poison -= 1; }
         if (statusMods.webbed > 0) statusMods.webbed -= 1;
         if (statusMods.cursed > 0) statusMods.cursed -= 1;
         return {
             ...c, turnUsedSkills: [], statuses: statusMods,
             stats: { ...c.stats, ap: Math.min(apMax, c.stats.ap + apMax), fat: Math.max(0, c.stats.fat - (c.stats.fatRegen || 15)) }
         }
     });
     let queue = updatedChars.map(c => c.id).sort((idA, idB) => getDynamicIni(updatedChars.find(c => c.id === idB)) - getDynamicIni(updatedChars.find(c => c.id === idA)));
     return { updatedChars, queue };
  };

  const handleStartGame = () => {
    if (!companyName.trim()) return;

    const initialRoster = [
      createChar('p1', '劍士', 'swordsman', 100, 65, 70, 70, 30, 15, 10, 'NasalHelmet', 'MailHauberk', 'ArmingSword'),
      createChar('p2', '傭兵 A', 'mercenary', 90, 45, 55, 50, 30, 0, 5, 'Headscarf', 'Sackcloth', 'Knife'),
      createChar('p3', '傭兵 B', 'mercenary', 95, 40, 50, 45, 35, 5, 0, null, 'LinenTunic', 'Pitchfork', ['dodge'])
    ];

    const map = []; const validLandHexes = [];
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        const rand = Math.random();
        let terrain = 'grass';
        if (rand > 0.85) terrain = 'mountain'; else if (rand > 0.70) terrain = 'highland'; else if (rand > 0.55) terrain = 'forest';
        map.push({ id: `w-${r}-${c}`, row: r, col: c, terrain });
        if (terrain !== 'mountain') validLandHexes.push({r, c});
      }
    }

    const settlements = [];
    let houseDist = [6, 6, 5].sort(() => Math.random() - 0.5); 
    let currentHouseIdx = 0, currentHouseCount = 0;
    let targetTypes = []; SETTLEMENT_CONFIG.forEach(cfg => { for(let i=0; i<cfg.count; i++) targetTypes.push(cfg); });
    targetTypes.sort(() => Math.random() - 0.5);

    targetTypes.forEach((cfg, idx) => {
       let posIdx = Math.floor(Math.random() * validLandHexes.length); let pos = validLandHexes.splice(posIdx, 1)[0];
       if (currentHouseCount >= houseDist[currentHouseIdx]) { currentHouseIdx++; currentHouseCount = 0; }
       const house = NOBLE_HOUSES[currentHouseIdx]; currentHouseCount++;
       settlements.push({ id: `set-${idx}`, name: `${house.name.substring(0,2)}${cfg.name}`, type: cfg.type, typeName: cfg.name, row: pos.r, col: pos.c, house: house, icon: cfg.icon });
    });

    const camps = [];
    const numCamps = rnd(12, 18); 
    const campTypes = ['goblin', 'bandit', 'beast', 'undead']; 

    for(let i=0; i<numCamps; i++) {
       if (validLandHexes.length === 0) break; 
       let posIdx = Math.floor(Math.random() * validLandHexes.length); let pos = validLandHexes.splice(posIdx, 1)[0];
       const cType = campTypes[rnd(0, campTypes.length-1)]; 
       let cSize = ['small', 'large'][rnd(0,1)];
       let numEnemies = cSize === 'large' ? rnd(9, 13) : rnd(4, 8);
       let bType = null;
       let cName = `${cSize === 'large' ? '大型' : '小型'}`;
       if (cType === 'goblin') cName += '哥布林營地';
       else if (cType === 'bandit') cName += '強盜營地';
       else if (cType === 'undead') cName += '不死族墓地';
       else {
           cSize = 'small'; numEnemies = rnd(5, 10); bType = ['direwolf', 'serpent', 'spider'][rnd(0,2)];
           cName += bType === 'direwolf' ? '恐狼巢穴' : bType === 'serpent' ? '毒蛇巢穴' : '蜘蛛巢穴';
       }
       camps.push({ id: `camp-${i}`, name: cName, row: pos.r, col: pos.c, type: cType, size: cSize, numEnemies, beastType: bType });
    }

    const finalSettlements = settlements.map(s => {
       const generatedRecruits = [];
       for(let i=0; i<3; i++) {
          const tier = rnd(1, 3); const price = rnd(150, 250) * tier; const statMod = (tier - 1) * 10;
          const recChar = createChar(`rec-${Math.random()}`, `流浪傭兵 ${i+1}`, 'mercenary', rnd(90,100) + statMod, rnd(45,55) + statMod, rnd(60,70) + statMod, rnd(45,55) + statMod, rnd(30,40) + statMod, rnd(0,5) + Math.floor(statMod/2), rnd(0,5) + Math.floor(statMod/2), null, null, 'WoodenStick');
          recChar.price = price;
          generatedRecruits.push(recChar);
       }
       const generatedMarket = [];
       const wKeys = Object.keys(WEAPONS_DB);
       for(let i=0; i<4; i++) generatedMarket.push({...WEAPONS_DB[wKeys[rnd(0, wKeys.length-1)]]});
       const aKeys = Object.keys(ARMOR_DB);
       for(let i=0; i<4; i++) generatedMarket.push({...ARMOR_DB[aKeys[rnd(0, aKeys.length-1)]]});

       const generatedContracts = [];
       if (camps && camps.length > 0) {
           const numContracts = rnd(1, 2);
           for(let i=0; i<numContracts; i++) {
               const target = camps[rnd(0, camps.length-1)];
               const stars = target.size === 'large' ? 2 : 1;
               generatedContracts.push({
                   id: `contract-${Math.random()}`, targetCampId: target.id, targetName: target.name, stars,
                   reward: stars === 2 ? rnd(700, 1000) : rnd(300, 500)
               });
           }
       }
       return { ...s, recruits: generatedRecruits, market: generatedMarket, contracts: generatedContracts };
    });

    let startPosIdx = Math.floor(Math.random() * validLandHexes.length);
    let startPos = validLandHexes[startPosIdx];

    setRoster(JSON.parse(JSON.stringify(initialRoster))); 
    setWorldData({ map, settlements: finalSettlements, camps }); 
    setPlayerWorldPos({ row: startPos.r, col: startPos.c }); 
    setWorldCam({ x: 0, y: 0 }); 
    setGameState(GAME_STATE.WORLD);
  };

  const handleWorldHexClick = (r, c) => {
     if (worldDrag.moved) return;
     const dist = getHexDistance(playerWorldPos.row, playerWorldPos.col, r, c);
     if (dist > 0) {
        const foodCost = dist * roster.length;
        if (inventory.food < foodCost) return showMessage(`⚠️ 糧食不足！移動需要 ${foodCost} 點糧食。`); 
        setInventory(prev => ({ ...prev, food: prev.food - foodCost })); setPlayerWorldPos({ row: r, col: c });
     }

     const settlement = worldData.settlements.find(s => s.row === r && s.col === c);
     if (settlement) { setActiveLocation(settlement); setSettlementView(null); setGameState(GAME_STATE.SETTLEMENT); return; }

     const camp = worldData.camps.find(cp => cp.row === r && cp.col === c);
     if (camp) initBattle(camp);
  };

  const initBattle = (camp) => {
    const battleMap = [];
    for (let r = 0; r < BATTLE_ROWS; r++) {
      for (let c = 0; c < BATTLE_COLS; c++) battleMap.push({ id: `${r}-${c}`, row: r, col: c, terrain: Math.random() > 0.8 ? 'highland' : 'grass' });
    }

    let bChars = roster.map((char, i) => ({ ...char, row: 4 + (i % 4), col: 2 + Math.floor(i / 4) }));

    for (let i = 0; i < camp.numEnemies; i++) {
       const r = Math.floor(Math.random() * (BATTLE_ROWS - 2)) + 1;
       const c = BATTLE_COLS - 1 - Math.floor(Math.random() * 3);
       bChars.push(generateEnemy(camp.type, camp.size, camp.beastType, `e${i}`, r, c));
    }

    let occupied = new Set();
    bChars.forEach(char => {
       while(occupied.has(`${char.row}-${char.col}`)) {
           char.row = Math.max(0, Math.min(BATTLE_ROWS - 1, char.row + (Math.random() > 0.5 ? 1 : -1)));
           char.col = Math.max(0, Math.min(BATTLE_COLS - 1, char.col + (Math.random() > 0.5 ? 1 : -1)));
       }
       occupied.add(`${char.row}-${char.col}`);
    });

    const { updatedChars, queue } = generateTurnQueue(bChars);

    setBattleData({ map: battleMap, characters: updatedChars, round: 1, turnQueue: queue, combatLogs: [], selectedSkillId: null, hoverHex: null, activeCampId: camp.id, viewedCharId: null, loot: [] });
    setBattleCam({ x: 0, y: 0 }); setGameState(GAME_STATE.BATTLE);
  };

  const handleBuyItem = (item, idx) => {
     if (inventory.gold >= item.price) {
         if ((inventory.stash?.length || 0) >= getStashMax()) return showMessage('庫存空間不足！');
         setInventory(p => ({ ...p, gold: p.gold - item.price, stash: [...(p.stash || []), JSON.parse(JSON.stringify(item))] }));
         const updatedSettlement = { ...activeLocation, market: activeLocation.market.filter((_, i) => i !== idx) };
         setActiveLocation(updatedSettlement);
         setWorldData(prev => ({...prev, settlements: prev.settlements.map(s => s.id === activeLocation.id ? updatedSettlement : s)}));
         showMessage(`已購買 ${item.name}`);
     } else showMessage('金幣不足');
  };

  const handleSellItem = (idx) => {
     const item = inventory.stash[idx];
     const sellPrice = Math.floor(item.price * 0.5);
     let nextStash = [...inventory.stash]; nextStash.splice(idx, 1);
     setInventory(p => ({ ...p, gold: p.gold + sellPrice, stash: nextStash }));
     showMessage(`售出 ${item.name} 獲得 ${sellPrice} 金幣`);
  };

  const handleRecruit = (rec) => {
      if(roster.length >= 12) return showMessage('隊伍已滿');
      if(inventory.gold >= rec.price) {
          setInventory(p => ({...p, gold: p.gold - rec.price}));
          setRoster(p => [...p, JSON.parse(JSON.stringify(rec))]);
          const updatedSettlement = { ...activeLocation, recruits: activeLocation.recruits.filter(r => r.id !== rec.id) };
          setActiveLocation(updatedSettlement);
          setWorldData(prev => ({...prev, settlements: prev.settlements.map(s => s.id === activeLocation.id ? updatedSettlement : s)}));
          showMessage(`成功招募 ${rec.name}！`);
      } else showMessage('金幣不足'); 
  };

  const handleAcceptContract = (contract) => {
      setActiveContract({ targetCampId: contract.targetCampId, stars: contract.stars, reward: contract.reward });
      const updatedSettlement = { ...activeLocation, contracts: activeLocation.contracts.filter(c => c.id !== contract.id) };
      setActiveLocation(updatedSettlement);
      setWorldData(prev => ({...prev, settlements: prev.settlements.map(s => s.id === activeLocation.id ? updatedSettlement : s)}));
      showMessage(`✅ 已接取任務！目標：${contract.targetName}`);
  };

  const handleRepairAll = () => {
     let toolsUsed = 0; 
     let nextRoster = roster.map(c => JSON.parse(JSON.stringify(c))); 
     for (let char of nextRoster) {
         let headMissing = (char.stats.armHeadMax || 0) - (char.stats.armHead || 0);
         let bodyMissing = (char.stats.armBodyMax || 0) - (char.stats.armBody || 0);
         while (headMissing > 0 && inventory.tools - toolsUsed > 0) { char.stats.armHead += Math.min(15, headMissing); headMissing -= 15; toolsUsed++; }
         while (bodyMissing > 0 && inventory.tools - toolsUsed > 0) { char.stats.armBody += Math.min(15, bodyMissing); bodyMissing -= 15; toolsUsed++; }
         char.stats.armHead = Math.min(char.stats.armHeadMax || 0, char.stats.armHead || 0);
         char.stats.armBody = Math.min(char.stats.armBodyMax || 0, char.stats.armBody || 0);
     }
     if (toolsUsed > 0) {
         setRoster(nextRoster); setInventory(p => ({ ...p, tools: p.tools - toolsUsed }));
         showMessage(`🔨 消耗了 ${toolsUsed} 個工具，已修復隊伍裝備。`);
     } else showMessage(`裝備完好或維修工具不足。`);
  };

  const handleEquip = (idx) => {
     const item = inventory.stash[idx];
     let nextStash = [...inventory.stash]; nextStash.splice(idx, 1);
     
     let charIndex = roster.findIndex(c => c.id === selectedRosterId);
     if (charIndex === -1) return;
     let nextRoster = [...roster]; 
     let char = JSON.parse(JSON.stringify(nextRoster[charIndex]));

     let oldItem = null;
     if (item.type === 'head') {
         oldItem = char.headItem;
         if (oldItem) oldItem.armor = char.stats.armHead; 
         char.headItem = item; char.stats.armHeadMax = item.armorMax || item.armor; char.stats.armHead = item.armor;
     } else if (item.type === 'body') {
         oldItem = char.bodyItem;
         if (oldItem) oldItem.armor = char.stats.armBody; 
         char.bodyItem = item; char.stats.armBodyMax = item.armorMax || item.armor; char.stats.armBody = item.armor;
     } else if (item.type === 'melee' || item.type === 'ranged') {
         oldItem = char.weapon; char.weapon = item;
         char.skills = ['slash']; 
         if (item.type === 'ranged') char.skills = ['quickShot'];
     }
     if (oldItem) {
         nextStash.push(oldItem);
     }
     nextRoster[charIndex] = char;
     setInventory(p => ({ ...p, stash: nextStash })); setRoster(nextRoster);
  };

  const handleUnequip = (slot) => {
     let charIndex = roster.findIndex(c => c.id === selectedRosterId);
     if (charIndex === -1) return;
     let nextStash = [...(inventory.stash || [])];
     if (nextStash.length >= getStashMax()) return showMessage('庫存空間不足！');

     let nextRoster = [...roster]; 
     let char = JSON.parse(JSON.stringify(nextRoster[charIndex]));

     if (slot === 'head' && char.headItem) { 
         nextStash.push({...char.headItem, armor: char.stats.armHead}); 
         char.headItem = null; char.stats.armHeadMax = 0; char.stats.armHead = 0; 
     }
     else if (slot === 'body' && char.bodyItem) { 
         nextStash.push({...char.bodyItem, armor: char.stats.armBody}); 
         char.bodyItem = null; char.stats.armBodyMax = 0; char.stats.armBody = 0; 
     }
     else if (slot === 'weapon' && char.weapon) { 
         nextStash.push(char.weapon); char.weapon = null; char.skills = []; 
     }
     
     nextRoster[charIndex] = char;
     setInventory(p => ({ ...p, stash: nextStash })); setRoster(nextRoster);
  };

  const openLevelUp = (char) => {
      setLevelUpState({
          charId: char.id, selected: [],
          rolls: { hp: rnd(3,5), fat: rnd(3,5), mSkill: rnd(3,5), rSkill: rnd(3,5), mDef: rnd(3,5), rDef: rnd(3,5), ini: rnd(3,5) }
      });
  };

  const confirmLevelUp = () => {
      if (levelUpState.selected.length !== 3) return showMessage('請選擇恰好 3 項屬性進行提升！');
      setRoster(prev => prev.map(c => {
         if (c.id === levelUpState.charId) {
             let nextC = JSON.parse(JSON.stringify(c));
             levelUpState.selected.forEach(key => {
                const val = levelUpState.rolls[key];
                if (key === 'hp') nextC.stats.hpMax += val;
                if (key === 'fat') nextC.stats.fatMax += val;
                if (key === 'ini') nextC.stats.baseIni += val;
                if (key === 'mSkill') nextC.combat.mSkill += val;
                if (key === 'rSkill') nextC.combat.rSkill += val;
                if (key === 'mDef') nextC.combat.mDef += val;
                if (key === 'rDef') nextC.combat.rDef += val;
             });
             nextC.stats.hp = nextC.stats.hpMax; 
             nextC.levelUps -= 1;
             return nextC;
         }
         return c;
      }));
      setLevelUpState(null); showMessage('🌟 升級成功！屬性已提升。');
  };

  // --------------------- Render Helpers --------------------- //

  const displayStash = [];
  if (inventory.food > 0) displayStash.push({ isResource: true, type: 'food', name: '食物 (20點)', count: inventory.food });
  if (inventory.tools > 0) displayStash.push({ isResource: true, type: 'tools', name: '維修工具 (20點)', count: inventory.tools });
  inventory.stash?.forEach((item, idx) => displayStash.push({ ...item, stashIdx: idx }));

  const renderToastMessage = () => {
     if (!sysMsg) return null;
     return <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 bg-red-900/95 text-white px-8 py-4 rounded shadow-2xl border-2 border-red-500 z-50 text-base font-bold animate-pulse pointer-events-none text-center min-w-[300px]">{sysMsg}</div>;
  };

  // --------------------- Render Views --------------------- //

  if (gameState === GAME_STATE.START) {
    return (
      <div className="w-full h-screen bg-neutral-900 flex flex-col items-center justify-center text-gray-200 font-sans">
        <h1 className="text-5xl font-extrabold mb-8 text-orange-600 drop-shadow-lg tracking-widest border-b-2 border-orange-800 pb-4">
          BATTLE BROTHERS: WEB
        </h1>
        <div className="bg-[#1a1c17] p-8 rounded-lg border-2 border-[#3f4a2e] shadow-2xl flex flex-col items-center w-96">
          <label className="text-gray-400 mb-2 font-bold w-full text-left">輸入你的傭兵團名稱：</label>
          <input type="text" className="w-full bg-neutral-800 border border-gray-600 p-3 rounded text-xl text-white mb-6 focus:outline-none focus:border-orange-500 text-center" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          <div className="flex flex-col gap-3 w-full">
            <button onClick={handleStartGame} disabled={!companyName.trim() || isLoading} className="w-full py-3 bg-gradient-to-b from-orange-700 to-orange-900 hover:from-orange-600 hover:to-orange-800 text-white font-bold rounded shadow border border-orange-500 disabled:opacity-50 transition-all text-lg cursor-pointer">啟程 (New Game)</button>
            {hasSave && <button onClick={handleLoadGame} disabled={isLoading} className="w-full py-3 bg-gradient-to-b from-blue-800 to-blue-950 hover:from-blue-700 hover:to-blue-900 text-white font-bold rounded shadow border border-blue-500 disabled:opacity-50 transition-all text-lg cursor-pointer flex justify-center items-center gap-2"><Download size={20}/> {isLoading ? '載入中...' : '載入進度'}</button>}
          </div>
        </div>
      </div>
    );
  }

  if (gameState === GAME_STATE.WORLD) {
    return (
      <div className="w-full h-screen bg-neutral-900 flex flex-col font-sans select-none text-gray-100 overflow-hidden">
        {renderToastMessage()}
        <div className="h-12 bg-black/90 border-b border-gray-700 flex items-center justify-between px-6 z-20 shadow-md shrink-0">
           <div className="font-bold text-orange-500 tracking-wider text-lg flex items-center gap-2 cursor-pointer hover:text-orange-400 hover:bg-white/5 px-3 py-1 rounded transition-colors" onClick={() => { setSelectedRosterId(roster[0]?.id); setGameState(GAME_STATE.INVENTORY); }}>
             <Shield size={20} /> {companyName}
           </div>
           <div className="flex items-center gap-8 text-sm font-mono text-gray-300">
              <span className="flex items-center gap-1.5"><Coins size={16} className="text-yellow-500"/> {inventory.gold}</span>
              <span className="flex items-center gap-1.5"><Drumstick size={16} className="text-orange-400"/> {inventory.food}</span>
              <span className="flex items-center gap-1.5"><Hammer size={16} className="text-gray-400"/> {inventory.tools}</span>
              <span className="flex items-center gap-1.5 ml-2"><Users size={16} className="text-blue-300"/> {roster.length} / 12</span>
              <button onClick={handleSaveGame} disabled={isSaving} className="flex items-center gap-1.5 ml-4 bg-[#2a1a10] hover:bg-[#3c2517] border border-[#5c3a21] px-3 py-1 rounded text-orange-200 transition-colors disabled:opacity-50 cursor-pointer"><Save size={16} /> 儲存</button>
           </div>
        </div>
        <div className="flex-1 bg-[#151912] flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
           onMouseDown={(e) => setWorldDrag({ isDragging: true, startX: e.clientX, startY: e.clientY, lastCamX: worldCam.x, lastCamY: worldCam.y, moved: false })}
           onMouseMove={(e) => { if (!worldDrag.isDragging) return; const dx = e.clientX - worldDrag.startX, dy = e.clientY - worldDrag.startY; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) setWorldDrag(p => ({ ...p, moved: true })); setWorldCam({ x: worldDrag.lastCamX + dx, y: worldDrag.lastCamY + dy }); }}
           onMouseUp={() => setWorldDrag(p => ({ ...p, isDragging: false }))} onMouseLeave={() => setWorldDrag(p => ({ ...p, isDragging: false }))} onDragStart={(e) => e.preventDefault()}
        >
           <svg width={(WORLD_COLS + 2) * HEX_WIDTH} height={(WORLD_ROWS + 2) * HEX_HEIGHT * 0.75} className="drop-shadow-2xl transition-transform will-change-transform" style={{ transform: `translate(${worldCam.x}px, ${worldCam.y}px)` }} overflow="visible">
             <g transform={`translate(${HEX_WIDTH}, ${HEX_HEIGHT / 2})`}>
                {worldData.map.map(hex => {
                  const { x, y } = hexToPixel(hex.row, hex.col); const terrain = TERRAIN_INFO[hex.terrain];
                  return <polygon key={hex.id} points={getHexPoints(x + HEX_WIDTH/2, y + HEX_HEIGHT/2, HEX_SIZE - 0.5)} fill={terrain.fill} stroke={terrain.stroke} strokeWidth="1" onClick={(e) => { e.stopPropagation(); handleWorldHexClick(hex.row, hex.col); }} className="hover:fill-white/10 transition-colors" />;
                })}
                {worldData.settlements.map(set => {
                  const { x, y } = hexToPixel(set.row, set.col);
                  return (
                    <g key={set.id} transform={`translate(${x + HEX_WIDTH/2}, ${y + HEX_HEIGHT/2})`} onClick={(e) => { e.stopPropagation(); handleWorldHexClick(set.row, set.col); }} className="cursor-pointer group">
                       <circle r={HEX_SIZE * 0.7} fill={set.house.color} opacity="0.4" />
                       <text y="-8" textAnchor="middle" fontSize="24" style={{ pointerEvents: 'none' }}>{set.icon}</text>
                       <rect x="-40" y="10" width="80" height="18" fill="rgba(0,0,0,0.7)" rx="4" />
                       <text y="23" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="bold">{set.name}</text>
                       {activeContract && <text y="-35" textAnchor="middle" fontSize="20" fill="#fbbf24" style={{ pointerEvents: 'none' }} className="animate-bounce">📜</text>}
                    </g>
                  );
                })}
                {worldData.camps.map(camp => {
                  const { x, y } = hexToPixel(camp.row, camp.col);
                  let fillColor = '#b47b2c', strokeColor = '#784715';
                  if (camp.type === 'goblin') { fillColor = '#4b5e4b'; strokeColor = '#2f3d2f'; }
                  else if (camp.type === 'beast') { fillColor = '#8b0000'; strokeColor = '#4a0000'; }
                  else if (camp.type === 'undead') { fillColor = '#483d8b'; strokeColor = '#2e2b5c'; }
                  const isLarge = camp.size === 'large';
                  return (
                    <g key={camp.id} transform={`translate(${x + HEX_WIDTH/2}, ${y + HEX_HEIGHT/2})`} onClick={(e) => { e.stopPropagation(); handleWorldHexClick(camp.row, camp.col); }} className="cursor-pointer hover:scale-110 transition-transform">
                       <title>{camp.name} ({camp.numEnemies} 名敵人)</title>
                       <circle r={HEX_SIZE * (isLarge ? 0.75 : 0.55)} fill={fillColor} stroke={strokeColor} strokeWidth="2" opacity="0.9" />
                       {isLarge ? (
                         <g style={{ pointerEvents: 'none' }}>
                            <g transform="translate(-16, -8)"><Tent size={18} color="#e5e7eb" /></g>
                            <g transform="translate(2, -8)"><Tent size={18} color="#e5e7eb" /></g>
                            <g transform="translate(-10, 4)"><Tent size={22} color="#e5e7eb" /></g>
                         </g>
                       ) : (
                         <g transform="translate(-12, -12)" style={{ pointerEvents: 'none' }}><Tent size={24} color="#e5e7eb" /></g>
                       )}
                       {activeContract?.targetCampId === camp.id && <circle r={HEX_SIZE} fill="none" stroke="#ef4444" strokeWidth="3" strokeDasharray="6 4" className="animate-spin-slow" style={{ pointerEvents: 'none' }}/>}
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
      </div>
    );
  }

  if (gameState === GAME_STATE.SETTLEMENT && activeLocation) {
    return (
      <div className="w-full h-screen bg-[#111] flex flex-col font-sans select-none text-gray-100 items-center justify-center relative p-8">
         {renderToastMessage()}
         <div className="w-full max-w-5xl h-full max-h-[90vh] min-h-[600px] bg-[#2a2722] border-4 border-[#3c362a] rounded-lg shadow-2xl flex flex-col overflow-hidden relative">
            <div className="bg-[#1e1c18] border-b-2 border-[#111] p-3 text-center shrink-0 z-10 relative">
               <h2 className="text-2xl font-bold text-[#d4af37] tracking-wider uppercase">{activeLocation.name}</h2>
               <p className="text-sm text-gray-400">{activeLocation.house.name} 領地下的 {activeLocation.typeName}</p>
            </div>

            {!settlementView && (
                <div className="flex-1 relative bg-gradient-to-b from-sky-800 to-[#5b8c34] flex flex-col items-center justify-end pb-8 overflow-y-auto">
                    <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
                    <div className="text-[120px] drop-shadow-2xl mb-4">{activeLocation.icon}</div>
                    <div className="flex gap-4 z-10">
                       <button onClick={() => setSettlementView('board')} className="bg-[#382212] hover:bg-[#4a2e1b] border-2 border-[#5c3a21] p-4 rounded flex flex-col items-center w-28 transition-transform hover:-translate-y-1 shadow-lg cursor-pointer">
                         <ScrollText size={32} className="text-yellow-200 mb-2" />
                         <span className="text-sm font-bold text-gray-200">佈告欄</span>
                       </button>
                       <button onClick={() => setSettlementView('market')} className="bg-[#382212] hover:bg-[#4a2e1b] border-2 border-[#5c3a21] p-4 rounded flex flex-col items-center w-28 transition-transform hover:-translate-y-1 shadow-lg cursor-pointer">
                         <Building size={32} className="text-orange-300 mb-2" />
                         <span className="text-sm font-bold text-gray-200">市場</span>
                       </button>
                       <button onClick={() => setSettlementView('tavern')} className="bg-[#382212] hover:bg-[#4a2e1b] border-2 border-[#5c3a21] p-4 rounded flex flex-col items-center w-28 transition-transform hover:-translate-y-1 shadow-lg cursor-pointer">
                         <Beer size={32} className="text-yellow-500 mb-2" />
                         <span className="text-sm font-bold text-gray-200">酒館</span>
                       </button>
                    </div>
                </div>
            )}

            {settlementView === 'board' && (
                <div className="flex-1 bg-[#1a1815] p-6 overflow-y-auto flex flex-col items-center">
                   <h3 className="text-xl text-[#d4af37] font-bold border-b border-[#3c362a] w-full text-center pb-2 mb-6">城鎮合約</h3>
                   {activeContract ? (
                      <div className="bg-[#2a2722] p-6 border border-gray-600 rounded text-center w-full max-w-md">
                         <h4 className="text-lg text-red-400 font-bold mb-2">已承接合約</h4>
                         <p className="text-gray-300 mb-4">目標：{worldData.camps.find(c=>c.id === activeContract.targetCampId)?.name}</p>
                         <div className="text-yellow-500 font-mono text-xl">預期賞金：{activeContract.reward} 枚金幣</div>
                      </div>
                   ) : (
                      <div className="flex flex-col gap-4 w-full max-w-md">
                         {activeLocation?.contracts?.length > 0 ? activeLocation.contracts.map(contract => (
                            <div key={contract.id} className="bg-[#2a2722] p-4 border border-gray-600 rounded text-center hover:bg-[#333] cursor-pointer transition-colors" onClick={() => handleAcceptContract(contract)}>
                               <h4 className="text-lg text-orange-400 font-bold mb-1 flex justify-center items-center gap-2"><Sword size={18}/> 討伐 {'⭐'.repeat(contract.stars)}</h4>
                               <p className="text-sm text-gray-400 mb-3">消滅附近的 {contract.targetName}。</p>
                               <div className="text-yellow-500 font-mono text-sm font-bold mb-2">賞金：{contract.reward} 金幣</div>
                               <button className="bg-orange-800 hover:bg-orange-700 text-white px-6 py-1 rounded shadow text-sm font-bold">接取任務</button>
                            </div>
                         )) : <div className="text-gray-400 mt-10">目前沒有可用的合約。</div>}
                      </div>
                   )}
                </div>
            )}

            {settlementView === 'market' && (
                <div className="flex-1 bg-[#1a1815] p-6 overflow-y-auto flex flex-col">
                   <h3 className="text-xl text-[#d4af37] font-bold border-b border-[#3c362a] w-full text-center pb-2 mb-4 flex items-center justify-center gap-2 shrink-0">市場 <Coins size={16} className="text-yellow-500"/> {inventory.gold}</h3>
                   <div className="flex w-full gap-4 h-full">
                      <div className="flex-1 flex flex-col">
                         <div className="text-gray-400 text-sm font-bold mb-2 shrink-0">販售物品 (點擊購買)</div>
                         <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-2 content-start">
                            <div className="bg-[#2a2722] border border-gray-700 p-2 rounded flex justify-between items-center cursor-pointer hover:border-orange-400 transition-colors" onClick={() => { if(inventory.gold >= 40) setInventory(p => ({...p, gold: p.gold-40, food: p.food+20})); else showMessage('金幣不足'); }}>
                               <div className="flex items-center gap-2"><Drumstick size={24} className="text-orange-400 shrink-0"/> <div className="truncate"><div className="font-bold text-xs truncate text-gray-200">食物 (20點)</div><div className="text-yellow-500 text-[10px]">40 金幣</div></div></div>
                            </div>
                            <div className="bg-[#2a2722] border border-gray-700 p-2 rounded flex justify-between items-center cursor-pointer hover:border-orange-400 transition-colors" onClick={() => { if(inventory.gold >= 40) setInventory(p => ({...p, gold: p.gold-40, tools: p.tools+20})); else showMessage('金幣不足'); }}>
                               <div className="flex items-center gap-2"><Hammer size={24} className="text-gray-400 shrink-0"/> <div className="truncate"><div className="font-bold text-xs truncate text-gray-200">維修工具 (20點)</div><div className="text-yellow-500 text-[10px]">40 金幣</div></div></div>
                            </div>
                            {activeLocation?.market?.map((item, idx) => (
                               <div key={idx} onClick={() => handleBuyItem(item, idx)} className="bg-[#2a2722] border border-gray-700 p-2 rounded flex items-center gap-2 cursor-pointer hover:border-orange-400 transition-colors">
                                  <EquipIcon cat={item.category || item.type} className="w-6 h-6 text-gray-300 shrink-0"/>
                                  <div className="flex-1 truncate">
                                     <div className="font-bold text-xs text-gray-200 truncate" title={item.name}>{item.name}</div>
                                     <div className="text-yellow-500 text-[10px]">{item.price} 金幣</div>
                                  </div>
                               </div>
                            ))}
                         </div>
                      </div>
                      
                      <div className="w-px bg-gray-700 mx-2 shrink-0"></div>
                      
                      <div className="flex-1 flex flex-col">
                         <div className="text-gray-400 text-sm font-bold mb-2 shrink-0">您的庫存 (點擊半價售出)</div>
                         <div className="flex flex-wrap gap-1.5 overflow-y-auto content-start">
                            {Array.from({length: 40}).map((_, i) => {
                               const stashItem = displayStash[i];
                               return (
                                  <div key={i} onClick={() => {
                                     if (stashItem && !stashItem.isResource) handleSellItem(stashItem.stashIdx);
                                     else if (stashItem?.isResource) showMessage('無法在市場直接售出資源。');
                                  }} className={`w-12 h-12 bg-black/60 border ${stashItem && !stashItem.isResource ? 'border-gray-500 hover:border-red-400 cursor-pointer' : 'border-gray-800'} flex flex-col items-center justify-center relative transition-colors group`} title={stashItem && !stashItem.isResource ? `${stashItem.name} (賣出: ${Math.floor(stashItem.price*0.5)}金幣)` : (stashItem?.name || '')}>
                                     {stashItem && !stashItem.isResource && <EquipIcon cat={stashItem.category || stashItem.type} className="w-5 h-5 text-gray-300 group-hover:text-red-400 transition-colors"/>}
                                     {stashItem && stashItem.isResource && (stashItem.type === 'food' ? <Drumstick size={20} className="text-orange-400"/> : <Hammer size={20} className="text-gray-400"/>)}
                                     {stashItem && <span className="text-[9px] text-center w-full truncate px-0.5 text-gray-400 group-hover:text-white transition-colors absolute bottom-0 bg-black/50">{stashItem.isResource ? stashItem.count : stashItem.name}</span>}
                                  </div>
                               );
                            })}
                         </div>
                      </div>
                   </div>
                </div>
            )}

            {settlementView === 'tavern' && (
                <div className="flex-1 bg-[#1a1815] p-6 overflow-y-auto flex flex-col items-center">
                   <h3 className="text-xl text-[#d4af37] font-bold border-b border-[#3c362a] w-full text-center pb-2 mb-6 flex items-center justify-center gap-2">招募傭兵 <Coins size={16} className="text-yellow-500"/> {inventory.gold}</h3>
                   <div className="flex flex-col gap-3 w-full max-w-2xl">
                      {activeLocation?.recruits?.map(rec => (
                         <div key={rec.id} className="bg-[#2a2722] border border-gray-700 p-3 rounded flex justify-between items-center">
                            <div className="flex items-center gap-4">
                               <div className="w-12 h-12 bg-black/50 border border-gray-600 flex items-center justify-center"><UIPixelSprite type={rec.sprite} size={32}/></div>
                               <div>
                                  <div className="font-bold text-orange-200">{rec.name}</div>
                                  <div className="text-xs text-gray-400">近戰技能: {rec.combat.mSkill} | HP: {rec.stats.hp} | 行動點數: {rec.stats.apMax}</div>
                               </div>
                            </div>
                            <button onClick={() => handleRecruit(rec)} className="bg-blue-900 hover:bg-blue-800 border border-blue-500 px-4 py-2 rounded text-sm font-bold flex items-center gap-1"><UserPlus size={16}/> {rec.price} 金幣</button>
                         </div>
                      ))}
                   </div>
                </div>
            )}

            <div className="bg-[#1e1c18] border-t-2 border-[#111] p-4 flex justify-center shrink-0 z-10 relative gap-4">
               {settlementView && <button onClick={() => setSettlementView(null)} className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow transition-all cursor-pointer">返回</button>}
               <button onClick={() => { setActiveLocation(null); setSettlementView(null); setGameState(GAME_STATE.WORLD); }} className="px-16 py-3 bg-[#2a1a10] hover:bg-[#3c2517] border border-[#5c3a21] text-gray-200 font-extrabold tracking-widest rounded shadow-[0_0_15px_rgba(0,0,0,0.8)] transition-all cursor-pointer">離開</button>
            </div>
         </div>
      </div>
    );
  }

  if (gameState === GAME_STATE.BATTLE && battleData) {
    const { map, characters, combatLogs, selectedSkillId, hoverHex, turnQueue, round, viewedCharId } = battleData;
    
    const activeCharId = turnQueue[0];
    const activeChar = characters.find(c => c.id === activeCharId);
    const displayChar = viewedCharId ? characters.find(c => c.id === viewedCharId) : activeChar;

    let previewApCost = 0;
    if (hoverHex && activeChar?.team === 'player' && displayChar?.id === activeChar.id) {
       const hexId = `${hoverHex.row}-${hoverHex.col}`;
       const hoveredEnemy = characters.find(c => c.row === hoverHex.row && c.col === hoverHex.col && c.team !== 'player');
       
       if (selectedSkillId && hoveredEnemy) {
          const skillObj = SKILLS_DB[selectedSkillId];
          if (skillObj && getHexDistance(activeChar.row, activeChar.col, hoveredEnemy.row, hoveredEnemy.col) <= skillObj.range) {
             previewApCost = skillObj.ap;
          }
       } else if (!selectedSkillId && !characters.find(c => c.row === hoverHex.row && c.col === hoverHex.col)) {
          if (reachableTiles[hexId]) previewApCost = reachableTiles[hexId].ap;
       }
    }

    const handleBattleEndTurn = () => {
      let newQueue = [...turnQueue];
      newQueue.shift(); 
      let nextState = { ...battleData, selectedSkillId: null, viewedCharId: null };

      if (newQueue.length === 0 && characters.some(c => c.team === 'enemy') && characters.some(c => c.team === 'player')) {
         const { updatedChars, queue } = generateTurnQueue(characters);
         nextState.characters = updatedChars; nextState.turnQueue = queue; nextState.round = round + 1;
      } else { nextState.turnQueue = newQueue; }
      setBattleData(nextState);
    };

    const handleBattleHexClick = (row, col) => {
      if (battleDrag.moved || !activeChar) return; 
      
      const clickedChar = characters.find(c => c.row === row && c.col === col);
      if (!selectedSkillId && clickedChar) { setBattleData(prev => ({ ...prev, viewedCharId: clickedChar.id })); return; }

      if (selectedSkillId && activeChar.team === 'player') {
        const skillObj = SKILLS_DB[selectedSkillId];
        if (clickedChar && clickedChar.team !== 'player') {
          if (activeChar.stats.ap < skillObj.ap || (activeChar.stats.fat + skillObj.fat) > activeChar.stats.fatMax) return setBattleData(p => ({ ...p, combatLogs: [`AP 或 疲勞值不足！`, ...p.combatLogs].slice(0, 2) }));
          if (skillObj.oncePerTurn && activeChar.turnUsedSkills?.includes(selectedSkillId)) return setBattleData(p => ({ ...p, combatLogs: [`${skillObj.name} 每回合限一次！`, ...p.combatLogs].slice(0, 2) }));
          
          const hitChance = calculateHitChance(activeChar, clickedChar, skillObj);
          if (hitChance <= 0) return setBattleData(p => ({ ...p, combatLogs: [`目標超出射程！`, ...p.combatLogs].slice(0, 2) }));

          const roll = Math.floor(Math.random() * 100) + 1;
          let logMsg = `${activeChar.name} 消耗 ${skillObj.ap} AP 對 ${clickedChar.name} 發動 ${skillObj.name}... (${hitChance}%, 骰出 ${roll}) => `;
          
          let newChars = [...characters]; let newQueue = [...turnQueue];
          const atkIdx = newChars.findIndex(c => c.id === activeChar.id);
          
          if (skillObj.oncePerTurn) {
              if (!newChars[atkIdx].turnUsedSkills) newChars[atkIdx].turnUsedSkills = [];
              newChars[atkIdx].turnUsedSkills.push(selectedSkillId);
          }
          newChars[atkIdx].stats.ap -= skillObj.ap; newChars[atkIdx].stats.fat += skillObj.fat;

          let newLoot = [...(battleData.loot || [])];

          if (roll <= hitChance) {
            if (skillObj.isStatus) {
                if (selectedSkillId === 'web') {
                    const tIdx = newChars.findIndex(c => c.id === clickedChar.id);
                    newChars[tIdx].statuses = { ...newChars[tIdx].statuses, webbed: 3 };
                    logMsg += `成功束縛目標！`;
                }
            } else {
                const isHeadshot = Math.floor(Math.random() * 100) + 1 <= (activeChar.combat?.headshot || 25);
                logMsg += isHeadshot ? `【爆頭！】` : `命中！`;

                const wpn = activeChar.weapon;
                const baseDmg = skillObj.overrides ? rnd(skillObj.overrides.dmgMin, skillObj.overrides.dmgMax) : rnd(wpn?.min || 5, wpn?.max || 10);
                let armorDmg = Math.floor(baseDmg * (skillObj.overrides ? skillObj.overrides.armorEff : (wpn?.armorEff || 0.5)));
                let hpDmgBase = Math.floor(baseDmg * (skillObj.overrides ? skillObj.overrides.armorPen : (wpn?.armorPen || 0.1)));

                const targetChar = newChars.find(c => c.id === clickedChar.id);
                let currentArmor = isHeadshot ? targetChar.stats.armHead : targetChar.stats.armBody;
                
                let actualArmorDmg = armorDmg; let remainingArmor = currentArmor - armorDmg;
                if (remainingArmor < 0) { actualArmorDmg = currentArmor; remainingArmor = 0; }

                let hpDmg = hpDmgBase - Math.floor(remainingArmor * 0.1);
                if (remainingArmor === 0 && actualArmorDmg < armorDmg) {
                   const extra = Math.floor(baseDmg * (1 - (skillObj.overrides ? skillObj.overrides.armorPen : (wpn?.armorPen || 0.1)))) - actualArmorDmg;
                   if (extra > 0) hpDmg += extra;
                }
                if (hpDmg < 0) hpDmg = 0;
                if (isHeadshot) hpDmg = Math.floor(hpDmg * 1.5);

                logMsg += `造成 ${actualArmorDmg} 護甲與 ${hpDmg} 生命傷害。`;

                if (isHeadshot) targetChar.stats.armHead = remainingArmor; else targetChar.stats.armBody = remainingArmor;
                targetChar.stats.hp -= hpDmg;

                if (activeChar.perks?.includes('poisonWeapons') && hpDmg >= 6) { targetChar.statuses = { ...targetChar.statuses, poison: 3 }; logMsg += ` 並中毒！`; }

                if (targetChar.stats.hp <= 0) {
                   if (targetChar.perks?.includes('undead') && Math.random() < 0.5) {
                       targetChar.stats.hp = Math.floor(targetChar.stats.hpMax * 0.5);
                       targetChar.stats.ap = 0; 
                       logMsg += ` ${targetChar.name} 倒下後又再度站起！`;
                   } else {
                       logMsg += ` ${targetChar.name} 被擊殺！`;
                       newChars[atkIdx].stats.exp = (newChars[atkIdx].stats.exp || 0) + (targetChar.stats.expValue || 0); 
                       
                       if (targetChar.team === 'enemy') {
                           if (targetChar.beastType === 'direwolf') {
                               if (Math.random() < 0.9) newLoot.push({...LOOT_DB.animal_hide});
                               if (Math.random() < 0.1) newLoot.push({...LOOT_DB.wolf_blood});
                           } else if (targetChar.beastType === 'serpent') {
                               if (Math.random() < 0.6) newLoot.push({...LOOT_DB.animal_hide});
                               if (Math.random() < 0.4) newLoot.push({...LOOT_DB.slime});
                           } else if (targetChar.beastType === 'spider') {
                               if (Math.random() < 0.6) newLoot.push({...LOOT_DB.silk});
                               if (Math.random() < 0.4) newLoot.push({...LOOT_DB.slime});
                           } else {
                               if (targetChar.weapon && Math.random() > 0.3) newLoot.push({...targetChar.weapon});
                               if (targetChar.headItem && Math.random() > 0.3) newLoot.push({...targetChar.headItem, armor: Math.max(1, Math.floor((targetChar.headItem.armorMax || targetChar.headItem.armor) * rnd(20, 60)/100))});
                               if (targetChar.bodyItem && Math.random() > 0.3) newLoot.push({...targetChar.bodyItem, armor: Math.max(1, Math.floor((targetChar.bodyItem.armorMax || targetChar.bodyItem.armor) * rnd(20, 60)/100))});
                           }
                       }
                       newChars = newChars.filter(c => c.id !== targetChar.id);
                       newQueue = newQueue.filter(id => id !== targetChar.id); 
                   }
                }
                const tidx2 = newChars.findIndex(c=>c.id === targetChar.id);
                if (tidx2 !== -1) newChars[tidx2] = targetChar;
            }
          } else { logMsg += `未命中。`; }

          setBattleData(prev => ({ ...prev, characters: newChars, turnQueue: newQueue, selectedSkillId: null, viewedCharId: null, combatLogs: [logMsg, ...prev.combatLogs].slice(0,2), loot: newLoot }));
        }
        setBattleData(prev => ({ ...prev, selectedSkillId: null }));
        return;
      }

      if (!clickedChar && activeChar.team === 'player') {
        const hexId = `${row}-${col}`; const reachInfo = reachableTiles[hexId];
        if (reachInfo) setBattleData(prev => ({ ...prev, viewedCharId: null, characters: prev.characters.map(c => c.id === activeChar.id ? { ...c, row, col, stats: { ...c.stats, ap: c.stats.ap - reachInfo.ap, fat: c.stats.fat + reachInfo.fat } } : c) }));
      }
    };

    return (
      <div className="w-full h-screen bg-neutral-900 flex flex-col font-sans select-none text-gray-100 overflow-hidden">
        {renderToastMessage()}
        <div className="absolute top-0 left-0 w-full p-2 flex flex-col items-center pointer-events-none z-10 space-y-1">
          <div className={`px-8 py-1 text-lg font-bold tracking-widest rounded shadow border bg-black/80 ${activeChar?.team === 'player' ? 'text-blue-400 border-blue-500/50' : 'text-red-400 border-red-500/50'}`}>
            {activeChar?.team === 'player' ? 'PLAYER TURN' : 'ENEMY TURN'} - Round {round}
          </div>
          <div className="pt-2 flex flex-col items-center space-y-1">
            {combatLogs.map((log, idx) => ( <div key={idx} className="bg-black/70 px-4 py-1 text-sm rounded border border-white/10 shadow drop-shadow-md transition-opacity" style={{ opacity: 1 - idx * 0.5 }}>{log}</div> ))}
          </div>
        </div>

        <div className="flex-1 bg-[#1a1c17] flex items-center justify-center relative cursor-grab active:cursor-grabbing overflow-hidden"
          onMouseDown={(e) => setBattleDrag({ isDragging: true, startX: e.clientX, startY: e.clientY, lastCamX: battleCam.x, lastCamY: battleCam.y, moved: false })}
          onMouseMove={(e) => { if (!battleDrag.isDragging) return; const dx = e.clientX - battleDrag.startX, dy = e.clientY - battleDrag.startY; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) setBattleDrag(p => ({ ...p, moved: true })); setBattleCam({ x: battleDrag.lastCamX + dx, y: battleDrag.lastCamY + dy }); }}
          onMouseUp={() => setBattleDrag(p => ({ ...p, isDragging: false }))} onMouseLeave={() => setBattleDrag(p => ({ ...p, isDragging: false, hoverHex: null }))} onDragStart={(e) => e.preventDefault()}
        >
           <svg width={(BATTLE_COLS + 2) * HEX_WIDTH} height={(BATTLE_ROWS + 2) * HEX_HEIGHT * 0.75} className="will-change-transform" style={{ transform: `translate(${battleCam.x}px, ${battleCam.y}px) scale(1.25)` }} overflow="visible">
             <g transform={`translate(${HEX_WIDTH}, ${HEX_HEIGHT / 2})`}>
               {map.map(hex => {
                 const { x, y } = hexToPixel(hex.row, hex.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2; const hexId = `${hex.row}-${hex.col}`;
                 const fill = hex.terrain === 'highland' ? '#5c3a21' : '#5b8c34'; const stroke = hex.terrain === 'highland' ? '#382212' : '#3f6323';
                 const isReachable = activeChar?.team === 'player' && !selectedSkillId && reachableTiles[hexId] !== undefined;
                 const hoveredEnemy = characters.find(c => c.row === hex.row && c.col === hex.col && c.team !== 'player');
                 let showHitChance = null; if (selectedSkillId && hoveredEnemy && hoverHex && hoverHex.row === hex.row && hoverHex.col === hex.col) showHitChance = calculateHitChance(activeChar, hoveredEnemy, SKILLS_DB[selectedSkillId]);

                 return (
                   <g key={hex.id} onClick={(e) => { e.stopPropagation(); handleBattleHexClick(hex.row, hex.col); }} onMouseEnter={() => setBattleData(p => ({...p, hoverHex: {row: hex.row, col: hex.col}}))} className="cursor-pointer group">
                     <polygon points={getHexPoints(cx, cy, HEX_SIZE - 1)} fill={fill} stroke={stroke} strokeWidth="2" className="group-hover:fill-white/10" />
                     {isReachable && (
                       <>
                         <polygon points={getHexPoints(cx, cy, HEX_SIZE - 2)} fill="rgba(250, 204, 21, 0.15)" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 2" style={{ pointerEvents: 'none' }} />
                         <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="central" fill="#fcd34d" fontSize="10" fontWeight="bold" style={{ pointerEvents: 'none', textShadow: '1px 1px 2px black' }}>-{reachableTiles[hexId].ap} AP</text>
                         <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="central" fill="#60a5fa" fontSize="9" fontWeight="bold" style={{ pointerEvents: 'none', textShadow: '1px 1px 2px black' }}>-{reachableTiles[hexId].fat} FAT</text>
                       </>
                     )}
                     {showHitChance !== null && (
                        <>
                          <polygon points={getHexPoints(cx, cy, HEX_SIZE - 2)} fill="rgba(239, 68, 68, 0.3)" stroke="#ef4444" strokeWidth="2" style={{ pointerEvents: 'none' }} />
                          <text x={cx} y={cy - 14} textAnchor="middle" dominantBaseline="central" fill="#fca5a5" fontSize="12" fontWeight="bold" style={{ pointerEvents: 'none', textShadow: '1px 1px 2px black' }}>{showHitChance}%</text>
                          <text x={cx} y={cy + 4} textAnchor="middle" dominantBaseline="central" fill="#fcd34d" fontSize="10" fontWeight="bold" style={{ pointerEvents: 'none', textShadow: '1px 1px 2px black' }}>-{SKILLS_DB[selectedSkillId].ap} AP</text>
                          <text x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="central" fill="#60a5fa" fontSize="10" fontWeight="bold" style={{ pointerEvents: 'none', textShadow: '1px 1px 2px black' }}>-{SKILLS_DB[selectedSkillId].fat} FAT</text>
                        </>
                     )}
                   </g>
                 );
               })}
               {characters.map(char => {
                  const { x, y } = hexToPixel(char.row, char.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2;
                  return (
                    <g key={char.id} onClick={(e) => { e.stopPropagation(); handleBattleHexClick(char.row, char.col); }} className="cursor-pointer transition-transform hover:scale-110" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                      {char.id === activeChar?.id && <circle cx={cx} cy={cy} r={HEX_SIZE * 0.8} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 2" className="animate-spin-slow" />}
                      {char.id === displayChar?.id && char.id !== activeChar?.id && <circle cx={cx} cy={cy} r={HEX_SIZE * 0.75} fill="none" stroke="#fcd34d" strokeWidth="2" strokeDasharray="2 4" />}
                      <ellipse cx={cx} cy={cy + 8} rx={16} ry={6} fill="rgba(0,0,0,0.6)" />
                      <MapPixelSprite type={char.sprite} x={cx - 16} y={cy - 24} size={32} />
                      <circle cx={cx - 14} cy={cy + 8} r={4} fill={char.team === 'player' ? '#3b82f6' : '#ef4444'} stroke="#1f2937" strokeWidth="1" />
                      <rect x={cx - 10} y={cy + 12} width="20" height="3" fill="#374151" />
                      <rect x={cx - 10} y={cy + 12} width={20 * (char.stats.hp / char.stats.hpMax)} height="3" fill="#ef4444" />
                    </g>
                  );
               })}
             </g>
           </svg>
        </div>

        <div className="h-48 bg-[#111] border-t border-gray-700 flex p-2 gap-4 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] z-20">
          <div className="w-[340px] bg-black/40 border border-gray-800 p-2 flex flex-col gap-2 rounded relative shrink-0 overflow-y-auto">
            <div className={`font-bold text-base border-b border-gray-700 pb-1 px-1 flex justify-between items-center ${displayChar?.team === 'enemy' ? 'text-red-400' : 'text-orange-400'}`}>
              <span className="truncate pr-2">{displayChar?.name || '無'}</span>
              {displayChar && <span className="text-xs text-yellow-500 bg-black/50 px-2 py-0.5 rounded font-mono shrink-0">裝備: {displayChar?.weapon?.name || '空'}</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
               <StatRow icon="❤️" label="HP" val={displayChar?.stats.hpMax} color="text-red-500" />
               <StatRow icon="💧" label="疲勞值" val={displayChar?.stats.fatMax} color="text-blue-400" />
               <StatRow icon="⚡" label="先攻值" val={getDynamicIni(displayChar)} color="text-yellow-500" />
               
               <div className="flex justify-between items-center bg-black/40 px-2 py-1.5 border border-white/5 w-full rounded">
                  <span className="text-gray-400 flex items-center gap-1 w-[100px] shrink-0">
                     <span className="text-gray-400">👟</span> <span className="truncate text-xs">行動點數</span>
                  </span>
                  <div className="flex-1 flex gap-[2px] h-3 mr-2">
                    {Array.from({ length: displayChar?.stats.apMax || 9 }).map((_, i) => {
                       const isAvailable = i < (displayChar?.stats.ap || 0);
                       const isConsumed = isAvailable && i >= ((displayChar?.stats.ap || 0) - previewApCost);
                       return (
                           <div key={i} className={`flex-1 rounded-[1px] transition-colors ${isConsumed ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.8)] animate-pulse' : isAvailable ? 'bg-orange-500 shadow-[0_0_2px_rgba(249,115,22,0.5)]' : 'bg-gray-700 opacity-50'}`}></div>
                       );
                    })}
                  </div>
                  <span className="font-mono text-right text-sm">{displayChar?.stats.ap}</span>
               </div>

               <StatRow icon="⚔️" label="近戰技能" val={getDynamicMSkill(displayChar)} />
               <StatRow icon="🛡️" label="近戰防禦" val={getDynamicMDef(displayChar)} />
               <StatRow icon="🏹" label="遠程技能" val={displayChar?.combat.rSkill} />
               <StatRow icon="🛡️" label="遠程防禦" val={getDynamicRDef(displayChar)} />
               <StatRow icon="🪖" label="頭部護甲" val={`${displayChar?.stats.armHead}/${displayChar?.stats.armHeadMax}`} />
               <StatRow icon="🛡️" label="身體護甲" val={`${displayChar?.stats.armBody}/${displayChar?.stats.armBodyMax}`} />
            </div>
          </div>

          <div className="flex items-end pb-2 gap-6 pl-4 flex-1">
            <div className="flex gap-1 mb-2 bg-black/30 p-1 rounded border border-white/5">
              {activeChar?.skills?.map((skillId, idx) => {
                const skill = SKILLS_DB[skillId]; if (!skill) return null;
                const Icon = skill.icon; const isSelected = selectedSkillId === skillId;
                return (
                  <button key={idx} onClick={() => setBattleData(p => ({...p, selectedSkillId: isSelected ? null : skillId}))} disabled={activeChar.team !== 'player'}
                    className={`w-14 h-14 border flex items-center justify-center transition-all relative group cursor-pointer ${isSelected ? 'bg-orange-800/80 border-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.5)]' : 'bg-gradient-to-b from-gray-700 to-gray-900 border-gray-600 hover:border-gray-300'} ${activeChar.team !== 'player' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <Icon size={28} className={isSelected ? 'text-white' : 'text-gray-300'} /><span className="absolute bottom-0 right-1 text-[10px] text-gray-400">{idx + 1}</span>
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-32 bg-black/90 text-white text-xs p-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-50 border border-gray-600">
                      <div className="font-bold text-orange-300">{skill.name}</div><div className="text-gray-400 mt-1">AP: {skill.ap} | 疲勞: {skill.fat}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-64 flex flex-col items-end justify-between pb-2 pr-2 pl-2 shrink-0">
            <div className="flex gap-1 flex-wrap justify-end pointer-events-auto bg-black/60 p-1 rounded border border-gray-700 backdrop-blur-sm shadow-xl mb-2">
               {turnQueue.map((id, idx) => {
                  const c = characters.find(char => char.id === id); if (!c) return null; const isCurrent = idx === 0;
                  return (
                    <div key={`${id}-${idx}`} title={`${c.name} (先攻值: ${getDynamicIni(c)})`} 
                         className={`w-9 h-9 md:w-10 md:h-10 border-2 flex items-center justify-center bg-black/80 transition-all ${isCurrent ? 'scale-110 border-orange-400 z-10' : 'border-gray-700 opacity-70'} ${c.team === 'player' ? 'shadow-[inset_0_0_8px_rgba(59,130,246,0.5)]' : 'shadow-[inset_0_0_8px_rgba(239,68,68,0.5)]'}`}>
                       <UIPixelSprite type={c.sprite} size={26} />
                    </div>
                  );
               })}
            </div>
            <button onClick={handleBattleEndTurn} className={`px-8 py-2 text-white font-bold text-sm border rounded shadow-lg transition-colors active:scale-95 cursor-pointer ${activeChar?.team === 'player' ? 'bg-gray-600 hover:bg-gray-500 border-gray-400' : 'bg-red-900 hover:bg-red-800 border-red-600 animate-pulse'}`}>End Turn</button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === GAME_STATE.INVENTORY) {
    const activeChar = roster.find(c => c.id === selectedRosterId) || roster[0];
    const lvlData = getLevelData(activeChar?.stats.exp || 0);

    const displayStash = [];
    if (inventory.food > 0) displayStash.push({ isResource: true, type: 'food', name: '食物 (20點)', count: inventory.food });
    if (inventory.tools > 0) displayStash.push({ isResource: true, type: 'tools', name: '維修工具 (20點)', count: inventory.tools });
    inventory.stash?.forEach((item, idx) => displayStash.push({ ...item, stashIdx: idx }));

    return (
      <div className="w-full h-screen bg-[#111] flex font-sans select-none text-gray-100 overflow-hidden p-2 gap-2 relative">
        <button onClick={() => setGameState(GAME_STATE.WORLD)} className="absolute top-4 right-4 z-50 text-gray-400 hover:text-white bg-black/50 hover:bg-red-900/80 p-2 border border-gray-700 rounded transition-colors cursor-pointer" title="返回世界地圖"><X size={24} /></button>
        {renderToastMessage()}

        {levelUpState && (
           <div className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center">
              <div className="bg-[#2a2722] border-4 border-[#d4af37] p-5 rounded-lg w-96 max-h-[90vh] overflow-y-auto shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                 <h2 className="text-xl font-extrabold text-[#d4af37] text-center mb-2 tracking-widest border-b border-[#d4af37]/30 pb-2">等級提升！</h2>
                 <p className="text-sm text-gray-400 text-center mb-3">請選擇 <span className="text-yellow-400 font-bold">{3 - levelUpState.selected.length}</span> 項屬性進行強化</p>
                 <div className="flex flex-col gap-1.5 mb-4">
                    {[ {k:'hp', n:'最大生命值 (HP)'}, {k:'fat', n:'最大疲勞值 (Fatigue)'}, {k:'mSkill', n:'近戰技能 (Melee Skill)'}, 
                       {k:'rSkill', n:'遠程技能 (Ranged Skill)'}, {k:'mDef', n:'近戰防禦 (Melee Def)'}, {k:'rDef', n:'遠程防禦 (Ranged Def)'}, {k:'ini', n:'先攻值 (Initiative)'} 
                    ].map(({k, n}) => {
                       const isSelected = levelUpState.selected.includes(k);
                       const val = levelUpState.rolls[k];
                       return (
                          <div key={k} onClick={() => { if (isSelected) setLevelUpState(p => ({...p, selected: p.selected.filter(x=>x!==k)})); else if (levelUpState.selected.length < 3) setLevelUpState(p => ({...p, selected: [...p.selected, k]})); }}
                               className={`flex justify-between items-center p-2 border-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-orange-900/60 border-orange-500' : 'bg-black/40 border-gray-700 hover:border-gray-500'}`}
                          >
                             <span className={`text-sm ${isSelected ? 'text-white font-bold' : 'text-gray-300'}`}>{n}</span>
                             <span className={`font-mono font-bold ${isSelected ? 'text-green-400' : 'text-gray-500'}`}>+{val}</span>
                          </div>
                       );
                    })}
                 </div>
                 <button onClick={confirmLevelUp} disabled={levelUpState.selected.length !== 3} className="w-full py-2 bg-gradient-to-b from-orange-700 to-orange-900 hover:from-orange-600 hover:to-orange-800 disabled:opacity-50 text-white font-bold tracking-widest rounded shadow border border-orange-500 transition-all cursor-pointer">
                    確認升級
                 </button>
              </div>
           </div>
        )}

        <div className="w-[380px] bg-[#2a2722] border-2 border-[#3c362a] flex flex-col p-3 shadow-xl overflow-y-auto shrink-0">
           <div className="flex gap-3 items-center border-b border-[#3c362a] pb-3 mb-3">
              <div className="w-20 h-20 bg-[#1a1c17] border border-[#3c362a] flex items-center justify-center shadow-inner shrink-0">
                 <UIPixelSprite type={activeChar?.sprite} size={56} />
              </div>
              <div className="flex-1 pr-2">
                 <div className="flex items-center justify-between gap-1">
                     {activeChar?.team === 'player' ? (
                        <input type="text" value={activeChar.name} onChange={(e) => { const newName = e.target.value; setRoster(prev => prev.map(c => c.id === activeChar.id ? { ...c, name: newName } : c)); }} className="bg-black/30 border-b border-dashed border-[#d4af37]/50 text-[#d4af37] font-bold text-lg uppercase tracking-wider focus:outline-none focus:border-[#d4af37] focus:bg-black/60 w-full px-1 py-0.5 rounded-t transition-colors" title="點擊修改傭兵名稱" />
                     ) : ( <div className="text-[#d4af37] font-bold text-lg uppercase tracking-wider px-1 py-0.5">{activeChar?.name}</div> )}
                     
                     {(activeChar?.levelUps > 0) && (
                        <button onClick={() => openLevelUp(activeChar)} className="bg-yellow-600 hover:bg-yellow-500 text-black text-xs font-extrabold px-2 py-1 rounded shadow-md shrink-0 animate-pulse flex items-center gap-1 cursor-pointer">
                           <ChevronUp size={14}/> 升級!
                        </button>
                     )}
                 </div>
                 <div className="text-xs text-gray-400 flex justify-between mt-2 px-1"><span>Level {lvlData.level}</span><span>{activeChar?.stats.exp || 0} / {lvlData.nextExpTotal}</span></div>
                 <div className="w-full h-2.5 bg-black mt-1 border border-gray-700 shadow-inner"><div className="h-full bg-[#d4af37]" style={{ width: `${Math.min(100, ((activeChar?.stats.exp || 0) / lvlData.nextExpTotal) * 100)}%` }}></div></div>
              </div>
           </div>
           
           <div className="h-64 flex justify-center items-center py-2 bg-black/20 rounded border border-[#3c362a]">
              <div className="grid grid-cols-3 gap-2">
                 <div className="w-16 h-16"></div> 
                 <div onClick={() => handleUnequip('head')} className="w-16 h-16 bg-black/50 border border-[#3c362a] flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-white/10 relative group" title={activeChar?.headItem?.name || '無'}>
                    <EquipIcon cat="head" className={`w-8 h-8 mb-1 transition-colors ${activeChar?.headItem ? 'text-orange-300' : 'opacity-40'}`} />
                    <span className="font-bold text-[10px] leading-none z-10 truncate w-full text-center px-1 group-hover:text-red-400">{activeChar?.headItem ? '卸下' : '頭部防具'}</span>
                 </div>
                 <div className="w-16 h-16 bg-black/50 border border-[#3c362a] flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-white/10 relative"><EquipIcon cat="accessory"/><span className="font-bold text-[10px] leading-none z-10">配件</span></div>
                 
                 <div onClick={() => handleUnequip('weapon')} className="w-16 h-16 bg-black/50 border border-[#3c362a] flex flex-col items-center justify-center text-gray-400 break-words text-center cursor-pointer hover:bg-white/10 relative group" title={activeChar?.weapon?.name || '無'}>
                    <EquipIcon cat={activeChar?.weapon?.category || '1h_sword'} className={`w-8 h-8 mb-1 transition-colors ${activeChar?.weapon ? 'text-orange-300' : 'opacity-40'}`}/>
                    <span className="font-bold text-[10px] leading-none z-10 truncate w-full text-center px-1 group-hover:text-red-400">{activeChar?.weapon ? '卸下' : '武器'}</span>
                 </div>
                 
                 <div onClick={() => handleUnequip('body')} className="w-16 h-24 bg-black/50 border border-[#3c362a] flex flex-col items-center justify-center text-gray-400 row-span-2 cursor-pointer hover:bg-white/10 relative group" title={activeChar?.bodyItem?.name || '無'}>
                    <EquipIcon cat="body" className={`w-8 h-8 mt-2 transition-colors ${activeChar?.bodyItem ? 'text-orange-300' : 'opacity-40'}`}/>
                    <span className="font-bold text-[10px] leading-none z-10 mt-2 truncate w-full text-center px-1 group-hover:text-red-400">{activeChar?.bodyItem ? '卸下' : '身體防具'}</span>
                 </div>
                 
                 <div className="w-16 h-16 bg-black/50 border border-[#3c362a] flex flex-col items-center justify-center text-gray-400 relative">
                    <EquipIcon cat="shield"/><span className="font-bold text-[10px] leading-none z-10">副手</span>
                 </div>
                 
                 <div className="w-16 h-16"></div> 
                 <div className="w-16 h-16 flex items-start justify-end p-1">
                    <button onClick={handleRepairAll} className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white rounded shadow-md transition-colors cursor-pointer group" title="一鍵修復所有裝備">
                        <Wrench size={14} className="text-gray-300 group-hover:text-white"/>
                    </button>
                 </div>
              </div>
           </div>

           <div className="bg-[#1e1c18] border border-[#3c362a] p-2 mt-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1.5 shadow-inner">
              <StatRow icon="❤️" label="HP" val={activeChar?.stats.hpMax} color="text-red-500" />
              <StatRow icon="💧" label="疲勞值" val={activeChar?.stats.fatMax} color="text-blue-400" />
              <StatRow icon="⚡" label="先攻值" val={getDynamicIni(activeChar)} color="text-yellow-500" />
              <StatRow icon="👟" label="行動點數" val={activeChar?.stats.apMax} />
              <StatRow icon="⚔️" label="近戰技能" val={getDynamicMSkill(activeChar)} />
              <StatRow icon="🛡️" label="近戰防禦" val={getDynamicMDef(activeChar)} />
              <StatRow icon="🏹" label="遠程技能" val={activeChar?.combat.rSkill} />
              <StatRow icon="🛡️" label="遠程防禦" val={getDynamicRDef(activeChar)} />
              <StatRow icon="🪖" label="頭部護甲" val={`${activeChar?.stats.armHead}/${activeChar?.stats.armHeadMax}`} />
              <StatRow icon="🛡️" label="身體護甲" val={`${activeChar?.stats.armBody}/${activeChar?.stats.armBodyMax}`} />
           </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
           <div className="flex gap-1 justify-center items-end shrink-0 mb-1 w-full px-2">
              <div className="flex gap-1">
                 <button className="bg-[#d4af37] text-black font-extrabold tracking-widest px-8 py-1.5 rounded-t border-2 border-b-0 border-[#ca8a04]">Stash</button>
                 <button className="bg-[#2a2722] text-gray-500 font-bold tracking-widest px-8 py-1.5 rounded-t border-2 border-b-0 border-[#3c362a] cursor-not-allowed">Perks</button>
              </div>
           </div>
           
           <div className="flex-1 min-h-[150px] bg-[#1a1815] border-2 border-[#3c362a] p-4 flex content-start flex-wrap gap-1.5 overflow-y-auto shadow-inner relative">
              {Array.from({length: 40}).map((_, i) => {
                 const stashItem = displayStash[i];
                 return (
                    <div key={i} onClick={() => { if (stashItem && !stashItem.isResource) handleEquip(stashItem.stashIdx); }} className={`w-14 h-14 bg-black/60 border ${stashItem && !stashItem.isResource ? 'border-gray-500 hover:border-yellow-400 cursor-pointer' : 'border-gray-800'} flex flex-col items-center justify-center relative transition-colors group`} title={stashItem && !stashItem.isResource ? `點擊裝備: ${stashItem.name}` : (stashItem?.name || '')}>
                       {stashItem && !stashItem.isResource && <EquipIcon cat={stashItem.category || stashItem.type} className="w-6 h-6 text-gray-300 group-hover:text-yellow-400 transition-colors"/>}
                       {stashItem && stashItem.isResource && (stashItem.type === 'food' ? <Drumstick size={28} className="text-orange-400"/> : <Hammer size={28} className="text-gray-400"/>)}
                       {stashItem && <span className="text-[10px] text-center w-full truncate px-0.5 text-gray-400 group-hover:text-white transition-colors absolute bottom-0 bg-black/80">{stashItem.isResource ? stashItem.count : stashItem.name}</span>}
                    </div>
                 );
              })}
           </div>

           <div className="min-h-[280px] bg-[#1a1815] border-2 border-[#3c362a] p-4 shadow-inner flex flex-col shrink-0">
              <div className="flex justify-between items-end text-sm text-[#d4af37] font-bold mb-3 border-b border-[#3c362a] pb-1 shrink-0">
                 <span className="text-gray-300">傭兵編隊 (Roster)</span>
                 <span className="flex items-center gap-1"><Users size={16} /> {roster.length} / 12</span>
              </div>
              
              <div className="grid grid-cols-6 gap-2 w-full">
                 {roster.map(char => (
                    <div key={char.id} onClick={() => setSelectedRosterId(char.id)} className={`h-24 border-2 flex flex-col items-center justify-between py-1 cursor-pointer transition-all relative shrink-0 ${selectedRosterId === char.id ? 'border-[#d4af37] bg-[#3a2f1c] shadow-[0_0_10px_rgba(212,175,55,0.3)]' : 'border-[#3c362a] bg-[#2a2722] hover:border-gray-500 hover:bg-[#333]'}`}>
                       <div className="absolute top-1 left-1 opacity-50"><Shield size={12} color="#fff"/></div>
                       {(char.levelUps > 0) && <div className="absolute top-1 right-1 text-yellow-500 animate-pulse"><ChevronUp size={16}/></div>}
                       <div className="flex-1 flex items-center justify-center"><UIPixelSprite type={char.sprite} size={48} /></div>
                       <div className="w-full bg-black/50 text-center text-[10px] truncate px-1 border-t border-black/30">{char.name}</div>
                    </div>
                 ))}
                 
                 {Array.from({length: 12 - roster.length}).map((_, i) => (
                    <div key={`empty-${i}`} className="h-24 border-2 border-[#222] bg-[#111] flex items-center justify-center opacity-30 shrink-0">
                       <Users size={24} className="text-gray-700" />
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    );
  }

  return null;
}
