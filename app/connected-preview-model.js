// Browser/Node shared diagnostic host. No renderer policy is added to the kernel.
import { compileRegionWorld } from '../engine/world/region-world.js';
import { createCameraFrame, turn } from '../engine/world/camera-frame.js';
import { moveRegionProbe } from '../engine/world/region-motion.js';
import { traceRegionSight } from '../engine/world/region-sight.js';

export function createConnectedPreview(document) {
  const world = compileRegionWorld(document);
  let state, halted = false, motion = 'spawn';
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
      state = { ...state, camera: turn(state.camera, {
        yaw: action === 'left' ? -.15 : action === 'right' ? .15 : 0,
        pitch: action === 'up' ? .15 : action === 'down' ? -.15 : 0,
      }) }; return;
    }
    if (!['forward', 'back'].includes(action)) throw new Error('Unknown preview action');
    const velocity = state.camera.forward.map(x => x * (action === 'forward' ? 1 : -1));
    const result = moveRegionProbe(world, { ...state, velocity }, .25);
    state = result.state;
    motion = result.status + (result.detail ? `/${result.detail}` : '');
    // No replay of unspent time, automatic correction or fabricated recovery.
    halted = !!result.pendingLift || !['complete', 'stopped'].includes(result.status);
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
  return { act, render, get state() { return state; } };
}
