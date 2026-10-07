"use client";

import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {RotateCcw,X} from 'lucide-react';
import {drawWeapon,WeaponGraphic} from './DestroyerWeapons';
import {snapshotPiece} from './destroyer-snapshot';
import {createDamageGrid,fragmentAt,fragmentMask,fragmentPolygon,type DamageGrid,type Fragment} from './destroyer-damage';
import styles from './DestroyerGame.module.css';

const weapons = [
  { name: "Hammer", damage: 1, interval: 220, radius: 0, force: 1, color: "#d95937", description: "Heavy cracks · precise hits" },
  { name: "Laser", damage: .65, interval: 85, radius: 0, force: .7, color: "#5effd4", description: "Continuous beam · light damage" },
  { name: "Shotgun", damage: 2, interval: 420, radius: 85, force: 1.6, color: "#f0b45b", description: "Pellet spread · double damage" },
  { name: "Bomb", damage: 3, interval: 700, radius: 180, force: 2.2, color: "#ff704f", description: "Thrown bomb · large blast" },
] as const;
type Damage = DamageGrid & { original: { property: string; value: string; priority: string }[] };
type Shard = { image: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; width: number; height: number; x: number; y: number; vx: number; vy: number; angle: number; spin: number; age: number; edge: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; dust: boolean; size: number };
type Blast = { x: number; y: number; radius: number; age: number; color: string; weapon: number };
type Projectile = { x: number; y: number; age: number };


