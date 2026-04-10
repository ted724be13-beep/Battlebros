// src/App.jsx
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { GAME_STATE, WORLD_ROWS, WORLD_COLS, NOBLE_HOUSES, createChar, rnd } from './constants';
import WorldMap from './WorldMap';
import BattleScene from './BattleScene';

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

  // ==========================================
  // 手動存檔系統 (匯出/匯入 JSON 檔案)
  // ==========================================
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
      } catch (error) { showMessage('❌ 讀取失敗：格式錯誤'); }
      event.target.value = null; 
    };
    reader.readAsText(file);
  };

  const handleStartGame = () => {
    if (!companyName.trim()) return;
    const initialRoster = [
      createChar('p1', '劍士', 'swordsman', 100, 65, 70, 70, 30, 15, 10, 'NasalHelmet', 'MailHauberk', 'ArmingSword'),
      createChar('p2', '傭兵 A', 'mercenary', 90, 45, 55, 50, 30, 0, 5, 'Hood', 'Sackcloth', 'Knife')
    ];
    
    // 生成精簡地圖
    const map = []; const validLandHexes = [];
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        const randNum = Math.random(); let terrain = 'grass';
        if (randNum > 0.85) terrain = 'mountain'; else if (randNum > 0.70) terrain = 'highland'; else if (randNum > 0.55) terrain = 'forest';
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
    for (let r = 0; r < 12; r++) for (let c = 0; c < 16; c++) battleMap.push({ id: `${r}-${c}`, row: r, col: c, terrain: 'grass' });
    let bChars = roster.map((char, i) => ({ ...char, row: 4 + i, col: 2 }));
    bChars.push({ id: 'e1', name: '強盜', team: 'enemy', sprite: 'bandit', row: 5, col: 10, stats: { ap: 9, hp: 50, hpMax: 50 } });
    
    setBattleData({ map: battleMap, characters: bChars, round: 1, turnQueue: bChars.map(c=>c.id), combatLogs: [], activeCampId: camp.id });
    setBattleCam({ x: 0, y: 0 }); setGameState(GAME_STATE.BATTLE);
  };

  return (
    <div className="w-full h-screen bg-neutral-900 font-sans text-gray-200 overflow-hidden flex flex-col">
      {sysMsg && <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 bg-red-900/95 text-white px-8 py-4 rounded shadow-2xl border-2 border-red-500 z-50 text-base font-bold animate-pulse pointer-events-none text-center min-w-[300px] z-[100]">{sysMsg}</div>}

      {gameState === GAME_STATE.START && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="text-5xl font-extrabold mb-8 text-orange-600 drop-shadow-lg tracking-widest border-b-2 border-orange-800 pb-4">BATTLE BROTHERS: WEB</h1>
          <div className="bg-[#1a1c17] p-8 rounded-lg border-2 border-[#3f4a2e] shadow-2xl flex flex-col items-center w-96">
            <input type="text" placeholder="輸入傭兵團名稱" className="w-full bg-neutral-800 border border-gray-600 p-3 rounded text-xl text-white mb-6 text-center" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            <button onClick={handleStartGame} disabled={!companyName.trim()} className="w-full py-3 bg-gradient-to-b from-orange-700 to-orange-900 hover:from-orange-600 hover:to-orange-800 text-white font-bold rounded shadow border border-orange-500 disabled:opacity-50 transition-all text-lg cursor-pointer mb-3">啟程 (New Game)</button>
            <label className="w-full py-3 bg-gradient-to-b from-blue-800 to-blue-950 hover:from-blue-700 hover:to-blue-900 text-white font-bold rounded shadow border border-blue-500 transition-all text-lg cursor-pointer flex justify-center items-center gap-2">
              <Download size={20}/> 載入本機存檔
              <input type="file" accept=".json" onChange={handleImportSave} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {gameState === GAME_STATE.WORLD && (
        <WorldMap companyName={companyName} worldData={worldData} inventory={inventory} roster={roster} playerWorldPos={playerWorldPos} setPlayerWorldPos={setPlayerWorldPos} setActiveLocation={setActiveLocation} setGameState={setGameState} initBattle={initBattle} showMessage={showMessage} worldCam={worldCam} setWorldCam={setWorldCam} handleExportSave={handleExportSave} />
      )}

      {gameState === GAME_STATE.BATTLE && (
        <BattleScene battleData={battleData} setBattleData={setBattleData} roster={roster} setRoster={setRoster} setGameState={setGameState} showMessage={showMessage} battleCam={battleCam} setBattleCam={setBattleCam} />
      )}
    </div>
  );
}
