import { describe, expect, it } from 'vitest';
import {
  LIBRARY_CONFIG_VERSION,
  LibraryConfigError,
  parseLibraryConfig,
  serialiseLibraryConfig,
  toLibraryConfig,
} from '../../src/models/library-config';
import { UNCATEGORISED, type AssetFolder } from '../../src/models/folder';

function folder(overrides: Partial<AssetFolder> = {}): AssetFolder {
  return {
    id: 'abc',
    displayName: 'SVG',
    category: 'Cyber Label',
    nativePath: '/Volumes/media/packs/Cyber Label Pack/SVG',
    persistentToken: 'persistent-token/should-not-be-exported',
    includeSubfolders: true,
    isFavorite: false,
    isAvailable: true,
    addedAt: 1,
    assetCount: 153,
    ...overrides,
  };
}

describe('toLibraryConfig', () => {
  it('keeps what identifies a library', () => {
    const config = toLibraryConfig([folder()], '2026-08-08T00:00:00.000Z');

    expect(config.libraries).toEqual([
      {
        displayName: 'SVG',
        category: 'Cyber Label',
        nativePath: '/Volumes/media/packs/Cyber Label Pack/SVG',
        includeSubfolders: true,
        isFavorite: false,
      },
    ]);
  });

  it('never exports the persistent token', () => {
    // The token is scoped to one machine and one install; exporting it would
    // restore something that resolves to nothing.
    const json = serialiseLibraryConfig(toLibraryConfig([folder()], 'now'));
    expect(json).not.toContain('persistent-token');
  });

  it('never exports the asset index', () => {
    const json = serialiseLibraryConfig(toLibraryConfig([folder()], 'now'));
    expect(json).not.toContain('assetCount');
  });
});

describe('parseLibraryConfig', () => {
  it('round-trips an export', () => {
    const original = toLibraryConfig([folder(), folder({ category: 'Glyphs' })], 'now');
    const parsed = parseLibraryConfig(serialiseLibraryConfig(original));

    expect(parsed.libraries).toEqual(original.libraries);
    expect(parsed.version).toBe(LIBRARY_CONFIG_VERSION);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseLibraryConfig('not json at all')).toThrow(LibraryConfigError);
    expect(() => parseLibraryConfig('{"hello":true}')).toThrow(LibraryConfigError);
    expect(() => parseLibraryConfig('null')).toThrow(LibraryConfigError);
  });

  it('refuses a backup from a newer format rather than guessing', () => {
    const future = JSON.stringify({ version: 99, libraries: [] });
    expect(() => parseLibraryConfig(future)).toThrow(/newer version/);
  });

  it('keeps the good entries when one is malformed', () => {
    // Losing twenty libraries to one bad row would be the wrong trade.
    const mixed = JSON.stringify({
      version: 1,
      libraries: [
        { nativePath: '/a/Good', displayName: 'Good', category: 'Icons' },
        { displayName: 'No path at all' },
        null,
        { nativePath: '   ' },
        { nativePath: '/b/Also Good' },
      ],
    });

    const parsed = parseLibraryConfig(mixed);
    expect(parsed.libraries.map((entry) => entry.nativePath)).toEqual(['/a/Good', '/b/Also Good']);
  });

  it('fills in sensible defaults for absent fields', () => {
    const sparse = JSON.stringify({ version: 1, libraries: [{ nativePath: '/x/Logos' }] });
    const [entry] = parseLibraryConfig(sparse).libraries;

    expect(entry).toEqual({
      nativePath: '/x/Logos',
      displayName: 'Logos',
      category: UNCATEGORISED,
      includeSubfolders: true,
      isFavorite: false,
    });
  });

  it('normalises Windows separators so a config moves between platforms', () => {
    const windows = JSON.stringify({
      version: 1,
      libraries: [{ nativePath: 'C:\\Assets\\Logos\\SVG' }],
    });

    expect(parseLibraryConfig(windows).libraries[0]!.nativePath).toBe('C:/Assets/Logos/SVG');
  });
});
