/**
 * The reactor's one moving part that other things watch: a surge test, run
 * from the console on level 12. The core flares and the light racing up the
 * conduits on the silo wall quickens, then both settle over a few seconds.
 */
export const reactor = {
  /** When the last surge started (performance.now()), or null. */
  surgeAt: null as number | null,
  /** Shared with the conduits' shader. */
  uSurge: { value: 0 },
}
