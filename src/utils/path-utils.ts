/**
 * Path helpers.
 *
 * The plugin runs on both macOS and Windows and receives paths from UXP, from
 * Photoshop and from persisted records. Those sources disagree about separators,
 * so everything is normalised to forward slashes internally and only converted
 * back when handing a path to the host.
 */

/**
 * Converts to forward slashes, collapses repeated separators and drops a
 * trailing separator. A lone root ("/" or "C:/") keeps its slash.
 */
export function normalizePath(input: string): string {
  if (!input) return '';

  let path = input.replace(/\\/g, '/');

  // Collapse runs of slashes, but preserve a leading "//" UNC prefix.
  const isUnc = path.startsWith('//');
  path = path.replace(/\/+/g, '/');
  if (isUnc) path = `/${path}`;

  // Normalise the drive letter so "c:/x" and "C:/x" compare equal.
  path = path.replace(/^([a-z]):\//, (_match, letter: string) => `${letter.toUpperCase()}:/`);

  if (path.length > 1 && path.endsWith('/')) {
    const isDriveRoot = /^[A-Z]:\/$/.test(path);
    if (!isDriveRoot) path = path.slice(0, -1);
  }

  return path;
}

/** Final path segment, including the extension. */
export function basename(input: string): string {
  const path = normalizePath(input);
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

/** Parent directory. Returns '' when there is no parent. */
export function dirname(input: string): string {
  const path = normalizePath(input);
  const index = path.lastIndexOf('/');
  if (index === -1) return '';
  if (index === 0) return '/';
  return path.slice(0, index);
}

/**
 * Lower-case extension without the dot. Dotfiles such as `.gitignore` have no
 * extension, and a trailing dot yields none.
 */
export function extname(input: string): string {
  const name = basename(input);
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return '';
  return name.slice(index + 1).toLowerCase();
}

/** Filename without its extension. */
export function stemname(input: string): string {
  const name = basename(input);
  const index = name.lastIndexOf('.');
  if (index <= 0) return name;
  return name.slice(0, index);
}

/** Joins segments, ignoring empty ones. */
export function joinPath(...segments: string[]): string {
  const joined = segments.filter((segment) => segment !== '' && segment != null).join('/');
  return normalizePath(joined);
}

/**
 * Case-insensitive comparison. macOS and Windows are both case-insensitive by
 * default, so treating paths as case-sensitive would create duplicate index
 * entries after a rename that only changed case.
 */
export function pathsEqual(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

/** True when `child` is inside `root` (or is `root`). */
export function isSubPath(root: string, child: string): boolean {
  const normalizedRoot = normalizePath(root).toLowerCase();
  const normalizedChild = normalizePath(child).toLowerCase();

  if (normalizedRoot === normalizedChild) return true;
  // The separator check prevents "/a/bc" matching root "/a/b".
  return normalizedChild.startsWith(`${normalizedRoot}/`);
}

/**
 * Path of `child` relative to `root`. Returns the normalised absolute path when
 * `child` is not inside `root`, so display never silently shows a wrong path.
 */
export function relativePath(root: string, child: string): string {
  const normalizedChild = normalizePath(child);
  if (!isSubPath(root, child)) return normalizedChild;

  const normalizedRoot = normalizePath(root);
  if (normalizedRoot === normalizedChild) return '';
  return normalizedChild.slice(normalizedRoot.length + 1);
}

/** Path segments, excluding empties. Used for breadcrumbs. */
export function pathSegments(input: string): string[] {
  return normalizePath(input)
    .split('/')
    .filter((segment) => segment !== '');
}

/**
 * Converts to a `file:` URL for `<img src>`.
 *
 * UXP accepts `file:/absolute/path`. Characters that would terminate or
 * misparse the URL are percent-encoded; separators are not.
 */
export function toFileUrl(input: string): string {
  const path = normalizePath(input);
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  // Windows paths already begin with a drive letter rather than a slash.
  return encoded.startsWith('/') ? `file:${encoded}` : `file:/${encoded}`;
}

/** Shortens a long path for display, keeping the head and tail readable. */
export function truncatePathForDisplay(input: string, maxSegments = 4): string {
  const segments = pathSegments(input);
  if (segments.length <= maxSegments) return normalizePath(input);

  const head = segments.slice(0, 1);
  const tail = segments.slice(-(maxSegments - 1));
  return [...head, '...', ...tail].join('/');
}
