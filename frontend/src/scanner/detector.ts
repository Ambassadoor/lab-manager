import { BarcodeDetector as ZXingDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
// The decoder's WebAssembly, bundled and served with the app. The library
// would otherwise fetch it from a CDN when the camera first opens.
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// What both detectors offer: decode the barcodes in a video frame.
export type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Labels carry QR codes; Lipscomb ID cards carry Code 39.
export type ScanFormat = 'qr_code' | 'code_39';

type NativeDetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? zxingWasmUrl : prefix + path,
  },
});

// Android Chrome has a built-in detector, which is faster; iOS Safari and
// desktop browsers mostly don't, so they get the zxing WebAssembly decoder
// through the same API. The built-in one is used only if it reads every
// format asked for. Each extra format costs decode time, most with zxing,
// so ask only for what the page takes.
export async function createDetector(formats: ScanFormat[]): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  try {
    const supported = Native ? await Native.getSupportedFormats() : [];
    if (Native && formats.every((f) => supported.includes(f))) {
      return new Native({ formats });
    }
  } catch {
    // Fall through to the decoder below
  }
  return new ZXingDetector({ formats });
}
