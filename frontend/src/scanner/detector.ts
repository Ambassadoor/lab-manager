import { BarcodeDetector as ZXingDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
// The decoder's WebAssembly, bundled and served with the app. The library
// would otherwise fetch it from a CDN when the camera first opens.
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// What both detectors offer: decode the barcodes in a video frame.
export type QrDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

type NativeDetectorClass = {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats: () => Promise<string[]>;
};

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? zxingWasmUrl : prefix + path,
  },
});

// Labels carry QR codes. Android Chrome has a built-in detector, which is
// faster; iOS Safari and desktop browsers mostly don't, so they get the
// zxing WebAssembly decoder through the same API.
export async function createQrDetector(): Promise<QrDetector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  try {
    if (Native && (await Native.getSupportedFormats()).includes('qr_code')) {
      return new Native({ formats: ['qr_code'] });
    }
  } catch {
    // Fall through to the decoder below
  }
  return new ZXingDetector({ formats: ['qr_code'] });
}
