/**
 * Typed access to the UXP host modules.
 *
 * `uxp` and `photoshop` are injected by the host through a global `require()`
 * rather than resolved from node_modules, so they cannot be imported normally.
 * Centralising the cast here keeps that one piece of untypeable plumbing in a
 * single place instead of repeating it in every adapter.
 *
 * Accessors rather than module-level constants: `require` must not run at import
 * time, or a host that has not finished initialising would break module loading
 * before the panel can render an error.
 */
/* eslint-disable @typescript-eslint/consistent-type-imports */

export function uxp(): typeof import('uxp') {
  return require('uxp') as typeof import('uxp');
}

export function photoshop(): typeof import('photoshop') {
  return require('photoshop') as typeof import('photoshop');
}
