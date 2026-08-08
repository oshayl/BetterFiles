import type { AssetRecord } from '../../src/models/asset';
import type { DiscoveredFile } from '../../src/adapters/filesystem/uxp-filesystem';
import { createAssetKey } from '../../src/utils/hashing';
import { getAssetType } from '../../src/utils/file-types';
import { extname } from '../../src/utils/path-utils';

/** Builds an AssetRecord with sensible defaults, overridable per test. */
export function makeAsset(overrides: Partial<AssetRecord> & { name: string }): AssetRecord {
  const relativePath = overrides.relativePath ?? overrides.name;
  const nativePath = overrides.nativePath ?? `/library/${relativePath}`;
  const extension = overrides.extension ?? extname(overrides.name);
  const sizeBytes = overrides.sizeBytes ?? 1024;
  const modifiedAt = overrides.modifiedAt ?? 1_700_000_000_000;

  return {
    id: overrides.id ?? createAssetKey(nativePath, sizeBytes, modifiedAt),
    folderId: overrides.folderId ?? 'lib1',
    name: overrides.name,
    extension,
    nativePath,
    relativePath,
    type: overrides.type ?? getAssetType(extension),
    sizeBytes,
    modifiedAt,
    previewStatus: overrides.previewStatus ?? 'not_requested',
    isFavorite: overrides.isFavorite ?? false,
    addedAt: overrides.addedAt ?? 1_700_000_000_000,
    ...(overrides.lastImportedAt != null ? { lastImportedAt: overrides.lastImportedAt } : {}),
    ...(overrides.thumbnailKey != null ? { thumbnailKey: overrides.thumbnailKey } : {}),
    ...(overrides.width != null ? { width: overrides.width } : {}),
    ...(overrides.height != null ? { height: overrides.height } : {}),
  };
}

/** Builds a DiscoveredFile as the traversal layer would report it. */
export function makeDiscovered(
  relativePath: string,
  overrides: Partial<DiscoveredFile> = {},
): DiscoveredFile {
  const name = relativePath.split('/').pop() ?? relativePath;
  return {
    nativePath: overrides.nativePath ?? `/library/${relativePath}`,
    relativePath,
    name,
    extension: overrides.extension ?? extname(name),
    sizeBytes: overrides.sizeBytes ?? 1024,
    modifiedAt: overrides.modifiedAt ?? 1_700_000_000_000,
  };
}
