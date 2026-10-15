import { walkY } from '../content/floors'

/**
 * The lift car, as plain mutable state shared by everything that has to agree
 * on where it is: the drawn car, its colliders, the body riding in it, and the
 * opening sequence that flies the camera in.
 *
 * Not React state, for the same reason the walking keys are not: the car's
 * height changes every frame of a ride, and routing that through a store would
 * re-render the scene sixty times a second to move one mesh.
 *
 * The discrete facts about the lift -- which level it is at, whether it is
 * moving, whether its doors are open -- DO live in the store, because the UI
 * and the colliders have to react to them.
 */
export const lift = {
  /** Elevation of the car floor. */
  y: walkY(1),
  /**
   * Set by the walking body. Puts the body in the car, at the car's current
   * height, and returns true -- or false if there is no body to place.
   */
  board: null as null | (() => boolean),
  /** Set by the walking body: is it standing in the car right now? */
  aboard: (() => false) as () => boolean,
}
