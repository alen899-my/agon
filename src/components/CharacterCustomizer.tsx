import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetKit, type Stickman } from '../world/Assets';
import { applyCharacterLook, clearCharacterLook } from '../world/CharacterWardrobe';
import { TOPS, BOTTOMS, HAIR, HATS, SHOES, OUTFITS, DEFAULT_LOOK, readCharacterLook, type CharacterLook } from '../world/CharacterLook';
import './CharacterCustomizer.css';
export function CharacterCustomizer() {
  const [look,setLook] = useState(readCharacterLook);
  const [message,setMessage] = useState('');
  const host = useRef<HTMLDivElement>(null), actor = useRef<Stickman | null>(null);
  const initial = useRef(look);
  useEffect(()=>{
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true}); } catch { setMessage('3D preview unavailable. You can still choose and save your outfit.'); return; }
    const element=host.current!; renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;element.appendChild(renderer.domElement);
    const scene=new THREE.Scene(), kit=new AssetKit(), model=kit.stickman(true); actor.current=model;applyCharacterLook(model,initial.current);scene.add(model.group);
    scene.add(new THREE.HemisphereLight(0xffffff,0x596675,3));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,-4);scene.add(key);
    const camera=new THREE.PerspectiveCamera(36,1,.05,30);camera.position.set(0,1.1,-3.8);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.95,0);controls.enablePan=false;controls.minDistance=2.4;controls.maxDistance=5;controls.maxPolarAngle=Math.PI*.6;controls.update();
    const resize=()=>{const {width,height}=element.getBoundingClientRect();renderer.setSize(Math.max(1,width),Math.max(1,height));camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(element);resize();
    let frame=0;const draw=()=>{renderer.render(scene,camera);frame=requestAnimationFrame(draw);};draw();
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();clearCharacterLook(model);kit.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();actor.current=null;};
  },[]);
  useEffect(()=>{if(actor.current)applyCharacterLook(actor.current,look);},[look]);
  const change=<K extends keyof CharacterLook>(key:K,value:CharacterLook[K])=>{setLook(current=>({...current,[key]:value}));setMessage('');};
  const select=(key: 'gender'|'top'|'bottom'|'hair'|'hat'|'shoes',label:string,options:readonly string[]) => <label key={key}>{label}<select value={look[key]} onChange={event=>change(key,event.target.value as CharacterLook[typeof key])}>{options.map(option=><option key={option}>{option}</option>)}</select></label>;
  return <div className="character-editor"><div className="character-preview-column"><div ref={host} className="character-preview" aria-label="Interactive character preview"/><small>Drag to rotate / scroll to zoom</small></div><div className="character-options">
    <label>48 outfit presets<select value="" onChange={event=>{const preset=OUTFITS[Number(event.target.value)];if(preset){setLook(current=>({...current,...preset.look}));setMessage('');}}}><option value="" disabled>Choose a look</option>{OUTFITS.map((outfit,i)=><option key={outfit.name} value={i}>{outfit.name}</option>)}</select></label>
    <div className="character-fields">{select('gender','Gender',['Man','Woman','Nonbinary'])}{select('top','Top',TOPS)}{select('bottom','Bottom',BOTTOMS)}{select('shoes','Footwear',SHOES)}{select('hair','Hair',HAIR)}{select('hat','Headwear',HATS)}</div>
    <div className="character-colors">{([['skin','Skin tone'],['hairColor','Hair color'],['topColor','Top color'],['bottomColor','Bottom color'],['shoeColor','Shoe color'],['accent','Details']] as const).map(([key,label])=><label key={key}>{label}<input type="color" value={look[key]} onChange={event=>change(key,event.target.value)}/></label>)}</div>
    <div className="character-accessories">{(['glasses','backpack'] as const).map(key=><label key={key}><input type="checkbox" checked={look[key]} onChange={event=>change(key,event.target.checked)}/>{key}</label>)}</div>
    <div className="character-buttons"><button type="button" className="control" onClick={()=>{setLook({...DEFAULT_LOOK});setMessage('');}}>Reset</button><button type="button" className="control" onClick={()=>{try{localStorage.setItem('agon-character',JSON.stringify(look));window.dispatchEvent(new Event('agon:character'));setMessage('Outfit equipped and saved on this device.');}catch{setMessage('Could not save your outfit. Device storage is unavailable.');}}}>EQUIP OUTFIT</button></div>
    <p role="status">{message || 'All clothing and colors are available for every gender.'}</p>
  </div></div>;
}
