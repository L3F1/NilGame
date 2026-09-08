// Existing playable experiments. These option presets are not scene documents.
// Preset order preserves the menu digit shortcuts.
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
  race: {
    label: 'Orbital sprint',
    note: 'Three laps around a spherical floor. Drift for turbo and jump the hurdles.',
    set: { curv: 'S^2 x R', course: 'race', fog: 'thin', quality: 'medium' },
  },
  // The two flat ones, and they are the CONTROL rather than a novelty: the
  // same room and the same course as the hyperbolic pair, one option apart,
  // with the curvature switched off. Every claim the other worlds make is only
  // checkable against a world where the geometry does nothing.
  street: {
    label: 'The flat street',
    note: 'E^3 / lattice: the same wrap as the octagon world, with no curvature',
    set: {
      curv: 'flat torus', mode: 'floor (2D wrap)', course: 'off',
      edges: 'show', fog: 'thin', quality: 'medium',
    },
  },
  torus: {
    label: 'Three-torus',
    note: 'Fly the cell diagonal and come back. Every rational direction closes.',
    set: {
      curv: 'flat torus', mode: 'open (3D wrap)', course: 'torus',
      edges: 'hide', fog: 'thin', quality: 'medium',
    },
  },
  nil: {
    label: 'Nil spiral climb',
    note: 'Steer a rising helix through six gates. Going straight up is the long way.',
    set: { curv: 'Nil', course: 'climb', fog: 'thin', quality: 'medium' },
  },
  sol: {
    label: 'Sol stretch chamber',
    note: 'Fly vertically to exchange the scale of the two horizontal directions.',
    set: {curv:'Sol', course:'off', quality:'high'},
  },
  sl2r: {
    label: 'SL2R twist chamber',
    note: 'Explore the lifted tangent bundle: base travel and fibre motion interact.',
    set: {curv:'SL2R', course:'off', quality:'high'},
  },
};
export const PRESET_KEYS = Object.keys(PRESETS);
