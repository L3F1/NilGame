// Browser/Node shared diagnostic host. No renderer policy is added to the kernel.
import { compileRegionWorld } from '../engine/world/region-world.js';
import { createCameraFrame, alignUp } from '../engine/world/camera-frame.js';
import { moveRegionProbe } from '../engine/world/region-motion.js';
import { traceRegionSight } from '../engine/world/region-sight.js';

export function createConnectedPreview(document) {
  const world = compileRegionWorld(document);
  let state, halted = false, motion = 'spawn';
  // Camera-only floor policy: no gravity or replacement collision solver.
  const floorPoles=new Map([...world.regions].map(([id,r])=>{
    const floor=r.entities.find(e=>e.id===r.descriptor.floorId);
    if(!floor||floor.kind!=='plane')throw Error('Preview requires a declared plane floor');
    const basis=r.space.frame(r.space.decode(floor.position));
    return [id,basis[0].map((_,i)=>basis.reduce((s,b,j)=>s+b[i]*floor.up[j],0))];
  }));
  function floorUp() {
    const {space}=world.regions.get(state.regionId),p=state.position,pole=floorPoles.get(state.regionId);
    const a=space.kind==='s3'?pole.reduce((s,x,i)=>s+x*p[i],0):0;
    const gradient=pole.map((x,i)=>x-a*p[i]);
    if(Math.hypot(...gradient)<1e-10)throw Error('Preview camera has singular floor up');
    return space.normalize(p,gradient);
  }
  function lookUpright({yaw=0,pitch=0}={}) {
    if(!Number.isFinite(yaw)||!Number.isFinite(pitch))throw Error('Look angles must be finite');
    const {space,position:p}=state.camera,up=floorUp(),c=alignUp(state.camera,up);
    const elevation=Math.asin(Math.max(-1,Math.min(1,space.dot(p,c.forward,up))));
    let horizontal=space.project(p,c.forward,up);
    if(space.norm(p,horizontal)<1e-9)horizontal=c.up.map(x=>-Math.sign(elevation)*x);
    horizontal=space.normalize(p,horizontal);
    const target=Math.max(-1.5,Math.min(1.5,elevation+pitch));
    const forward=horizontal.map((x,i)=>(x*Math.cos(yaw)-c.right[i]*Math.sin(yaw))*Math.cos(target)+up[i]*Math.sin(target));
    state={...state,camera:createCameraFrame(space,p,{forward,up})};
  }
  function uprightAfterMotion() {
    // Keep the transported heading; remove only roll relative to the new floor.
    // Do not alter suspended motion state while a correction is owed.
    if(!halted)state={...state,camera:alignUp(state.camera,floorUp())};
  }
  function reset() {
    const region = world.regions.get('entry');
    const position = region.space.decode([0, -3, 0]);
    const basis = region.space.frame(position);
    const camera = createCameraFrame(region.space, position, { forward: basis[1], up: basis[2] });
    state = { regionId: 'entry', position, camera, radius: document.units.playerRadius,
      velocity: position.map(() => 0) };
    halted = false; motion = 'spawn';
  }
  reset();
  function act(action) {
    if (action === 'reset') return reset();
    if (halted) return;
    if (['left', 'right', 'up', 'down'].includes(action)) {
      lookUpright({
        yaw: action === 'left' ? .15 : action === 'right' ? -.15 : 0,
        pitch: action === 'up' ? .15 : action === 'down' ? -.15 : 0,
      }); return;
    }
    if (!['forward', 'back'].includes(action)) throw new Error('Unknown preview action');
    const velocity = state.camera.forward.map(x => x * (action === 'forward' ? 1 : -1));
    const result = moveRegionProbe(world, { ...state, velocity }, .25);
    state = result.state;
    motion = result.status + (result.detail ? `/${result.detail}` : '');
    // No replay of unspent time, automatic correction or fabricated recovery.
    halted = !!result.pendingLift || !['complete', 'stopped'].includes(result.status);
    uprightAfterMotion();
  }
  function render(width = 80, height = 60) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const space = world.regions.get(state.regionId).space, camera = state.camera;
    const counts = {}, reasons = {};
    const colors = { entry: [85, 120, 190], curve: [76, 166, 111], far: [227, 180, 76] };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const raw = camera.forward.map((f, i) => f / Math.tan(35 * Math.PI / 180)
        + camera.right[i] * (2 * (x + .5) - width) / height
        + camera.up[i] * (height - 2 * (y + .5)) / height);
      const result = traceRegionSight(world, { regionId: state.regionId,
        position: state.position, direction: space.normalize(state.position, raw) });
      counts[result.status] = (counts[result.status] || 0) + 1;
      if (result.status === 'unresolved') reasons[result.reason] = (reasons[result.reason] || 0) + 1;
      const rgb = result.status === 'hit' ? colors[result.regionId] || [255, 255, 255]
        : result.status === 'miss' ? [22, 25, 30] : [176, 32, 208];
      pixels.set([...rgb, 255], (y * width + x) * 4);
    }
    return { pixels, width, height, regionId: state.regionId,
      position: space.encode(state.position), halted, motion, counts, reasons };
  }
  function advance(dt,wish=[0,0,0],look={}) {
    if(halted)return;
    lookUpright(look);
    const c=state.camera,raw=c.forward.map((x,i)=>c.right[i]*wish[0]+x*wish[1]+c.up[i]*wish[2]);
    const speed=Math.hypot(...raw);if(speed===0){state={...state,velocity:state.velocity.map(()=>0)};return;}
    const result=moveRegionProbe(world,{...state,velocity:raw.map(x=>x/speed*2)},Math.min(.04,Math.max(0,dt)));
    state=result.state;motion=result.status+(result.detail?'/'+result.detail:'');
    halted=!!result.pendingLift||!['complete','stopped'].includes(result.status);
    uprightAfterMotion();
  }
  return { act,render,advance,world,get halted(){return halted;},get motion(){return motion;}, get state() { return state; } };
}
