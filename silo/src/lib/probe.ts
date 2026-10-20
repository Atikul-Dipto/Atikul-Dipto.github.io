/**
 * Whether the scene exposes its test handle (window.__silo): in development,
 * and in a build made with `vite build --mode probe` for profiling a
 * production bundle locally. Never in the published build.
 */
export const PROBE = import.meta.env.DEV || import.meta.env.VITE_PROBE === '1'