export function DestroyerGame({onExit,focusRef}:{onExit:()=>void;focusRef:RefObject<HTMLElement|null>}) {
  const [broken,setBroken]=useState(0);
  const [rebuildProgress,setRebuildProgress]=useState<number|null>(null);
  const [weapon,setWeapon]=useState(0);
  const weaponRef=useRef(0);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const cracksRef=useRef<HTMLCanvasElement>(null);
  const resetRef=useRef<(()=>void)|null>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const selectWeapon=useCallback((index:number)=>{weaponRef.current=index;setWeapon(index);},[]);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing-page]");
    const canvas = canvasRef.current, crackCanvas = cracksRef.current;
    const context = canvas?.getContext("2d"), crackContext = crackCanvas?.getContext("2d");
    if (!root || !canvas || !crackCanvas || !context || !crackContext) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const damage = new Map<HTMLElement, Damage>();
    const focusTarget = focusRef.current;
    const shards: Shard[] = [], sparks: Spark[] = [], blasts: Blast[] = [];
    const projectiles: Projectile[] = [];
    let frame = 0, lastTime = performance.now(), lastHit = 0, hammerUntil = 0, destroyed = 0;
    let cracksDirty = true;
    type Repair = {element:HTMLElement;state:Damage;fragment:Fragment;order:number;at:number};
    let rebuild:{start:number;updated:number;fadeDuration:number;queue:Repair[];next:number;active:Repair[];fades:Map<HTMLElement,Map<Fragment,number>>}|null=null;
    let pointer: { x: number; y: number; down: boolean; id: number } | null = null;
    const header = root.querySelector<HTMLElement>("header"), cursorBefore = root.style.cursor;
    root.style.cursor = "crosshair";
    document.documentElement.dataset.destroyerActive = "true";
    window.dispatchEvent(new Event("destroyer-activity"));
    closeRef.current?.focus({ preventScroll: true });
    const dirty = () => { cracksDirty = true; };
    const resize = () => {
      for (const surface of [canvas, crackCanvas]) { surface.width = innerWidth; surface.height = innerHeight; }
      cracksDirty = true;
    };
    resize();
    function restoreStyles(element:HTMLElement,state:Damage) {
      for (const {property,value,priority} of state.original) {
        if (value) element.style.setProperty(property,value,priority);
        else element.style.removeProperty(property);
      }
      element.removeAttribute("data-destroyed");
      element.removeAttribute("data-destroyer-holes");
    }
    function reset() {
      rebuild=null;setRebuildProgress(null);
      damage.forEach((state, element) => restoreStyles(element,state));
      damage.clear(); shards.length = 0; sparks.length = 0; blasts.length = 0; projectiles.length = 0;
      destroyed = 0; pointer = null; cracksDirty = true; setBroken(0);
      context!.clearRect(0, 0, innerWidth, innerHeight); crackContext!.clearRect(0, 0, innerWidth, innerHeight);
    }
    function beginRebuild() {
      if(rebuild) return;
      if(reducedMotion||!damage.size) {reset();return;}
      const queue:Repair[]=[];
      damage.forEach((state,element)=>{
        const bounds=element.getBoundingClientRect();
        state.fragments.forEach(fragment=>{
          if(fragment.broken) queue.push({element,state,fragment,order:bounds.top+(fragment.row+.5)*bounds.height/state.rows,at:0});
        });
      });
      // Build from the bottom up. Geometry is read once, never per animation step.
      queue.sort((a,b)=>b.order-a.order||a.fragment.column-b.fragment.column);
      const fadeDuration=Math.max(300,3500/Math.max(1,queue.length));
      queue.forEach((entry,index)=>{entry.at=queue.length>1?index/(queue.length-1)*(3500-fadeDuration):0;});
      const start=performance.now();
      rebuild={start,updated:start-100,fadeDuration,queue,next:0,active:[],fades:new Map()};
      pointer=null;shards.length=0;sparks.length=0;blasts.length=0;projectiles.length=0;
      root!.style.cursor="progress";setRebuildProgress(0);cracksDirty=true;
    }
    function updateRebuild(time:number) {
      if(!rebuild||time-rebuild.updated<100) return;
      const elapsed=time-rebuild.start;
      if(elapsed>=3500) {reset();root!.style.cursor="crosshair";return;}
      rebuild.updated=time;
      const changed=new Map<HTMLElement,Damage>();
      while(rebuild.next<rebuild.queue.length&&rebuild.queue[rebuild.next].at<=elapsed) {
        const entry=rebuild.queue[rebuild.next++];rebuild.active.push(entry);
        if(entry.element.dataset.destroyed) {
          const original=entry.state.original.find(style=>style.property==="visibility")!;
          if(original.value) entry.element.style.setProperty("visibility",original.value,original.priority);
          else entry.element.style.removeProperty("visibility");
          entry.element.removeAttribute("data-destroyed");
        }
      }
      for(let i=rebuild.active.length-1;i>=0;i--) {
        const entry=rebuild.active[i],progress=Math.min(1,(elapsed-entry.at)/rebuild.fadeDuration);
        let fades=rebuild.fades.get(entry.element);
        if(!fades) {fades=new Map();rebuild.fades.set(entry.element,fades);}
        if(progress>=1) {
          entry.fragment.broken=false;entry.fragment.health=entry.fragment.strength;entry.fragment.hits=0;entry.fragment.cracks=[];
          entry.state.broken--;destroyed--;fades.delete(entry.fragment);rebuild.active.splice(i,1);
        } else fades.set(entry.fragment,progress*progress*(3-2*progress));
        changed.set(entry.element,entry.state);
      }
      changed.forEach((state,element)=>{
        if(!state.broken) restoreStyles(element,state);
        else {
          element.style.setProperty("mask-image",fragmentMask(state,rebuild!.fades.get(element)),"important");
          element.setAttribute("data-destroyer-holes",String(state.broken));
        }
      });
      setBroken(destroyed);setRebuildProgress(Math.floor(elapsed/3500*100));cracksDirty=true;
    }
    resetRef.current = beginRebuild;
    function pieceBounds(state:Damage,fragment:Fragment,bounds:DOMRect) {
      const polygon = fragmentPolygon(state,fragment.column,fragment.row);
      const left = Math.min(...polygon.map(p=>p[0])), top = Math.min(...polygon.map(p=>p[1]));
      const right = Math.max(...polygon.map(p=>p[0])), bottom = Math.max(...polygon.map(p=>p[1]));
      return new DOMRect(bounds.left+left*bounds.width,bounds.top+top*bounds.height,(right-left)*bounds.width,(bottom-top)*bounds.height);
    }
    function shatter(element: HTMLElement, state: Damage, fragment: Fragment, bounds: DOMRect, force: number, snapshot?:{image:HTMLCanvasElement;rect:DOMRect}) {
      const rect=pieceBounds(state,fragment,bounds);
      if (snapshot) {
        const {image,rect:region}=snapshot,columns=2,rows=2;
        const scaleX=image.width/region.width,scaleY=image.height/region.height;
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
          if (shards.length >= 72) shards.shift();
          shards.push({ image, sx: (rect.left-region.left+col*rect.width/columns)*scaleX, sy: (rect.top-region.top+row*rect.height/rows)*scaleY,
            sw: rect.width/columns*scaleX, sh: rect.height/rows*scaleY, width: rect.width / columns, height: rect.height / rows,
            x: rect.left + (col + .5) * rect.width / columns, y: rect.top + (row + .5) * rect.height / rows,
            vx: ((col - columns / 2 + .5) * 100 + (Math.random() - .5) * 100) * force,
            vy: (-120 - Math.random() * 160) * force, angle: 0, spin: (Math.random() - .5) * 5, age: 0, edge: 3 + Math.random() * 8 });
        }
      }
      fragment.broken = true; state.broken++;
      element.setAttribute("data-destroyer-holes",String(state.broken));
      if (state.broken === state.columns * state.rows) {
        element.style.setProperty("visibility", "hidden", "important"); element.setAttribute("data-destroyed", "true");
      }
      setBroken(++destroyed);
    }
    function targetAt(x: number, y: number) {
      const under = document.elementFromPoint(x, y);
      if (!(under instanceof Element) || !root!.contains(under)) return null;
      const target = under.closest<HTMLElement>("header") ?? under.closest<HTMLElement>("h1,h2,h3,p,a,button,img,canvas,article,section,li");
      if (!target || target.closest("[data-destroyer-ui]") || target.dataset.destroyed) return null;
      return target;
    }
    function hit(x: number, y: number, weaponIndex = weaponRef.current) {
      if(rebuild) return;
      const selected = weapons[weaponIndex];
      const impacts = [{x,y}];
      // Sample the full impact area, including its interior, rather than only
      // the outer ring or damaging an entire container once per blast.
      if (selected.radius) for (let dy=-selected.radius;dy<=selected.radius;dy+=36) for (let dx=-selected.radius;dx<=selected.radius;dx+=36) {
        if (dx*dx+dy*dy<=selected.radius*selected.radius) impacts.push({x:x+dx,y:y+dy});
      }
      const targets = new Map<HTMLElement,{state:Damage;rect:DOMRect;cells:Map<Fragment,{x:number;y:number}>}>();
      for (const impact of impacts) {
        const element=targetAt(impact.x,impact.y); if(!element) continue;
        const rect=element.getBoundingClientRect(); if(!rect.width||!rect.height) continue;
        let state=damage.get(element);
        if(!state) {
          state={...createDamageGrid(rect.width,rect.height),original:["visibility","mask-image","mask-size","mask-repeat"].map(property=>({property,value:element.style.getPropertyValue(property),priority:element.style.getPropertyPriority(property)}))};
          damage.set(element,state);
        }
        const fragment=fragmentAt(state,(impact.x-rect.left)/rect.width,(impact.y-rect.top)/rect.height);
        if(fragment.broken) continue;
        let target=targets.get(element);
        if(!target) {target={state,rect,cells:new Map()};targets.set(element,target);}
        target.cells.set(fragment,impact);
      }
      if (!targets.size) return;
      hammerUntil = performance.now() + 140;
      targets.forEach(({state,rect,cells},element) => {
        const before=state.broken;
        const breaking=[...cells.keys()].filter(fragment=>fragment.health-selected.damage<=0&&fragment.hits>=1);
        let snapshot:{image:HTMLCanvasElement;rect:DOMRect}|undefined;
        if(!reducedMotion&&breaking.length) {
          const regions=breaking.map(fragment=>pieceBounds(state,fragment,rect));
          const left=Math.min(...regions.map(r=>r.left)),top=Math.min(...regions.map(r=>r.top));
          const region=new DOMRect(left,top,Math.max(...regions.map(r=>r.right))-left,Math.max(...regions.map(r=>r.bottom))-top);
          // One bounded snapshot per impacted surface, shared by its debris.
          snapshot={image:snapshotPiece(element,region),rect:region};
        }
        cells.forEach((impact,fragment)=>{
          fragment.hits++; fragment.health-=selected.damage;
          if(fragment.cracks.length<6) fragment.cracks.push({x:(impact.x-rect.left)/rect.width,y:(impact.y-rect.top)/rect.height,seed:Math.random()*20});
          if(fragment.health<=0&&fragment.hits>=2) shatter(element,state,fragment,rect,selected.force,snapshot);
        });
        if(state.broken>before) {
          element.style.setProperty("mask-image",fragmentMask(state),"important");
          element.style.setProperty("mask-size","100% 100%","important");
          element.style.setProperty("mask-repeat","no-repeat","important");
        }
      });
      cracksDirty = true;
      if (!reducedMotion) {
        if (blasts.length >= 12) blasts.shift();
        blasts.push({ x, y, radius: selected.radius || 24, age: 0, color: selected.color, weapon: weaponIndex });
        for (let i = 0; i < (selected.radius ? 28 : 10); i++) {
          if (sparks.length >= 180) sparks.shift();
          sparks.push({ x, y, vx: (Math.random() - .5) * 350 * selected.force, vy: (-80 - Math.random() * 180) * selected.force, life: .4, color: selected.color, dust: false, size: 1 + Math.random() * 2 });
        }
        for (let i=0;i<(weaponIndex===1?2:8);i++) {
          if(sparks.length>=180)sparks.shift();
          sparks.push({x,y,vx:(Math.random()-.5)*100*selected.force,vy:-25-Math.random()*60,life:.65,color:"#b4a99a",dust:true,size:3+Math.random()*5});
        }
      }
    }
    function strike(x: number, y: number) {
      if(rebuild) return;
      if (weaponRef.current === 3 && !reducedMotion) {
        if (projectiles.length >= 8) projectiles.shift();
        projectiles.push({x,y,age:0});
      } else hit(x,y);
    }
    const isControl = (target: EventTarget | null) => target instanceof Element && !!target.closest("[data-destroyer-ui]");
    const down = (event: PointerEvent) => {
      if (isControl(event.target) || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if(rebuild) return;
      pointer = { x: event.clientX, y: event.clientY, down: true, id: event.pointerId };
      strike(pointer.x, pointer.y); lastHit = performance.now();
    };
    const move = (event: PointerEvent) => {
      if(rebuild) return;
      if (isControl(event.target)) { if (pointer) pointer.down = false; return; }
      const held = pointer?.down && pointer.id === event.pointerId;
      pointer = { x: event.clientX, y: event.clientY, down: !!held, id: event.pointerId };
      if (held && event.cancelable) event.preventDefault();
    };
    const up = () => { if (pointer) pointer.down = false; };
    const blockClick = (event: MouseEvent) => {
      if (isControl(event.target)) return;
      event.preventDefault(); event.stopPropagation();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onExit(); }
      else if (/^[1-4]$/.test(event.key)) { event.preventDefault(); if(!rebuild) selectWeapon(Number(event.key) - 1); up(); }
      else if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
        event.preventDefault(); event.stopPropagation();
        const target = event.target instanceof HTMLElement ? event.target : header, rect = target?.getBoundingClientRect();
        if (rect) strike(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    };
    function drawCracks() {
      cracksDirty = false; crackContext!.clearRect(0, 0, innerWidth, innerHeight);
      damage.forEach((state, element) => {
        if (element.dataset.destroyed) return;
        const r = element.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        crackContext!.save(); crackContext!.beginPath(); crackContext!.rect(r.left, r.top, r.width, r.height); crackContext!.clip();
        if(rebuild) crackContext!.globalAlpha=Math.max(0,1-(performance.now()-rebuild.start)/3500);
        state.fragments.forEach(fragment => {
          if(fragment.broken) return;
          crackContext!.save();crackContext!.beginPath();
          fragmentPolygon(state,fragment.column,fragment.row).forEach((p,index)=>{
            if(index===0) crackContext!.moveTo(r.left+p[0]*r.width,r.top+p[1]*r.height);
            else crackContext!.lineTo(r.left+p[0]*r.width,r.top+p[1]*r.height);
          });
          crackContext!.closePath();crackContext!.clip();
          fragment.cracks.forEach(crack => {
          const x = r.left + crack.x * r.width, y = r.top + crack.y * r.height;
          for (let ray = 0; ray < 9; ray++) {
            const angle = ray * Math.PI * 2 / 9 + crack.seed + Math.sin(crack.seed*ray)*.24, length = (14 + (fragment.strength - fragment.health) * 9) * (1 + Math.sin(crack.seed + ray) * .3);
            crackContext!.beginPath(); crackContext!.moveTo(x, y);
            for (let step = 1; step <= 4; step++) {
              const distance = length * step / 4, bend = Math.sin(step * 4 + ray + crack.seed) * 9;
              crackContext!.lineTo(x + Math.cos(angle) * distance + Math.sin(angle) * bend, y + Math.sin(angle) * distance + Math.cos(angle) * bend);
            }
            crackContext!.strokeStyle = "rgba(255,255,255,.45)"; crackContext!.lineWidth = 2.5; crackContext!.stroke();
            crackContext!.strokeStyle = "rgba(23,28,26,.9)"; crackContext!.lineWidth = 1; crackContext!.stroke();
            const branchX=x+Math.cos(angle)*length*.55, branchY=y+Math.sin(angle)*length*.55;
            crackContext!.beginPath();crackContext!.moveTo(branchX,branchY);
            crackContext!.lineTo(branchX+Math.cos(angle+.8)*length*.22,branchY+Math.sin(angle+.8)*length*.22);
            crackContext!.lineWidth=.65;crackContext!.stroke();
          }
          });
          crackContext!.restore();
        });
        crackContext!.restore();
      });
    }
    function tick(time: number) {
      const elapsed = (time - lastTime) / 1000, dt = Math.min(elapsed, .15); lastTime = time;
      context!.clearRect(0, 0, innerWidth, innerHeight);
      updateRebuild(time);
      if (pointer?.down && time - lastHit >= weapons[weaponRef.current].interval) { strike(pointer.x, pointer.y); lastHit = time; }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i]; p.age += elapsed;
        if (p.age >= .24) { projectiles.splice(i,1); hit(p.x,p.y,3); continue; }
        const progress = p.age / .24;
        drawWeapon(context!,3,p.x - 80 * (1-progress),p.y + 70 * (1-progress) - Math.sin(progress*Math.PI)*45);
      }
      if (cracksDirty) drawCracks();
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i]; s.age += elapsed; s.vy += 1400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.angle += s.spin * dt;
        if (s.age > 1.15 || s.y - s.height / 2 > innerHeight + 150) { shards.splice(i, 1); continue; }
        context!.save(); context!.globalAlpha = Math.min(1, (1.15 - s.age) / .3); context!.translate(s.x, s.y); context!.rotate(s.angle);
        const left=-s.width/2, top=-s.height/2, right=s.width/2, bottom=s.height/2, edge=Math.min(s.edge,s.width/5,s.height/5);
        context!.beginPath();context!.moveTo(left+edge,top);context!.lineTo(right-edge,top+edge);
        context!.lineTo(right,top+s.height*.45);context!.lineTo(right-edge,bottom);
        context!.lineTo(left+edge,bottom-edge);context!.lineTo(left,top+s.height*.55);context!.closePath();context!.clip();
        context!.drawImage(s.image, s.sx, s.sy, s.sw, s.sh, -s.width / 2, -s.height / 2, s.width, s.height); context!.restore();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.life -= elapsed; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += (s.dust?70:900) * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        context!.fillStyle=s.color;
        if(s.dust){context!.globalAlpha=s.life/.65*.24;context!.beginPath();context!.arc(s.x,s.y,s.size+(1-s.life/.65)*7,0,Math.PI*2);context!.fill();}
        else {context!.globalAlpha=s.life/.4;context!.fillRect(s.x,s.y,s.size,s.size);}
      }
      context!.globalAlpha = 1;
      for (let i = blasts.length - 1; i >= 0; i--) {
        const b = blasts[i]; b.age += elapsed;
        const lifetime=b.weapon===3?.42:.22;
        if (b.age > lifetime) { blasts.splice(i, 1); continue; }
        context!.globalAlpha = 1 - b.age / lifetime; context!.strokeStyle = b.color; context!.lineWidth = 2;
        if (b.weapon === 1) {
          context!.beginPath(); context!.moveTo(b.x-85,b.y+5); context!.lineTo(b.x,b.y); context!.lineWidth=5;context!.stroke();
          context!.strokeStyle="#eaffff";context!.lineWidth=1.5;context!.stroke();
        } else if (b.weapon === 2) {
          if(b.age<.07){context!.fillStyle="#ffe8ac";context!.beginPath();context!.moveTo(b.x-55,b.y+10);context!.lineTo(b.x-35,b.y-2);context!.lineTo(b.x-38,b.y+14);context!.lineTo(b.x-29,b.y+24);context!.closePath();context!.fill();}
          for(let pellet=-2;pellet<=2;pellet++) {
            context!.beginPath(); context!.moveTo(b.x-55,b.y+10);context!.lineTo(b.x+20,b.y+pellet*14);context!.lineWidth=2;context!.stroke();
          }
        } else {
          context!.beginPath(); context!.arc(b.x, b.y, b.radius * (.15 + b.age / lifetime * .85), 0, Math.PI * 2); context!.stroke();
          if(b.weapon===3) {
            context!.fillStyle=b.age<.13?"#ffc166":"#80786e";context!.globalAlpha*=.25;
            for(let puff=0;puff<5;puff++){const angle=puff*Math.PI*2/5,radius=12+b.age*120;context!.beginPath();context!.arc(b.x+Math.cos(angle)*b.age*90,b.y+Math.sin(angle)*b.age*70-b.age*30,radius,0,Math.PI*2);context!.fill();}
          }
        }
      }
      context!.globalAlpha = 1;
      if (pointer && !reducedMotion) {
        drawWeapon(context!,weaponRef.current,pointer.x,pointer.y,Math.max(0,(hammerUntil-time)/140));
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { capture: true, passive: false });
    document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true);
    document.addEventListener("click", blockClick, true); document.addEventListener("keydown", keyboard, true);
    window.addEventListener("blur", up); window.addEventListener("resize", resize); window.addEventListener("scroll", dirty, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("click", blockClick, true); document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("blur", up); window.removeEventListener("resize", resize); window.removeEventListener("scroll", dirty);
      reset(); resetRef.current = null; root.style.cursor = cursorBefore;
      delete document.documentElement.dataset.destroyerActive; window.dispatchEvent(new Event("destroyer-activity"));
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
      else root.querySelector<HTMLElement>("a,button")?.focus({ preventScroll: true });
    };
  }, [onExit, selectWeapon, focusRef]);
  return (
    createPortal(<div data-destroyer-ui className={styles.overlay}>
      <canvas ref={cracksRef} className={styles.canvas} aria-hidden="true" data-destroyer-cracks />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-destroyer-effects />
      <div className={styles.toolbar} role="region" aria-label="Website destroyer" aria-busy={rebuildProgress!==null}>
        <div className={styles.status}><b>DEMOLITION MODE</b><span role={rebuildProgress!==null?"progressbar":undefined} aria-label={rebuildProgress!==null?"Rebuilding website":undefined} aria-valuemin={rebuildProgress!==null?0:undefined} aria-valuemax={rebuildProgress!==null?100:undefined} aria-valuenow={rebuildProgress??undefined}>{rebuildProgress!==null?`Rebuilding… ${rebuildProgress}%`:broken ? `${broken} pieces broken` : "Tap / hold to break"}</span></div>
        <div className={styles.weapons} role="group" aria-label="Weapons">
          {weapons.map(({name, description}, index) => <button key={name} type="button" disabled={rebuildProgress!==null} aria-pressed={weapon === index} title={description} onClick={() => selectWeapon(index)}>
            <WeaponGraphic weapon={index} size={30} /><span>{name}</span><small>{index + 1}</small>
          </button>)}
        </div>
        <div className={styles.actions}><span className={styles.weaponHint}>{weapons[weapon].description}</span>
          <button type="button" disabled={rebuildProgress!==null} onClick={() => resetRef.current?.()}><RotateCcw size={16} /> {rebuildProgress!==null?"Rebuilding…":"Reset"}</button>
          <button ref={closeRef} type="button" onClick={() => onExit()} aria-label="Exit destroy mode"><X size={18} /><span>Exit</span></button>
        </div>
      </div>
    </div>, document.body)
  );
}
