/**
 * Minimal ambient declarations for the `uxp` host module.
 *
 * Deliberately scoped to the API surface this plugin actually uses, and to what
 * is documented for UXP on Photoshop 25+. Adding a member here is a statement
 * that the member has been verified against Adobe's reference docs.
 */
declare module 'uxp' {
  export namespace storage {
    /** Serialised file metadata returned by `Entry.getMetadata()`. */
    interface EntryMetadata {
      readonly name: string;
      readonly size: number;
      /** Present on most platforms; treat as optional and fall back gracefully. */
      readonly dateCreated?: Date;
      readonly dateModified?: Date;
      readonly isFile: boolean;
      readonly isDirectory: boolean;
    }

    interface Entry {
      readonly isFile: boolean;
      readonly isFolder: boolean;
      readonly name: string;
      /** Absolute platform path. Empty string for some virtual entries. */
      readonly nativePath: string;
      readonly url: string;
      getMetadata(): Promise<EntryMetadata>;
      delete(): Promise<number>;
    }

    interface FileReadOptions {
      format?: symbol;
    }

    interface FileWriteOptions {
      format?: symbol;
      append?: boolean;
    }

    interface File extends Entry {
      readonly isFile: true;
      read(options?: FileReadOptions): Promise<string | ArrayBuffer>;
      write(data: string | ArrayBuffer, options?: FileWriteOptions): Promise<number>;
    }

    interface FolderCreateOptions {
      type?: 'file' | 'folder';
      overwrite?: boolean;
    }

    interface Folder extends Entry {
      readonly isFolder: true;
      getEntries(): Promise<Entry[]>;
      createFile(name: string, options?: FolderCreateOptions): Promise<File>;
      createFolder(name: string): Promise<Folder>;
      /** Rejects if the entry does not exist. */
      getEntry(name: string): Promise<Entry>;
    }

    interface GetFileOptions {
      initialDomain?: symbol;
      types?: string[];
      allowMultiple?: boolean;
    }

    interface LocalFileSystem {
      getFolder(options?: { initialDomain?: symbol }): Promise<Folder | null>;
      getFileForOpening(options?: GetFileOptions): Promise<File | File[] | null>;
      /** Plugin-private persistent storage. Safe for cache and database files. */
      getDataFolder(): Promise<Folder>;
      getTemporaryFolder(): Promise<Folder>;
      getPluginFolder(): Promise<Folder>;
      /**
       * Valid for the current session only. Required by `batchPlay` descriptors
       * that take a `_path`.
       */
      createSessionToken(entry: Entry): string;
      /** Survives restarts; the basis for remembering libraries across sessions. */
      createPersistentToken(entry: Entry): Promise<string>;
      getEntryForPersistentToken(token: string): Promise<Entry>;
      getEntryWithUrl(url: string): Promise<Entry>;
    }

    const localFileSystem: LocalFileSystem;

    /** Encoding sentinels passed to `File.read()` / `File.write()`. */
    const formats: {
      readonly utf8: symbol;
      readonly binary: symbol;
    };

    const domains: {
      readonly userDesktop: symbol;
      readonly userDocuments: symbol;
      readonly userPictures: symbol;
      readonly appLocalLibrary: symbol;
    };
  }

  export namespace shell {
    /** Reveals a path using the OS file manager. Requires `launchProcess`. */
    function openPath(path: string): Promise<void>;
    function openExternal(url: string): Promise<void>;
  }

  export namespace entrypoints {
    interface PanelEntrypoint {
      create?(rootNode: unknown): void;
      show?(event: unknown): void;
      hide?(event: unknown): void;
      destroy?(event: unknown): void;
      invokeMenu?(menuId: string): void;
      menuItems?: Array<{ id: string; label: string; enabled?: boolean; checked?: boolean }>;
    }

    interface SetupOptions {
      panels?: Record<string, PanelEntrypoint>;
      commands?: Record<string, { run: () => void }>;
    }

    function setup(options: SetupOptions): void;
  }

  export const host: {
    readonly name: string;
    readonly version: string;
  };

  export const versions: {
    readonly uxp: string;
    readonly plugin: string;
  };
}
