// src/WorldMap.jsx
import React, { useRef } from 'react';
import { Shield, Coins, Drumstick, Hammer, Users, Save, Tent, Flag } from 'lucide-react';
import { HEX_WIDTH, HEX_HEIGHT, HEX_SIZE, getHexPoints, hexToPixel, TERRAIN_INFO, getHexDistance, GAME_STATE } from './constants';

export default function WorldMap({ companyName, worldData, inventory, roster, playerWorldPos, setPlayerWorldPos, setActiveLocation, setGameState, initBattle, showMessage, worldCam, setWorldCam, handleExportSave }) {
  // 🔥 效能優化：使用 useRef 控制地圖平移，不觸發 React 重新渲染
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-900 text-gray-100 font-sans select-none">
      <div className="h-12 bg-black/90 border-b border-gray-700 flex items-center justify-between px-6 z-20 shrink-0 shadow-md">
        <div className="font-bold text-orange-500 tracking-wider text-lg flex items-center gap-2 cursor-pointer"><Shield size={20} /> {companyName}</div>
        <div className="flex items-center gap-6 text-sm font-mono">
          <span className="flex items-center gap-1"><Coins size={16} className="text-yellow-500"/> {inventory.gold}</span>
          <span className="flex items-center gap-1"><Drumstick size={16} className="text-orange-400"/> {inventory.food}</span>
          <span className="flex items-center gap-1"><Hammer size={16} className="text-gray-400"/> {inventory.tools}</span>
          <span className="flex items-center gap-1 ml-2"><Users size={16} className="text-blue-300"/> {roster.length} / 12</span>
          <button onClick={handleExportSave} className="flex items-center gap-1.5 bg-[#2a1a10] hover:bg-[#3c2517] border border-[#5c3a21] px-3 py-1 rounded text-orange-200 transition-colors shadow-md active:scale-95"><Save size={16} /> 匯出存檔</button>
        </div>
      </div>
      
      <div className="flex-1 bg-[#151912] flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
           onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <svg ref={mapRef} width={3000} height={2000} className="will-change-transform drop-shadow-2xl" style={{ transform: `translate(${worldCam.x}px, ${worldCam.y}px)` }} overflow="visible">
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
    </div>
  );
}
