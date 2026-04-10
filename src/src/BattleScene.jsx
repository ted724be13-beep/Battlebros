// src/BattleScene.jsx
import React, { useRef } from 'react';
import { HEX_WIDTH, HEX_HEIGHT, HEX_SIZE, getHexPoints, hexToPixel, GAME_STATE, BATTLE_COLS, BATTLE_ROWS } from './constants';

export default function BattleScene({ battleData, setBattleData, setGameState, battleCam, setBattleCam }) {
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

  const { map, characters, round, turnQueue } = battleData;
  const activeChar = characters.find(c => c.id === turnQueue[0]);

  const handleHexClick = (row, col) => {
    if (drag.current.moved) return;
    // 此處保留你的戰鬥移動與攻擊邏輯...
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-neutral-900 font-sans select-none">
      <div className="absolute top-0 left-0 w-full p-2 flex flex-col items-center pointer-events-none z-10 space-y-1">
         <div className={`px-8 py-1 text-lg font-bold tracking-widest rounded shadow border bg-black/80 ${activeChar?.team === 'player' ? 'text-blue-400 border-blue-500/50' : 'text-red-400 border-red-500/50'}`}>
           {activeChar?.team === 'player' ? 'PLAYER TURN' : 'ENEMY TURN'} - Round {round}
         </div>
      </div>
      <div className="flex-1 bg-[#1a1c17] flex items-center justify-center relative cursor-grab active:cursor-grabbing overflow-hidden"
           onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
         <svg ref={mapRef} width={(BATTLE_COLS + 2) * HEX_WIDTH} height={(BATTLE_ROWS + 2) * HEX_HEIGHT * 0.75} className="will-change-transform" style={{ transform: `translate(${battleCam.x}px, ${battleCam.y}px) scale(1.25)` }} overflow="visible">
           <g transform={`translate(${HEX_WIDTH}, ${HEX_HEIGHT / 2})`}>
             {map.map(hex => {
               const { x, y } = hexToPixel(hex.row, hex.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2;
               const fill = hex.terrain === 'highland' ? '#5c3a21' : '#5b8c34'; const stroke = hex.terrain === 'highland' ? '#382212' : '#3f6323';
               return (
                 <g key={hex.id} onClick={(e) => { e.stopPropagation(); handleHexClick(hex.row, hex.col); }} className="cursor-pointer group">
                   <polygon points={getHexPoints(cx, cy, HEX_SIZE - 1)} fill={fill} stroke={stroke} strokeWidth="2" className="group-hover:fill-white/10" />
                 </g>
               );
             })}
             {characters.map(char => {
               const { x, y } = hexToPixel(char.row, char.col); const cx = x + HEX_WIDTH / 2, cy = y + HEX_HEIGHT / 2;
               return (
                 <g key={char.id} className="transition-transform hover:scale-110">
                   {char.id === activeChar?.id && <circle cx={cx} cy={cy} r={HEX_SIZE * 0.8} fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 2" className="animate-spin-slow" />}
                   <circle cx={cx} cy={cy} r="15" fill={char.team === 'player' ? '#3b82f6' : '#ef4444'} />
                 </g>
               );
             })}
           </g>
         </svg>
      </div>
      
      <div className="h-32 bg-[#111] border-t border-gray-700 flex p-2 gap-4 z-20 text-white items-center">
          <div className="flex-1 pl-4">
             <div className="font-bold text-lg text-orange-400">{activeChar?.name || 'Loading'}</div>
             <div className="text-sm">HP: {activeChar?.stats?.hp}</div>
          </div>
          <button onClick={() => setGameState(GAME_STATE.WORLD)} className="px-8 py-2 bg-gray-600 hover:bg-gray-500 font-bold rounded m-4 transition-colors">結束戰鬥 (測試)</button>
      </div>
    </div>
  );
}
