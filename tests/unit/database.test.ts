import { describe, expect, it } from 'vitest';
import { InMemoryPluginStorage } from '../../src/adapters/filesystem/plugin-storage';
import { JsonDocumentStore } from '../../src/services/database.service';

interface Doc {
  items: string[];
}

function makeStore(storage: InMemoryPluginStorage, overrides: Partial<{ version: number }> = {}) {
  return new JsonDocumentStore<Doc>(storage, 'database/test.json', {
    version: overrides.version ?? 2,
    createDefault: () => ({ items: [] }),
    migrate: (data, fromVersion) => {
      // v1 stored a bare array; v2 wraps it in an object.
      if (fromVersion === 1 && Array.isArray(data)) return { items: data as string[] };
      throw new Error(`unsupported version ${fromVersion}`);
    },
    normalize: (data) => {
      const input = data as Partial<Doc>;
      return { items: Array.isArray(input?.items) ? input.items : [] };
    },
  });
}

describe('JsonDocumentStore', () => {
  it('returns the default when nothing is stored', async () => {
    const store = makeStore(new InMemoryPluginStorage());
    expect(await store.load()).toEqual({ items: [] });
  });

  it('round-trips a saved document', async () => {
    const storage = new InMemoryPluginStorage();
    const store = makeStore(storage);

    await store.save({ items: ['a', 'b'] });
    expect(await store.load()).toEqual({ items: ['a', 'b'] });
  });

  it('removes the temp file after a successful write', async () => {
    const storage = new InMemoryPluginStorage();
    await makeStore(storage).save({ items: ['a'] });

    expect(await storage.exists('database/test.json')).toBe(true);
    expect(await storage.exists('database/test.json.tmp')).toBe(false);
  });

  it('recovers from an interrupted write using the verified temp file', async () => {
    const storage = new InMemoryPluginStorage();
    const store = makeStore(storage);

    // Simulate a crash between steps 3 and 4: temp holds good data, the primary
    // file was truncated mid-write.
    await storage.writeText(
      'database/test.json.tmp',
      JSON.stringify({ version: 2, data: { items: ['recovered'] } }),
    );
    await storage.corrupt('database/test.json', '{"version":2,"data":{"ite');

    expect(await store.load()).toEqual({ items: ['recovered'] });
    // Recovery promotes the temp copy and cleans up.
    expect(await storage.exists('database/test.json.tmp')).toBe(false);
    expect(await store.load()).toEqual({ items: ['recovered'] });
  });

  it('falls back to defaults when both copies are corrupt', async () => {
    const storage = new InMemoryPluginStorage();
    await storage.corrupt('database/test.json');
    await storage.corrupt('database/test.json.tmp');

    expect(await makeStore(storage).load()).toEqual({ items: [] });
  });

  it('migrates an older document', async () => {
    const storage = new InMemoryPluginStorage();
    await storage.writeText(
      'database/test.json',
      JSON.stringify({ version: 1, data: ['from-v1'] }),
    );

    expect(await makeStore(storage).load()).toEqual({ items: ['from-v1'] });
  });

  it('falls back to defaults when a migration throws', async () => {
    const storage = new InMemoryPluginStorage();
    await storage.writeText(
      'database/test.json',
      JSON.stringify({ version: 1, data: { unexpected: true } }),
    );

    expect(await makeStore(storage).load()).toEqual({ items: [] });
  });

  it('refuses a document written by a newer build rather than mangling it', async () => {
    const storage = new InMemoryPluginStorage();
    await storage.writeText(
      'database/test.json',
      JSON.stringify({ version: 99, data: { items: ['future'] } }),
    );

    // Falls back to defaults; crucially it does not overwrite on load, so a
    // downgrade-then-upgrade round trip does not destroy the newer file.
    expect(await makeStore(storage).load()).toEqual({ items: [] });
    const raw = await storage.readText('database/test.json');
    expect(raw).toContain('"version":99');
  });

  it('normalises a payload whose shape is wrong', async () => {
    const storage = new InMemoryPluginStorage();
    await storage.writeText(
      'database/test.json',
      JSON.stringify({ version: 2, data: { items: 'not-an-array' } }),
    );

    expect(await makeStore(storage).load()).toEqual({ items: [] });
  });

  it('coalesces a burst of deferred saves and persists the last value', async () => {
    const storage = new InMemoryPluginStorage();
    const store = makeStore(storage);

    store.saveDeferred({ items: ['1'] });
    store.saveDeferred({ items: ['2'] });
    const last = store.saveDeferred({ items: ['3'] });
    await last;
    await store.flush();

    expect(await store.load()).toEqual({ items: ['3'] });
  });

  it('clears both files on reset', async () => {
    const storage = new InMemoryPluginStorage();
    const store = makeStore(storage);
    await store.save({ items: ['a'] });

    await store.reset();
    expect(await storage.exists('database/test.json')).toBe(false);
    expect(await store.load()).toEqual({ items: [] });
  });
});
