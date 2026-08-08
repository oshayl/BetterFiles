import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  extname,
  isSubPath,
  joinPath,
  normalizePath,
  pathSegments,
  pathsEqual,
  relativePath,
  stemname,
  toFileUrl,
  truncatePathForDisplay,
} from '../../src/utils/path-utils';

describe('normalizePath', () => {
  it('converts Windows separators to forward slashes', () => {
    expect(normalizePath('C:\\Users\\me\\Assets')).toBe('C:/Users/me/Assets');
  });

  it('upper-cases the drive letter so paths compare consistently', () => {
    expect(normalizePath('c:/users/me')).toBe('C:/users/me');
  });

  it('collapses repeated separators', () => {
    expect(normalizePath('/Users//me///Assets')).toBe('/Users/me/Assets');
  });

  it('preserves a UNC prefix for network shares', () => {
    expect(normalizePath('\\\\nas\\assets\\logos')).toBe('//nas/assets/logos');
  });

  it('drops a trailing separator but keeps roots intact', () => {
    expect(normalizePath('/Users/me/')).toBe('/Users/me');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('C:/')).toBe('C:/');
  });

  it('returns empty for empty input', () => {
    expect(normalizePath('')).toBe('');
  });
});

describe('basename, dirname, extname, stemname', () => {
  it('splits a normal path', () => {
    expect(basename('/a/b/logo.svg')).toBe('logo.svg');
    expect(dirname('/a/b/logo.svg')).toBe('/a/b');
    expect(extname('/a/b/logo.svg')).toBe('svg');
    expect(stemname('/a/b/logo.svg')).toBe('logo');
  });

  it('lower-cases the extension', () => {
    expect(extname('/a/PHOTO.JPEG')).toBe('jpeg');
  });

  it('treats dotfiles as having no extension', () => {
    expect(extname('/a/.gitignore')).toBe('');
    expect(stemname('/a/.gitignore')).toBe('.gitignore');
  });

  it('treats a trailing dot as having no extension', () => {
    expect(extname('/a/weird.')).toBe('');
  });

  it('handles multiple dots by taking the last segment', () => {
    expect(extname('/a/archive.tar.gz')).toBe('gz');
    expect(stemname('/a/archive.tar.gz')).toBe('archive.tar');
  });

  it('returns / as the parent of a top-level entry', () => {
    expect(dirname('/logo.svg')).toBe('/');
  });
});

describe('joinPath', () => {
  it('joins and normalises segments', () => {
    expect(joinPath('/a', 'b', 'c.png')).toBe('/a/b/c.png');
  });

  it('ignores empty segments rather than producing double slashes', () => {
    expect(joinPath('/a', '', 'c.png')).toBe('/a/c.png');
  });
});

describe('pathsEqual', () => {
  it('ignores case and separator style, matching macOS and Windows behaviour', () => {
    expect(pathsEqual('C:\\Assets\\Logo.png', 'c:/assets/logo.png')).toBe(true);
  });

  it('distinguishes genuinely different paths', () => {
    expect(pathsEqual('/a/b', '/a/c')).toBe(false);
  });
});

describe('isSubPath', () => {
  it('accepts a nested path and the root itself', () => {
    expect(isSubPath('/a/b', '/a/b/c/d.png')).toBe(true);
    expect(isSubPath('/a/b', '/a/b')).toBe(true);
  });

  it('does not treat a sibling with a shared prefix as nested', () => {
    // The classic bug: "/a/bc" must not match root "/a/b".
    expect(isSubPath('/a/b', '/a/bc/d.png')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSubPath('/Assets', '/assets/logo.png')).toBe(true);
  });
});

describe('relativePath', () => {
  it('strips the library root', () => {
    expect(relativePath('/lib', '/lib/brand/logo.svg')).toBe('brand/logo.svg');
  });

  it('returns empty when the path is the root', () => {
    expect(relativePath('/lib', '/lib')).toBe('');
  });

  it('returns the absolute path when outside the root, rather than lying', () => {
    expect(relativePath('/lib', '/other/logo.svg')).toBe('/other/logo.svg');
  });
});

describe('toFileUrl', () => {
  it('builds a file URL for a POSIX path', () => {
    expect(toFileUrl('/Users/me/logo.png')).toBe('file:/Users/me/logo.png');
  });

  it('builds a file URL for a Windows path', () => {
    expect(toFileUrl('C:\\Assets\\logo.png')).toBe('file:/C%3A/Assets/logo.png');
  });

  it('percent-encodes spaces and other characters that would break the URL', () => {
    expect(toFileUrl('/a/my logo #1.png')).toBe('file:/a/my%20logo%20%231.png');
  });

  it('does not encode the separators themselves', () => {
    expect(toFileUrl('/a/b/c.png')).toBe('file:/a/b/c.png');
  });

  it('handles unicode filenames', () => {
    expect(toFileUrl('/a/логотип.png')).toBe(
      `file:/a/${encodeURIComponent('логотип')}.png`,
    );
  });
});

describe('pathSegments and truncatePathForDisplay', () => {
  it('splits into non-empty segments', () => {
    expect(pathSegments('/a/b/c')).toEqual(['a', 'b', 'c']);
  });

  it('leaves short paths alone', () => {
    expect(truncatePathForDisplay('/a/b/c')).toBe('/a/b/c');
  });

  it('elides the middle of long paths', () => {
    expect(truncatePathForDisplay('/a/b/c/d/e/f', 4)).toBe('a/.../d/e/f');
  });
});
