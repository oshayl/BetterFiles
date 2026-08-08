/** Replaced at build time by esbuild's `define`. False in production builds. */
declare const __DEV__: boolean;

/**
 * UXP exposes a CommonJS-style `require()` for host modules (`uxp`,
 * `photoshop`) and for a handful of Node-like modules. Declared here because
 * the project targets neither Node nor a browser.
 */
declare function require(moduleName: string): unknown;
