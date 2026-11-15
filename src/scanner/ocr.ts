/**
 * OCR behind a tiny interface, so the recogniser doesn't care whether it runs
 * on Tesseract.js in the browser, in Node tests, or on something better later
 * (a server OCR or a vision model).
 */
import { encodeGrayBMP, type GrayImage } from './image';

export interface OcrResult {
  text: string;
  /** 0..100 as reported by the engine. */
  confidence: number;
}

export interface OcrOptions {
  /**
   * 'line' = a single text line; 'block' = a uniform block of lines;
   * 'sparse' = find whatever text there is, in any layout.
   */
  mode: 'line' | 'block' | 'sparse';
  /** Restrict output to these characters. */
  whitelist?: string;
}

export interface OcrEngine {
  recognize(img: GrayImage, opts: OcrOptions): Promise<OcrResult>;
  terminate(): Promise<void>;
}

const PSM = { line: '7', block: '6', sparse: '11' } as const;

/** The subset of a Tesseract.js worker we use (keeps tesseract.js an optional import). */
export interface TesseractWorkerLike {
  setParameters(params: Record<string, string>): Promise<unknown>;
  recognize(image: unknown): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

/**
 * Wraps a Tesseract.js worker. Images are handed over as BMP bytes, which
 * Tesseract decodes the same way in every environment. `toInput` adapts the
 * bytes for the runtime (Buffer in Node, Blob in the browser).
 */
export function tesseractEngine(worker: TesseractWorkerLike, toInput: (bmp: Uint8Array) => unknown): OcrEngine {
  let lastKey = '';
  // Tesseract workers process one job at a time; serialise so parameter
  // changes can't interleave with another call's recognition.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    recognize(img, opts) {
      const run = async (): Promise<OcrResult> => {
        const key = `${opts.mode}|${opts.whitelist ?? ''}`;
        if (key !== lastKey) {
          await worker.setParameters({
            tessedit_pageseg_mode: PSM[opts.mode],
            tessedit_char_whitelist: opts.whitelist ?? '',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300',
          });
          lastKey = key;
        }
        const { data } = await worker.recognize(toInput(encodeGrayBMP(img)));
        return { text: data.text.trim(), confidence: data.confidence };
      };
      const p = queue.then(run, run);
      queue = p.catch(() => undefined);
      return p;
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
