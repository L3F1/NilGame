// The first curved viewport: one S3 region, sphere-traced along great circles.
//
// This module owns the GL context and nothing else. The field it draws is
// packed by `region-shader.js` from the SAME compiled render data the walker
// collides against, and that packing is checked against `field.distance` in
// Node (`region-render.test.js`, worst disagreement 0.0 over 3388 samples). So
// the interesting question here is only whether the picture reaches the screen,
// not whether it is the right picture.
//
// WHAT IT DELIBERATELY DOES NOT DO. One region: a scene with two is refused by
// name rather than drawn half. No portals: an aperture drawn as a wall, or as a
// hole showing the near side, is a false statement about where you can walk.
// No gravity: the walker flies, because a curved support policy does not exist
// yet and inventing one here would put a made-up floor under a real room.
//
// CAPACITY IS SMALL AND SAID OUT LOUD. WebGL2 guarantees only 224 fragment
// uniform vectors, and the plane array is the greedy one: 72 faces is 72 of
// them. The authored S3 room uses 31. A scene that does not fit is refused with
// the number it needed, because silently dropping the sixteenth wall produces a
// room you can see through and walk into.
import { REGION_S3_GLSL, REGION_RENDER_LIMITS, packRegionScene } from './region-shader.js';

const VERTEX_GLSL = `#version 300 es
// One triangle covering the viewport. No vertex data, no buffers: gl_VertexID
// is enough, and a full-screen triangle avoids the seam a quad's diagonal puts
// down the middle of the image.
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

function compile(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    // A GLSL failure and a JavaScript error draw the same black canvas, and the
    // difference between a five second fix and an hour is being told which.
    throw new Error(`${label} shader did not compile:\n${log}`);
  }
  return shader;
}

function link(gl) {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_GLSL, 'viewport');
  const fragment = compile(gl, gl.FRAGMENT_SHADER, REGION_S3_GLSL, 'S3 region');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`S3 region program did not link:\n${log}`);
  }
  return program;
}

/**
 * A viewport for one S3 region.
 *
 * `draw(world, state, options)` takes the compiled world and the region-motion
 * state -- `{ regionId, position, camera, ... }` -- and nothing else. The
 * camera's three vectors ARE the view: they are unit tangents at the eye, and a
 * pixel direction is a combination of them, so there is no view matrix and
 * nothing is reconstructed from a yaw and a pitch. Roll therefore survives all
 * the way to the screen, which is the point of carrying a frame at all.
 */
export function createRegionRenderer(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    // Screenshots are taken after the frame, so the buffer has to survive it.
    preserveDrawingBuffer: true, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('This viewport needs WebGL2, which this browser did not provide.');

  const capacity = {
    fragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    renderer: (() => {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })(),
    vendor: (() => {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    })(),
  };

  const program = link(gl);
  const at = (name) => gl.getUniformLocation(program, name);
  const u = {
    plane: at('uPlane[0]'), primCenter: at('uPrimCenter[0]'), primA: at('uPrimA[0]'),
    primCount: at('uPrimCount'), groupCount: at('uGroupCount'), R: at('uR'),
    boundaryHeight: at('uBoundaryHeight'), maxTravel: at('uMaxTravel'), steps: at('uSteps'),
    epsilon: at('uEpsilon'), eye: at('uEye'), fwd: at('uFwd'), right: at('uRight'),
    up: at('uUp'), light: at('uLight'), res: at('uRes'), focal: at('uFocal'),
    selected: at('uSelected'), floorPrim: at('uFloorPrim'),
  };

  const fieldOfView = options.fieldOfView ?? (75 * Math.PI / 180);
  const steps = options.steps ?? REGION_RENDER_LIMITS.steps;
  // The scene arrays only change when the DOCUMENT changes, so they are packed
  // once per compiled world rather than once per frame; an editor that repacks
  // sixteen planes every frame is measuring its own bookkeeping.
  let cached = null, cachedWorld = null, cachedRegion = null;
  let lastFrameMs = 0, disposed = false;

  function scene(world, regionId) {
    if (cachedWorld === world && cachedRegion === regionId) return cached;
    const packed = packRegionScene(world, regionId, REGION_RENDER_LIMITS);
    const planes = new Float32Array(REGION_RENDER_LIMITS.planes * 4);
    let worstNarrowing = 0;
    packed.planes.forEach((plane, i) => {
      plane.forEach((x, k) => {
        planes[i * 4 + k] = x;
        worstNarrowing = Math.max(worstNarrowing, Math.abs(Math.fround(x) - x));
      });
    });
    const centers = new Float32Array(REGION_RENDER_LIMITS.primitives * 4);
    const meta = new Float32Array(REGION_RENDER_LIMITS.primitives * 4);
    packed.primitives.forEach((primitive, i) => {
      primitive.center.forEach((x, k) => { centers[i * 4 + k] = x; });
      meta[i * 4] = primitive.planeStart;
      meta[i * 4 + 1] = primitive.planeCount;
      meta[i * 4 + 2] = primitive.radius;
      meta[i * 4 + 3] = primitive.signedGroup;
    });
    const region = world.regions.get(regionId);
    const floorId = region?.descriptor?.floorId ?? null;
    const light = region.space.decode([0, -1, Math.min(4, packed.extent * 0.4)]);
    cached = {
      packed, planes, centers, meta, light,
      floorPrim: packed.primitives.findIndex((p) => p.id === floorId),
      // The one number the GPU costs that the Node reference does not pay.
      narrowing: worstNarrowing,
    };
    cachedWorld = world; cachedRegion = regionId;
    return cached;
  }

  function draw(world, state, { selectedId = null } = {}) {
    if (disposed) throw new Error('This viewport has been disposed.');
    const packedScene = scene(world, state.regionId);
    const { packed } = packedScene;
    const camera = state.camera;
    if (!camera) throw new Error('The viewport needs the carried camera frame from the motion state.');
    if (camera.space !== world.regions.get(state.regionId).space) {
      // Two S3 regions of different radius produce identical-looking
      // four-vectors, so identity of the space is the only sound check.
      throw new Error('The camera belongs to a different region than the state does.');
    }

    const started = performance.now();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform4fv(u.plane, packedScene.planes);
    gl.uniform4fv(u.primCenter, packedScene.centers);
    gl.uniform4fv(u.primA, packedScene.meta);
    gl.uniform1i(u.primCount, packed.primitives.length);
    gl.uniform1i(u.groupCount, packed.groups);
    gl.uniform1f(u.R, packed.curvatureRadius);
    gl.uniform1f(u.boundaryHeight, packed.boundaryHeight);
    gl.uniform1f(u.maxTravel, 2 * packed.extent);
    gl.uniform1i(u.steps, steps);
    gl.uniform1f(u.epsilon, Math.max(1e-4, packed.extent * 1e-4));
    gl.uniform4f(u.eye, ...camera.position);
    gl.uniform4f(u.fwd, ...camera.forward);
    gl.uniform4f(u.right, ...camera.right);
    gl.uniform4f(u.up, ...camera.up);
    gl.uniform4f(u.light, ...packedScene.light);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.focal, 1 / Math.tan(fieldOfView / 2));
    gl.uniform1i(u.selected, packed.primitives.findIndex((p) => p.id === selectedId));
    gl.uniform1i(u.floorPrim, packedScene.floorPrim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    lastFrameMs = performance.now() - started;
    return packedScene;
  }

  return {
    draw,
    /** What this program can hold, and what it is running on. */
    info: () => ({
      ...capacity, limits: REGION_RENDER_LIMITS, steps,
      fieldOfView, lastFrameMs,
      resolution: [canvas.width, canvas.height],
      narrowing: cached ? cached.narrowing : null,
    }),
    /** Submitted-to-finished for the last frame, in milliseconds. */
    frameTime: () => lastFrameMs,
    /** Block until the GPU has actually finished, for honest timing. */
    finish: () => gl.finish(),
    error: () => gl.getError(),
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
