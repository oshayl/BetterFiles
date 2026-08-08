/** Library folder model (roadmap sections 15 and 17.2). */

/**
 * Suggested categories offered when importing a folder.
 *
 * These describe what the assets ARE, which is not the same as their file
 * extension: a texture library and a mockup library are both PNGs, and sorting
 * them together is exactly what makes a large collection unusable. Any custom
 * string is accepted too.
 */
export const DEFAULT_CATEGORIES = [
  'Textures',
  'Vectors',
  'Logos',
  'Mockups',
  'Photos',
  'Icons',
  'Documents',
  'Other',
] as const;

/** Used when a library predates categories or the user skips the picker. */
export const UNCATEGORISED = 'Uncategorised';

export interface AssetFolder {
  id: string;
  /** User-editable label; defaults to the folder name. */
  displayName: string;
  /** What kind of assets this library holds. Groups the sidebar. */
  category: string;
  nativePath: string;
  /**
   * Token from `createPersistentToken`. This is what allows a library to
   * survive a Photoshop restart; without it the folder must be re-picked.
   */
  persistentToken?: string;
  includeSubfolders: boolean;
  isFavorite: boolean;
  /** False when the drive is unmounted or the folder was moved or deleted. */
  isAvailable: boolean;
  addedAt: number;
  lastIndexedAt?: number;
  /** Populated after indexing, for the sidebar count. */
  assetCount?: number;
}

/**
 * Categories to offer in the picker: the defaults plus any the user has already
 * invented, so their own vocabulary persists.
 */
export function availableCategories(folders: readonly AssetFolder[]): string[] {
  const used = folders.map((folder) => folder.category).filter(Boolean);
  const merged = new Set<string>([...DEFAULT_CATEGORIES, ...used]);
  merged.delete(UNCATEGORISED);
  return [...merged].sort((a, b) => a.localeCompare(b));
}

/** Groups libraries by category, in a stable display order. */
export function groupFoldersByCategory(
  folders: readonly AssetFolder[],
): Array<{ category: string; folders: AssetFolder[] }> {
  const groups = new Map<string, AssetFolder[]>();

  for (const folder of folders) {
    const key = folder.category || UNCATEGORISED;
    const bucket = groups.get(key);
    if (bucket) bucket.push(folder);
    else groups.set(key, [folder]);
  }

  return [...groups.entries()]
    .map(([category, entries]) => ({
      category,
      // Favourites first, then by the order they were added.
      folders: entries.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.addedAt - b.addedAt;
      }),
    }))
    .sort((a, b) => {
      // Uncategorised always sinks to the bottom.
      if (a.category === UNCATEGORISED) return 1;
      if (b.category === UNCATEGORISED) return -1;
      return a.category.localeCompare(b.category);
    });
}

/** Why a folder is unusable, for the sidebar's offline and reconnect states. */
export type FolderAvailability =
  | { readonly state: 'available' }
  | { readonly state: 'missing'; readonly reason: string }
  | { readonly state: 'permission_required'; readonly reason: string };
