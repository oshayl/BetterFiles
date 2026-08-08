/**
 * Search, filtering and sorting (roadmap section 23).
 *
 * Pure functions over the in-memory index. Search must stay under 100ms for an
 * indexed library (section 33), so this does a single linear pass with cheap
 * string operations rather than building an inverted index - at 25,000 assets a
 * scan is comfortably fast, and it avoids an index that would need invalidating
 * on every file change.
 */
import type { AssetRecord } from '../models/asset';
import type { SortMode, TypeFilter } from '../models/settings';
import { matchesTypeFilter } from '../utils/file-types';

export interface SearchCriteria {
  readonly query: string;
  readonly typeFilter: TypeFilter;
  /** Restricts to the given library. Null means every library. */
  readonly folderId?: string | null;
  /** Restricts to a subtree within the library, for folder-tree navigation. */
  readonly relativePathPrefix?: string | null;
}

/**
 * Ranking tiers, best first - lower sorts earlier.
 *
 * A plain object rather than a `const enum`, which `isolatedModules` forbids
 * and esbuild cannot inline.
 */
const MatchRank = {
  ExactName: 0,
  NamePrefix: 1,
  NameContains: 2,
  PathContains: 3,
  None: 99,
} as const;

type MatchRank = (typeof MatchRank)[keyof typeof MatchRank];

/**
 * Splits a query into tokens. Every token must match for the asset to qualify,
 * which makes "brand logo" behave the way people expect rather than as a
 * literal substring.
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== '');
}

/**
 * Scores one asset against the tokens. Returns `MatchRank.None` when any token
 * fails to match.
 */
function rankAsset(asset: AssetRecord, tokens: string[]): MatchRank {
  if (tokens.length === 0) return MatchRank.NameContains;

  const name = asset.name.toLowerCase();
  const relativePath = asset.relativePath.toLowerCase();
  const extension = asset.extension.toLowerCase();

  // The overall rank is the *weakest* match across tokens, so an asset only
  // ranks highly when every token matched strongly.
  let weakest: number = MatchRank.ExactName;

  for (const token of tokens) {
    let rank: number;

    if (name === token) rank = MatchRank.ExactName;
    else if (name.startsWith(token)) rank = MatchRank.NamePrefix;
    else if (name.includes(token)) rank = MatchRank.NameContains;
    else if (extension === token) rank = MatchRank.NameContains;
    else if (relativePath.includes(token)) rank = MatchRank.PathContains;
    else return MatchRank.None; // every token must match somewhere

    weakest = Math.max(weakest, rank);
  }

  return weakest as MatchRank;
}

/** Applies filters and the query, returning matches in relevance order. */
export function searchAssets(assets: readonly AssetRecord[], criteria: SearchCriteria): AssetRecord[] {
  const tokens = tokenizeQuery(criteria.query);
  const prefix = criteria.relativePathPrefix?.toLowerCase() ?? null;

  const ranked: Array<{ asset: AssetRecord; rank: MatchRank }> = [];

  for (const asset of assets) {
    if (criteria.folderId != null && asset.folderId !== criteria.folderId) continue;

    if (prefix != null && prefix !== '') {
      const path = asset.relativePath.toLowerCase();
      if (!path.startsWith(`${prefix}/`) && path !== prefix) continue;
    }

    // The favourites chip filters by flag; every other chip filters by type.
    if (criteria.typeFilter === 'favorites') {
      if (!asset.isFavorite) continue;
    } else if (!matchesTypeFilter(asset.type, criteria.typeFilter)) {
      continue;
    }

    const rank = rankAsset(asset, tokens);
    if (rank === MatchRank.None) continue;

    ranked.push({ asset, rank });
  }

  // Relevance first, then name, so results are stable and predictable.
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return compareByName(a.asset, b.asset);
  });

  return ranked.map((entry) => entry.asset);
}

/**
 * Natural-order name comparison, so `layer-2` precedes `layer-10`.
 * Falls back to a plain comparison when the locale API is unavailable.
 */
const collator =
  typeof Intl !== 'undefined' && typeof Intl.Collator === 'function'
    ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    : null;

function compareByName(a: AssetRecord, b: AssetRecord): number {
  if (collator) return collator.compare(a.name, b.name);
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/**
 * Sorts a result set. Missing values sort last rather than as zero, so assets
 * whose metadata has not loaded do not jump to the top of a date sort.
 */
export function sortAssets(assets: readonly AssetRecord[], mode: SortMode): AssetRecord[] {
  const sorted = [...assets];

  const byMissingLast = (a: number | undefined, b: number | undefined, descending: boolean) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return descending ? b - a : a - b;
  };

  switch (mode) {
    case 'name':
      sorted.sort(compareByName);
      break;
    case 'nameDesc':
      sorted.sort((a, b) => compareByName(b, a));
      break;
    case 'modified':
      sorted.sort((a, b) => byMissingLast(a.modifiedAt, b.modifiedAt, true) || compareByName(a, b));
      break;
    case 'size':
      sorted.sort((a, b) => byMissingLast(a.sizeBytes, b.sizeBytes, true) || compareByName(a, b));
      break;
    case 'recent':
      sorted.sort(
        (a, b) => byMissingLast(a.lastImportedAt, b.lastImportedAt, true) || compareByName(a, b),
      );
      break;
    case 'added':
      sorted.sort((a, b) => byMissingLast(a.addedAt, b.addedAt, true) || compareByName(a, b));
      break;
    default:
      sorted.sort(compareByName);
  }

  return sorted;
}

/**
 * Full pipeline: filter, then sort.
 *
 * When a query is present the relevance order from `searchAssets` is preserved
 * for the default name sort - re-sorting alphabetically would throw away the
 * ranking the user is relying on. An explicit non-default sort still wins.
 */
export function selectVisibleAssets(
  assets: readonly AssetRecord[],
  criteria: SearchCriteria,
  sortMode: SortMode,
): AssetRecord[] {
  const matched = searchAssets(assets, criteria);

  const hasQuery = tokenizeQuery(criteria.query).length > 0;
  if (hasQuery && sortMode === 'name') return matched;

  return sortAssets(matched, sortMode);
}

/** Immediate subfolders of `prefix` within a library, for the folder tree. */
export function collectSubfolders(
  assets: readonly AssetRecord[],
  folderId: string,
  prefix: string,
): string[] {
  const normalizedPrefix = prefix === '' ? '' : `${prefix}/`;
  const found = new Set<string>();

  for (const asset of assets) {
    if (asset.folderId !== folderId) continue;
    if (normalizedPrefix !== '' && !asset.relativePath.startsWith(normalizedPrefix)) continue;

    const remainder = asset.relativePath.slice(normalizedPrefix.length);
    const separator = remainder.indexOf('/');
    // No separator means the asset sits directly in this folder, not a subfolder.
    if (separator > 0) found.add(remainder.slice(0, separator));
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}
