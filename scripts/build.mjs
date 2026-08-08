#!/usr/bin/env node
/**
 * Build script for the Asset Browser UXP plugin.
 *
 * UXP is not a browser and not Node. The host supplies `uxp`, `photoshop` and a
 * small set of Node-ish modules through a global `require()`, so those must stay
 * as runtime `require()` calls rather than being bundled. esbuild's `cjs` output
 * format emits exactly that for anything listed in `external`.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'dist');

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const isWatch = args.includes('--watch');

/**
 * Modules provided by the UXP host at runtime. Bundling these would break the
 * plugin, because esbuild would try to resolve them from node_modules.
 */
const UXP_HOST_MODULES = ['uxp', 'photoshop', 'os', 'fs', 'path'];

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [join(root, 'src/index.tsx')],
  outfile: join(outDir, 'index.js'),
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  target: ['es2020'],
  external: UXP_HOST_MODULES,
  jsx: 'automatic',
  sourcemap: isProduction ? false : 'inline',
  minify: isProduction,
  // Strip development-only logging from production builds (roadmap section 37).
  define: {
    __DEV__: isProduction ? 'false' : 'true',
  },
  legalComments: 'none',
  logLevel: 'info',
};

async function copyStaticAssets() {
  await mkdir(outDir, { recursive: true });

  await cp(join(root, 'src/index.html'), join(outDir, 'index.html'));
  await cp(join(root, 'manifest.json'), join(outDir, 'manifest.json'));

  await cp(join(root, 'src/styles'), join(outDir, 'styles'), { recursive: true });

  if (existsSync(join(root, 'assets'))) {
    await cp(join(root, 'assets'), join(outDir, 'assets'), { recursive: true });
  }
}

/**
 * The manifest is the contract with Photoshop. A typo here surfaces as an opaque
 * "plugin failed to load", so validate the fields we depend on up front.
 */
async function validateManifest() {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const problems = [];

  if (manifest.manifestVersion !== 5) {
    problems.push(`manifestVersion must be 5, found ${manifest.manifestVersion}`);
  }
  if (!manifest.id) problems.push('missing "id"');
  if (!manifest.main) problems.push('missing "main"');
  // `host` MUST be an object, not an array. Photoshop rejects an array with
  // "Expected the host attribute to be an object for the 3P Plugin" and the
  // plugin silently never appears in the Plugins menu. (The roadmap's section 27
  // example shows an array; it is wrong.)
  if (Array.isArray(manifest.host)) {
    problems.push('"host" must be an object, not an array - Photoshop refuses to load 3P plugins with an array host');
  } else if (typeof manifest.host !== 'object' || manifest.host === null) {
    problems.push('missing "host" object');
  } else if (!manifest.host.app || !manifest.host.minVersion) {
    problems.push('"host" needs both "app" and "minVersion"');
  }
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length === 0) {
    problems.push('missing "entrypoints"');
  }
  if (manifest.requiredPermissions?.localFileSystem !== 'fullAccess') {
    problems.push('localFileSystem permission must be "fullAccess" for persistent libraries');
  }

  // Icons declared with a `scale` array are resolved as <basename>@<n>x.<ext>,
  // not by the literal path. A missing variant only shows up as a line in
  // Photoshop's UXP log, so check it here instead.
  for (const icon of manifest.icons ?? []) {
    if (!icon.path) continue;
    const scales = icon.scale ?? [1];
    for (const scale of scales) {
      const variant = icon.path.replace(/(\.[^.]+)$/, `@${scale}x$1`);
      if (!existsSync(join(root, variant))) {
        problems.push(`icon variant "${variant}" is missing (run scripts/generate-icons.mjs)`);
      }
    }
  }

  // Keep the manifest version and package version from drifting apart.
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    problems.push(`manifest version ${manifest.version} !== package version ${pkg.version}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid manifest.json:\n  - ${problems.join('\n  - ')}`);
  }
}

/**
 * Guards against the two ways this bundle can be silently wrong for UXP:
 *
 *  1. A host module gets bundled instead of externalised, so the plugin ships a
 *     broken stub instead of calling into Photoshop.
 *  2. The output depends on a CommonJS `module.exports` wrapper that the host
 *     may not provide.
 *
 * The externals check is driven by what the source actually imports, so it stays
 * accurate as the plugin grows rather than asserting a fixed list.
 */
async function verifyBundle() {
  const raw = await readFile(join(outDir, 'index.js'), 'utf8');

  // Development builds inline a sourcemap containing the full original source.
  // Scanning it would produce meaningless matches, so cut it off first.
  const code = raw.split('//# sourceMappingURL=')[0];

  const sources = await collectSourceFiles(join(root, 'src'));

  const importedHostModules = new Set();
  for (const file of sources) {
    const text = await readFile(file, 'utf8');
    for (const mod of UXP_HOST_MODULES) {
      const importPattern = new RegExp(`(from|require\\()\\s*['"]${mod}['"]`);
      if (importPattern.test(text)) {
        importedHostModules.add(mod);
      }
    }
  }

  for (const mod of importedHostModules) {
    if (!code.includes(`require("${mod}")`) && !code.includes(`require('${mod}')`)) {
      throw new Error(
        `Source imports "${mod}" but the bundle does not require() it - externals are misconfigured.`,
      );
    }
  }

  // esbuild only emits a top-level CommonJS export wrapper when the entry point
  // exports something. Assert against the source rather than the bundle: the
  // bundle legitimately contains `module.exports` inside esbuild's own
  // __commonJS shims for bundled dependencies such as React.
  const entry = await readFile(join(root, 'src/index.tsx'), 'utf8');
  if (/^\s*export\s/m.test(entry)) {
    throw new Error(
      'src/index.tsx must not export anything - it would make the bundle depend on a CommonJS wrapper UXP may not provide.',
    );
  }

  console.log(
    `[build] externals verified: ${
      importedHostModules.size > 0 ? [...importedHostModules].join(', ') : 'none imported yet'
    }`,
  );
}

async function collectSourceFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectSourceFiles(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  await validateManifest();
  await rm(outDir, { recursive: true, force: true });
  await copyStaticAssets();

  if (isWatch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('[build] watching for changes...');
    return;
  }

  await build(buildOptions);
  await verifyBundle();

  await writeFile(
    join(outDir, 'BUILD_INFO.txt'),
    `mode: ${isProduction ? 'production' : 'development'}\nbuilt: (not recorded for reproducibility)\n`,
  );

  console.log(`[build] ${isProduction ? 'production' : 'development'} build complete -> dist/`);
}

main().catch((error) => {
  console.error(`[build] failed: ${error.message}`);
  process.exit(1);
});
