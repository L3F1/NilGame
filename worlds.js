// Playable experiences. Preset order preserves the menu digit shortcuts.
export const PRESETS = {
  fight: {
    label: 'Arena fight',
    note: 'the full kit, an opponent, and a room to use it in',
    set: {
      curv: 'hyperbolic', mode: 'floor (2D wrap)', course: 'off',
      field: 'floor plane', upright: 'pendulum', foe: 'bot',
      boomerang: 'aimed', build: 'on', portals: 'on', holo: 'sign decides',
      light: 'instant', edges: 'show',
    },
  },
  hoops: {
    label: 'Hoop course',
    note: 'the open world, where the course is a genuine 3D flight',
    set: {
      curv: 'hyperbolic', mode: 'open (3D wrap)', course: 'hoops',
      field: 'none', upright: 'free', light: 'instant', edges: 'hide',
      fog: 'thick',
    },
  },
  grapple: {
    label: 'Grapple gates',
    note: 'gravity, a rope, and gates the holonomy meter opens',
    set: {
      curv: 'hyperbolic', mode: 'floor (2D wrap)', course: 'grapple',
      field: 'floor plane', upright: 'pendulum', holo: 'sign decides',
      light: 'instant', edges: 'show',
    },
  },
  sphere: {
    label: 'Spherical flight',
    note: 'S^3: no quotient, and things grow as they recede',
    set: { curv: 'spherical', light: 'instant', fog: 'thin', quality: 'medium' },
  },
  light: {
    label: 'Light-speed lab',
    note: 'slow light, so your own copies lag visibly behind you',
    set: {
      curv: 'hyperbolic', mode: 'floor (2D wrap)', course: 'off', light: 'slow',
      field: 'floor plane', upright: 'gravity', foe: 'off', edges: 'show',
    },
  },
  // Appended rather than slotted in beside the spherical one, so the digits
  // that were already 1-5 stay where they were.
  dropper: {
    label: 'The dropper',
    note: 'H^2 x R: a Euclidean fall through a hyperbolic floor plan',
    set: { curv: 'H^2 x R', course: 'dropper', fog: 'thin', quality: 'medium' },
  },
  lap: {
    label: 'Round the world',
    note: 'S^2 x R: a compact floor, real gravity, and no group anywhere',
    set: { curv: 'S^2 x R', course: 'lap', fog: 'thin', quality: 'medium' },
  },
};
export const PRESET_KEYS = Object.keys(PRESETS);
