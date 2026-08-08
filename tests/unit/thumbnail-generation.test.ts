import { describe, expect, it, vi } from 'vitest';
import { ThumbnailService } from '../../src/services/thumbnail.service';
import type { AssetRecord } from '../../src/models/asset';

/*
 * THE REGRESSION THESE EXIST FOR
 * Generating a preview opens the file as a real Photoshop document -
 * `dialogOptions: 'dontDisplay'` suppresses dialogs, not the document window.
 * Routing large rasters into that path meant scrolling a library of brush PNGs
 * made Photoshop open and close file after file the user never asked to see.
 *
 * The rule: the grid may READ the cache but must never START generation.
 */

const MB = 1024 * 1024;

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'a1',
    folderId: 'f1',
    name: '34.png',
    nativePath: '/V/brushes/34.png',
    relativePath: '34.png',
    extension: 'png',
    type: 'raster',
    sizeBytes: 39_719_281,
    modifiedAt: 0,
    isFavorite: false,
    addedAt: 0,
    ...overrides,
  } as AssetRecord;
}

/** Cache stub: nothing on disk unless `cached` names it. */
function fakeCache(cached: Record<string, string> = {}) {
  return {
    nativePathFor: vi.fn(async (assetId: string) => cached[assetId] ?? null),
    write: vi.fn(async () => '/cache/written.jpg'),
  } as never;
}

const OPTIONS = { maxPreviewSourceMb: 512, maxDirectRenderMb: 2 };

describe('the grid never starts generation', () => {
  it('returns a placeholder for an oversized raster rather than opening a document', async () => {
    const service = new ThumbnailService(fakeCache(), OPTIONS);
    service.enableGeneration();

    // allowGeneration defaults to false - this is the grid's call.
    const source = await service.request({ asset: asset(), size: 72, visible: true });

    expect(source.kind).toBe('placeholder');
  });

  it('still serves a cached preview to the grid', async () => {
    // Browsing populates thumbnails: select once, and the tile keeps it.
    const service = new ThumbnailService(fakeCache({ a1: '/cache/a1.jpg' }), OPTIONS);
    service.enableGeneration();

    const source = await service.request({ asset: asset(), size: 72, visible: true });

    expect(source.kind).toBe('cached');
  });

  it('hands a small raster straight to <img>, generation flag irrelevant', async () => {
    const service = new ThumbnailService(fakeCache(), OPTIONS);
    const small = asset({ sizeBytes: 200 * 1024 });

    const source = await service.request({ asset: small, size: 72, visible: true });

    expect(source.kind).toBe('direct');
  });

  it('does not open documents for PSDs on scroll either', async () => {
    // The same flapping would happen in a library of Photoshop files.
    const service = new ThumbnailService(fakeCache(), OPTIONS);
    service.enableGeneration();

    const psd = asset({ type: 'photoshop', extension: 'psd', sizeBytes: 80 * MB });
    const source = await service.request({ asset: psd, size: 72, visible: true });

    expect(source.kind).toBe('placeholder');
  });
});

describe('selection is what permits generation', () => {
  it('queues work when the preview panel asks', async () => {
    const service = new ThumbnailService(fakeCache(), OPTIONS);
    service.enableGeneration();

    const source = await service.request({
      asset: asset(),
      size: 768,
      visible: true,
      allowGeneration: true,
    });

    // Pending, not placeholder: this one is allowed to reach Photoshop.
    expect(source.kind).toBe('pending');
  });

  it('holds generation until startup is over', async () => {
    // Photoshop launching is the worst moment to open a temporary document.
    // Not enabled here, so this parks rather than reaching the host.
    const service = new ThumbnailService(fakeCache(), OPTIONS);

    const source = await service.request({
      asset: asset(),
      size: 768,
      visible: true,
      allowGeneration: true,
    });

    expect(source.kind).toBe('pending');

    // Parked requests collapse rather than accumulating per scroll.
    const again = await service.request({
      asset: asset(),
      size: 768,
      visible: true,
      allowGeneration: true,
    });
    expect(again.kind).toBe('pending');
  });
});
