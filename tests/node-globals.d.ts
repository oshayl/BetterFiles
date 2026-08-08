/**
 * Minimal Node globals for tests only.
 *
 * `@types/node` is deliberately not installed: `src/` targets UXP, which is
 * neither Node nor a browser, and pulling Node's globals in would let source
 * code reference APIs the plugin cannot use. Tests run under Node, and use
 * `Buffer` purely as an independent oracle for the base64 implementation.
 */
declare const Buffer: {
  from(input: string, encoding?: string): { toString(encoding: string): string } & Uint8Array;
};
