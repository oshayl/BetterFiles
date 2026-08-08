import { describe, expect, it } from 'vitest';
import { applyDiff, buildAssetRecord, diffAssets } from '../../src/services/asset-index.service';
import { makeAsset, makeDiscovered } from '../helpers/fixtures';

const NOW = 1_700_000_000_000;

describe('buildAssetRecord', () => {
  it('derives type and identity from the discovered file', () => {
    const record = buildAssetRecord(makeDiscovered('brand/logo.svg'), 'lib1', NOW);

    expect(record.type).toBe('svg');
    expect(record.extension).toBe('svg');
    expect(record.relativePath).toBe('brand/logo.svg');
    expect(record.previewStatus).toBe('not_requested');
  });

  it('carries user-owned state across a re-index', () => {
    const previous = makeAsset({
      name: 'logo.svg',
      relativePath: 'brand/logo.svg',
      isFavorite: true,
      lastImportedAt: 12345,
      addedAt: 999,
    });

    const record = buildAssetRecord(makeDiscovered('brand/logo.svg'), 'lib1', NOW, previous);

    expect(record.isFavorite).toBe(true);
    expect(record.lastImportedAt).toBe(12345);
    // The original discovery time is preserved so "recently added" stays honest.
    expect(record.addedAt).toBe(999);
  });

  it('defaults user state for a genuinely new file', () => {
    const record = buildAssetRecord(makeDiscovered('new.png'), 'lib1', NOW);
    expect(record.isFavorite).toBe(false);
    expect(record.lastImportedAt).toBeUndefined();
    expect(record.addedAt).toBe(NOW);
  });
});

describe('diffAssets', () => {
  it('detects added files', () => {
    const diff = diffAssets([], [makeDiscovered('a.png')], 'lib1', NOW);

    expect(diff.added.map((a) => a.name)).toEqual(['a.png']);
    expect(diff.changed).toEqual([]);
    expect(diff.removedIds).toEqual([]);
  });

  it('detects unchanged files without producing churn', () => {
    const existing = buildAssetRecord(makeDiscovered('a.png'), 'lib1', NOW);
    const diff = diffAssets([existing], [makeDiscovered('a.png')], 'lib1', NOW);

    expect(diff.unchangedCount).toBe(1);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('detects an in-place edit as a change, not a delete plus add', () => {
    const existing = buildAssetRecord(makeDiscovered('a.png'), 'lib1', NOW);
    const edited = makeDiscovered('a.png', { sizeBytes: 4096, modifiedAt: NOW + 60_000 });

    const diff = diffAssets([existing], [edited], 'lib1', NOW);

    expect(diff.changed).toHaveLength(1);
    expect(diff.added).toEqual([]);
    expect(diff.removedIds).toEqual([]);
    // A new key is what invalidates the cached thumbnail.
    expect(diff.changed[0]?.id).not.toBe(existing.id);
  });

  it('preserves the favourite flag through an in-place edit', () => {
    const existing = makeAsset({ name: 'a.png', relativePath: 'a.png', isFavorite: true });
    const edited = makeDiscovered('a.png', { sizeBytes: 4096, modifiedAt: NOW + 60_000 });

    const diff = diffAssets([existing], [edited], 'lib1', NOW);
    expect(diff.changed[0]?.isFavorite).toBe(true);
  });

  it('detects removed files', () => {
    const existing = buildAssetRecord(makeDiscovered('gone.png'), 'lib1', NOW);
    const diff = diffAssets([existing], [], 'lib1', NOW);

    expect(diff.removedIds).toEqual([existing.id]);
  });

  it('ignores assets belonging to other libraries', () => {
    const otherLibrary = makeAsset({ name: 'other.png', folderId: 'lib2' });
    const diff = diffAssets([otherLibrary], [], 'lib1', NOW);

    // lib2's asset is neither removed nor counted.
    expect(diff.removedIds).toEqual([]);
    expect(diff.unchangedCount).toBe(0);
  });

  it('matches paths case-insensitively so a case-only rename is not a churn event', () => {
    const existing = buildAssetRecord(makeDiscovered('Logo.png'), 'lib1', NOW);
    const rediscovered = makeDiscovered('Logo.png', { nativePath: '/library/logo.png' });

    const diff = diffAssets([existing], [rediscovered], 'lib1', NOW);
    expect(diff.added).toEqual([]);
    expect(diff.removedIds).toEqual([]);
  });
});

describe('applyDiff', () => {
  it('adds new records', () => {
    const diff = diffAssets([], [makeDiscovered('a.png')], 'lib1', NOW);
    expect(applyDiff([], diff).map((a) => a.name)).toEqual(['a.png']);
  });

  it('removes deleted records', () => {
    const existing = buildAssetRecord(makeDiscovered('gone.png'), 'lib1', NOW);
    const diff = diffAssets([existing], [], 'lib1', NOW);

    expect(applyDiff([existing], diff)).toEqual([]);
  });

  it('replaces changed records in place without duplicating them', () => {
    const existing = buildAssetRecord(makeDiscovered('a.png'), 'lib1', NOW);
    const edited = makeDiscovered('a.png', { sizeBytes: 4096, modifiedAt: NOW + 60_000 });
    const diff = diffAssets([existing], [edited], 'lib1', NOW);

    const result = applyDiff([existing], diff);
    expect(result).toHaveLength(1);
    expect(result[0]?.sizeBytes).toBe(4096);
  });

  it('leaves other libraries untouched', () => {
    const mine = buildAssetRecord(makeDiscovered('a.png'), 'lib1', NOW);
    const theirs = makeAsset({ name: 'other.png', folderId: 'lib2' });
    const diff = diffAssets([mine, theirs], [], 'lib1', NOW);

    expect(applyDiff([mine, theirs], diff).map((a) => a.name)).toEqual(['other.png']);
  });

  it('handles a full rescan of a large library without duplicating entries', () => {
    const discovered = Array.from({ length: 500 }, (_, i) => makeDiscovered(`folder/a${i}.png`));
    const first = applyDiff([], diffAssets([], discovered, 'lib1', NOW));
    const second = applyDiff(first, diffAssets(first, discovered, 'lib1', NOW));

    expect(second).toHaveLength(500);
    expect(new Set(second.map((a) => a.id)).size).toBe(500);
  });
});
