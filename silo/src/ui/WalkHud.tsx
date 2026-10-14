import { useSilo } from '../state/useSilo'

/**
 * The walking overlay: a prompt to take the pointer, and the control legend.
 *
 * Without the prompt, walk mode looks broken. The browser will not grant
 * pointer lock without a user gesture, so entering walk mode leaves the mouse
 * free and WASD apparently doing nothing until the visitor happens to click.
 * This says so.
 *
 * It also follows the browser rather than assuming: `pointerLocked` mirrors
 * `document.pointerLockElement`, so pressing Escape -- which never reaches us
 * as a keydown -- brings the prompt straight back.
 */
export default function WalkHud() {
  const mode = useSilo((s) => s.mode)
  const locked = useSilo((s) => s.pointerLocked)
  const level = useSilo((s) => s.level)
  const toggleMode = useSilo((s) => s.toggleMode)
  const nearLift = useSilo((s) => s.nearLift)

  if (mode !== 'walk') return null

  return (
    <>
      {!locked && (
        <div className="walk-prompt">
          <div className="walk-prompt__card">
            <h2>Walking level {String(level).padStart(2, '0')}</h2>
            <p>Click anywhere to take the mouse and look around.</p>
            <dl className="walk-keys">
              <div>
                <dt>
                  <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
                </dt>
                <dd>Walk</dd>
              </div>
              <div>
                <dt>
                  <kbd>Shift</kbd>
                </dt>
                <dd>Run</dd>
              </div>
              <div>
                <dt>Mouse</dt>
                <dd>Look</dd>
              </div>
              <div>
                <dt>
                  <kbd>E</kbd>
                </dt>
                <dd>Lift controls, once aboard</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>Release the mouse</dd>
              </div>
            </dl>
            <p className="walk-prompt__note">
              One gap in the handrail leads out to the gangway. From there the
              stair runs the full depth of the silo and the lift is at the
              inner end — both on foot. The lift itself still rides on the
              guided camera.
            </p>
            <button type="button" className="chip" onClick={toggleMode}>
              Back to the guided camera
            </button>
          </div>
        </div>
      )}
      {locked && (
        <div className="walk-legend" aria-hidden="true">
          <span>
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> walk
          </span>
          <span>
            <kbd>Shift</kbd> run
          </span>
          <span>
            <kbd>Esc</kbd> release
          </span>
        </div>
      )}
      {locked && nearLift && (
        <div className="walk-interact" role="status">
          <kbd>E</kbd> call the lift
        </div>
      )}
    </>
  )
}
