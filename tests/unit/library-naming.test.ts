import { describe, expect, it } from 'vitest';
import {
  cleanFolderName,
  isFormatName,
  suggestCategory,
  suggestDisplayName,
} from '../../src/utils/library-naming';

describe('isFormatName', () => {
  it('recognises format folders whatever their casing', () => {
    for (const name of ['SVG', 'svg', 'PNG', 'Vectors', 'assets']) {
      expect(isFormatName(name), name).toBe(true);
    }
  });

  it('does not mistake a subject for a format', () => {
    for (const name of ['Cyber Label Pack', 'PEOPLE', 'Biomechanical Diagrams', 'Head Icon']) {
      expect(isFormatName(name), name).toBe(false);
    }
  });
});

describe('cleanFolderName', () => {
  // These are the real folder names from the library this was built against.
  it.each([
    ['Cyber Label Pack', 'Cyber Label'],
    ['CORPORATE ASSET PACK (Vol.1)', 'Corporate'],
    ['Glyph Pack (Vol.1)', 'Glyph'],
    ['Cartoon Asset Pack (Vol.1)', 'Cartoon'],
    ['PEOPLE (VOL.1)', 'People'],
    ['HEAD ICON PACK', 'Head Icon'],
    ['Biomechanical Diagrams', 'Biomechanical Diagrams'],
    ['Logo Elements (Volume 01)', 'Logo Elements'],
  ])('%s -> %s', (input, expected) => {
    expect(cleanFolderName(input)).toBe(expected);
  });

  it('returns empty when the name is nothing but noise', () => {
    expect(cleanFolderName('Asset Pack (Vol.1)')).toBe('');
    expect(cleanFolderName('SVG')).toBe('');
  });

  it('leaves deliberate casing alone', () => {
    expect(cleanFolderName('McQueen Textures')).toBe('McQueen Textures');
  });
});

describe('suggestCategory', () => {
  it('uses the parent when the leaf only names a format', () => {
    // The layout this exists for: <Pack Name>/SVG
    expect(suggestCategory('SVG', 'Cyber Label Pack')).toBe('Cyber Label');
    expect(suggestCategory('SVG', 'PEOPLE (VOL.1)')).toBe('People');
  });

  it('uses the leaf when it names a subject', () => {
    expect(suggestCategory('Logo Elements (Volume 01)', 'HVNTER FOLDER')).toBe('Logo Elements');
  });

  it('handles a leaf that mixes subject and format', () => {
    expect(suggestCategory('CORPORATE ASSET - SVG', 'CORPORATE ASSET PACK (Vol.1)')).toBe(
      'Corporate',
    );
  });

  it('falls back to the raw name rather than inventing one', () => {
    expect(suggestCategory('SVG')).toBe('SVG');
    expect(suggestCategory('SVG', 'Assets')).toBe('SVG');
  });
});

describe('suggestDisplayName', () => {
  it('keeps two format folders from one pack distinguishable', () => {
    expect(suggestDisplayName('SVG', 'Logos')).toBe('Logos (SVG)');
    expect(suggestDisplayName('PNG', 'Logos')).toBe('Logos (PNG)');
  });

  it('leaves a meaningful leaf alone', () => {
    expect(suggestDisplayName('Logo Elements', 'HVNTER')).toBe('Logo Elements');
  });
});
