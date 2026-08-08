/**
 * Minimal ambient declarations for the `photoshop` host module.
 *
 * Scoped to the documented API surface this plugin uses on Photoshop 25+.
 * `batchPlay` descriptors are intentionally loose (`ActionDescriptor`) because
 * they are data, not typed API - they are validated at runtime instead.
 */
declare module 'photoshop' {
  /** An Action Manager descriptor. Shape depends entirely on `_obj`. */
  export type ActionDescriptor = Record<string, unknown>;

  export interface BatchPlayOptions {
    synchronousExecution?: boolean;
    modalBehavior?: 'wait' | 'execute' | 'fail';
    /** Suppresses Photoshop's own progress/alert dialogs where supported. */
    dialogOptions?: 'silent' | 'dontDisplay' | 'display';
  }

  export namespace action {
    function batchPlay(
      descriptors: ActionDescriptor[],
      options?: BatchPlayOptions,
    ): Promise<ActionDescriptor[]>;

    function addNotificationListener(
      events: Array<string | { event: string }>,
      callback: (event: string, descriptor: ActionDescriptor) => void,
    ): Promise<void>;

    function removeNotificationListener(
      events: Array<string | { event: string }>,
      callback: (event: string, descriptor: ActionDescriptor) => void,
    ): Promise<void>;
  }

  export interface ExecuteAsModalOptions {
    commandName: string;
    /** Marks the operation as interruptible by the user. */
    interactive?: boolean;
  }

  export interface ExecutionContext {
    /** Reports progress for long operations. */
    reportProgress(options: { value: number; commandName?: string }): void;
    isCancelled: boolean;
  }

  export namespace core {
    function executeAsModal<T>(
      callback: (context: ExecutionContext, descriptor: unknown) => Promise<T>,
      options: ExecuteAsModalOptions,
    ): Promise<T>;

    function showAlert(message: string | { message: string }): Promise<void>;
  }

  export interface Bounds {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
  }

  export interface Layer {
    readonly id: number;
    name: string;
    readonly bounds: Bounds;
    readonly kind: string;
    selected: boolean;
    visible: boolean;
  }

  export interface Document {
    readonly id: number;
    readonly title: string;
    readonly width: number;
    readonly height: number;
    readonly resolution: number;
    readonly layers: Layer[];
    readonly activeLayers: Layer[];
    readonly path?: string;
    close(saveDialogOptions?: unknown): Promise<void>;
  }

  export const app: {
    readonly activeDocument: Document | null;
    readonly documents: Document[];
    open(entry?: unknown): Promise<Document>;
    showAlert(message: string): Promise<void>;
  };

  /** Pixel data handle. Must be disposed - Photoshop images can be very large. */
  export interface PhotoshopImageData {
    readonly width: number;
    readonly height: number;
    readonly colorSpace: string;
    readonly hasAlpha: boolean;
    readonly components: number;
    readonly componentSize: number;
    getData(options?: { chunky?: boolean }): Promise<ArrayBuffer>;
    dispose(): void;
  }

  export interface GetPixelsOptions {
    documentID?: number;
    layerID?: number;
    sourceBounds?: { left: number; top: number; right: number; bottom: number };
    /**
     * Scaling target. Supplying this lets Photoshop serve a cached pyramid level
     * instead of the full-resolution canvas, which is dramatically faster.
     */
    targetSize?: { width?: number; height?: number };
    colorSpace?: 'RGB' | 'Grayscale' | 'Lab';
    colorProfile?: string;
    componentSize?: number;
    /** Flattens RGBA onto white. Required before JPEG encoding. */
    applyAlpha?: boolean;
  }

  export interface EncodeImageDataOptions {
    imageData: PhotoshopImageData;
    /** Returns a base64 string rather than a byte array. */
    base64?: boolean;
  }

  export namespace imaging {
    function getPixels(options?: GetPixelsOptions): Promise<{
      imageData: PhotoshopImageData;
      sourceBounds: { left: number; top: number; right: number; bottom: number };
    }>;

    function encodeImageData(
      options: EncodeImageDataOptions,
    ): Promise<string | number[]>;
  }
}
