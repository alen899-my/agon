import { GAME_CENTER, HOOP } from '../world/Map';
import { useEffect, useRef, useState } from 'react';
import type { WorldEngine } from '../world/WorldEngine';
import type { WorldSnapshot } from '../world/Simulation';
import type { ArenaGame } from '../../server/src/shared/arena';
import './GameArena.css';
export function GameArena({engine,state}: {engine:WorldEngine|null;state:WorldSnapshot|null}) {
  const panel=useRef<HTMLElement>(null);
  const [open,setOpen]=useState(false);
  const [game,setGame]=useState<ArenaGame>('table');
  const match=engine?.arenaState;
  useEffect(()=>{ if(open) engine?.arenaAction({action:'list'}); },[open,engine]);
  const modalVisible=open || (!!match && match.phase!=='playing');
  useEffect(()=>{
    if(!modalVisible) return;
    const previous=document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape') { e.preventDefault(); e.stopPropagation(); if(engine?.arenaState) engine.arenaAction({action:'leave'}); setOpen(false); }
      if(e.key==='Tab') {
        const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')??[]);
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey && document.activeElement===first) {e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);
    return ()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[modalVisible,engine]);
  if(!engine || !state || engine.race.phase !== 'idle') return null;
  const nearby=state.nearTable||state.nearHoop;
  const local=match?.players.find(p=>p.id===engine.arenaPlayerId);
  const host=match?.hostId===engine.arenaPlayerId;
  const playing=match?.phase==='playing';
  const practice=(kind:ArenaGame)=>{
    // Enter through the arena reception; both courts are within the same compound.
    const sim=engine.simulation;
    if(kind==='table') { sim.x=GAME_CENTER.x;sim.z=GAME_CENTER.z+3;engine.enterTable(); }
    else { sim.x=HOOP.x;sim.z=HOOP.z-4.2;engine.enterBasket(); }
    setOpen(false);
  };
  return <>
    {state.mode==='roam' && (nearby || (engine.simulation.x > -60 && engine.simulation.x < -15 && engine.simulation.z > 37 && engine.simulation.z < 69)) && !state.driving && !match && !open && <button className="arena-entry" onClick={()=>setOpen(true)}><span>AGON SPORTS CLUB</span><strong>Enter game arena ?</strong><small>Table tennis � Basketball � Host / join</small></button>}
    {match && playing && <aside className="arena-live"><span>LIVE � {match.game==='table'?'TABLE TENNIS':'SHOOTOUT'}</span><strong>{match.players.map(p=>`${p.name} ${p.score}`).join('  :  ')}</strong><small>{match.message}{match.game==='basket' && match.basket?.phase==='hold' ? ` ? ${match.shotClock ?? 20}s shot clock` : ''}</small></aside>}
    {(open || (match && !playing)) && <div className="arena-overlay"><section ref={panel} className="arena-panel" role="dialog" aria-modal="true" aria-label="Game arena">
      <header><div><p>AGON / SPORTS CLUB</p><h2>Game arena<span>Play your next great match.</span></h2></div><button aria-label="Close arena" onClick={()=>{if(match) engine.arenaAction({action:'leave'});setOpen(false);}}>?</button></header>
      {match ? <>
        <div className="arena-match-heading"><span>{match.game==='table'?'01 / TABLE TENNIS':'02 / BASKETBALL'}</span><h3>{match.phase==='finished'?match.message:'Your court. Your competition.'}</h3><p>{match.phase==='lobby'?'Two players � Ready up, then the host starts.':match.game==='basket'?'Ten shots each � Final score':'First to 11 � Win by two'}</p></div>
        <div className="arena-roster">{[0,1].map(i=>{const p=match.players[i];return <article key={i}><small>{i===0?'HOST':'CHALLENGER'}</small><strong>{p?.name??'Open seat'}</strong><span>{match.phase==='finished'?`${p?.score??0} points`:p?(p.ready?'? Ready':'Not ready'):'Invite a friend to this server'}</span></article>;})}</div>
        <footer>{match.phase==='lobby' && <button onClick={()=>engine.arenaAction({action:'ready'})}>{local?.ready?'Cancel ready':'Ready to play'}</button>}{host && <button className="arena-primary" disabled={match.players.length!==2 || !match.players.every(p=>p.ready)} onClick={()=>{engine.arenaAction({action:'start'});setOpen(false);}}>{match.phase==='finished'?'Play rematch':'Start match ?'}</button>}<button onClick={()=>{engine.arenaAction({action:'leave'});setOpen(false);}}>Leave court</button></footer>
      </> : <>
        <div className="arena-cards">{(['table','basket'] as const).map((kind,i)=><button key={kind} className={`arena-card ${game===kind?'selected':''}`} aria-pressed={game===kind} onClick={()=>setGame(kind)}><div className={`arena-court-art ${kind}`}><i/><b/><em/></div><span>0{i+1} / {kind==='table'?'PRECISION & PACE':'FIND YOUR RHYTHM'}</span><h3>{kind==='table'?'Table tennis':'Basketball'}</h3><p>{kind==='table'?'Fast rallies. Spin, placement, and the perfect return.':'Step onto the court. Time your release. Beat the score.'}</p><small>{kind==='table'?'1 vs 1 � First to 11':'1 vs 1 � 10-shot contest'}</small></button>)}</div>
        <footer><button onClick={()=>practice(game)} className="arena-primary">{game==='table'?'Practice against CPU':'Practice shooting'} ?</button><button disabled={!engine.arenaConnected || state.mode!=='roam' || state.driving} onClick={()=>engine.arenaAction({action:'host',game})}>Host a match</button><span>{engine.arenaConnected?`SERVER ${state.room?.code??''}`:'Join or create a server from the game menu to play friends.'}</span></footer>
        <div className="arena-directory"><div><h3>Open courts</h3><button onClick={()=>engine.arenaAction({action:'list'})} disabled={!engine.arenaConnected}>Refresh</button></div>{engine.arenaDirectory.filter(l=>l.game===game&&l.phase==='lobby').length===0?<p>No open matches yet. Host a court and invite a friend.</p>:engine.arenaDirectory.filter(l=>l.game===game&&l.phase==='lobby').map(l=><article key={l.hostId}><span><strong>{l.players[0]?.name}'s court</strong><small>{l.players.length}/2 players</small></span><button disabled={l.players.length>=2} onClick={()=>engine.arenaAction({action:'join',hostId:l.hostId})}>Join match ?</button></article>)}</div>
      </>}
    </section></div>}
  </>;
}
