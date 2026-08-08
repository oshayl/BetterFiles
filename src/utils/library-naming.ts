/**
 * Turning folder names into library names and categories.
 *
 * Asset packs are not named for what they contain, they are named for how they
 * were sold: "Cyber Label Pack", "CORPORATE ASSET PACK (Vol.1)", "Glyph Pack
 * (Vol.1)". The words that differ between them are the useful part; "PACK",
 * "ASSET" and the volume number are noise repeated on every one.
 *
 * The suggestions here are a starting point the user edits before importing,
 * so a wrong guess costs a keystroke rather than a bad import.
 */

/**
 * Folder names that describe a FILE FORMAT rather than a subject.
 *
 * A pack is routinely laid out as `<Pack Name>/SVG`, so the leaf names the
 * format and the parent names the subject. When the leaf is one of these, the
 * category comes from the parent instead.
 */
const FORMAT_NAMES = new Set([
  'svg',
  'svgs',
  'png',
  'pngs',
  'jpg',
  'jpeg',
  'jpegs',
  'gif',
  'tif',
  'tiff',
  'bmp',
  'webp',
  'ai',
  'eps',
  'pdf',
  'pdfs',
  'psd',
  'psds',
  'psb',
  'vector',
  'vectors',
  'raster',
  'image',
  'images',
  'img',
  'imgs',
  'file',
  'files',
  'asset',
  'assets',
  'export',
  'exports',
  'output',
  'outputs',
  'source',
  'sources',
  'src',
]);

/** Words that appear on every pack and so distinguish nothing. */
const NOISE_WORDS = new Set([
  'pack',
  'packs',
  'asset',
  'assets',
  'collection',
  'set',
  'bundle',
  'folder',
  'vol',
  'volume',
  'v',
  'part',
  'edition',
]);

/** True when a folder name describes a format rather than a subject. */
export function isFormatName(name: string): boolean {
  return FORMAT_NAMES.has(normaliseToken(name));
}

/**
 * Preference order when one pack ships the same artwork in several formats.
 *
 * Vector first, and SVG ahead of the rest of the vector formats: it is the only
 * one that both scales without loss AND renders straight from disk, with no
 * round trip through Photoshop to generate a preview. AI and EPS are vector but
 * need generating; raster formats lose resolution. Lower number wins.
 */
const FORMAT_RANK: ReadonlyMap<string, number> = new Map([
  ['svg', 0],
  ['svgs', 0],
  ['ai', 1],
  ['eps', 2],
  ['pdf', 3],
  ['psd', 4],
  ['psb', 4],
  ['png', 5],
  ['webp', 6],
  ['tif', 7],
  ['tiff', 7],
  ['jpg', 8],
  ['jpeg', 8],
  ['gif', 9],
  ['bmp', 10],
]);

/** Rank of a format folder; `null` when the name is not a known format. */
export function formatRank(name: string): number | null {
  return FORMAT_RANK.get(normaliseToken(name)) ?? null;
}

/**
 * Picks the winner among sibling folders holding the same artwork.
 *
 * Returns the index of the preferred entry. Ties and unknown names fall back to
 * the order given, so a pack whose folders are not format-named is left alone.
 */
export function preferredFormatIndex(names: readonly string[]): number {
  let bestIndex = 0;
  let bestRank = Number.POSITIVE_INFINITY;

  for (let index = 0; index < names.length; index += 1) {
    const rank = formatRank(names[index] ?? '');
    if (rank !== null && rank < bestRank) {
      bestRank = rank;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function normaliseToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Strips packaging noise from a folder name.
 *
 * "CORPORATE ASSET PACK (Vol.1)" -> "Corporate"
 * "Cyber Label Pack"             -> "Cyber Label"
 * "PEOPLE (VOL.1)"               -> "People"
 *
 * Returns an empty string when nothing meaningful survives, which is the
 * caller's signal to look at the parent folder instead.
 */
export function cleanFolderName(name: string): string {
  // Parenthesised and bracketed runs are always volume/version markers here.
  const withoutBrackets = name.replace(/[([{][^)\]}]*[)\]}]/g, ' ');

  const words = withoutBrackets
    .split(/[\s_\-–—.]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => {
      const token = normaliseToken(word);
      if (token === '') return false;
      if (NOISE_WORDS.has(token)) return false;
      if (FORMAT_NAMES.has(token)) return false;
      // A bare number is a volume that lost its label.
      if (/^\d+$/.test(token)) return false;
      // "v1", "vol2" and friends.
      if (/^(?:v|vol|volume|part)\d+$/.test(token)) return false;
      return true;
    });

  return words.map(toTitleCase).join(' ');
}

/**
 * Title-cases a word, but only when it is shouting.
 *
 * Pack folders are frequently ALL CAPS, which reads badly in the sidebar.
 * Deliberate casing like "McQueen" or "3D" is left alone.
 */
function toTitleCase(word: string): string {
  const letters = word.replace(/[^A-Za-z]/g, '');
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word;
}

/**
 * Suggests a category for a folder, preferring the leaf and falling back to
 * its parent when the leaf only names a file format.
 */
export function suggestCategory(leafName: string, parentName?: string): string {
  const fromLeaf = isFormatName(leafName) ? '' : cleanFolderName(leafName);
  if (fromLeaf !== '') return fromLeaf;

  const fromParent = parentName ? cleanFolderName(parentName) : '';
  if (fromParent !== '') return fromParent;

  // Nothing usable anywhere: keep the raw leaf rather than inventing a name.
  return leafName.trim();
}

/**
 * Suggests the library's display name.
 *
 * Unlike the category this keeps the format hint, because two libraries from
 * the same pack ("Logos/SVG" and "Logos/PNG") must be tellable apart in the
 * sidebar.
 */
export function suggestDisplayName(leafName: string, parentName?: string): string {
  if (!isFormatName(leafName)) return leafName;
  const parent = parentName?.trim();
  return parent ? `${parent} (${leafName})` : leafName;
}
