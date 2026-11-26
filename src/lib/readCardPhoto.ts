import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export async function readCardPhoto(file: File, qrPass = false) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, qrPass ? [BarcodeFormat.QR_CODE] : [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.CODABAR]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const scale = Math.min(1, 1900 / Math.max(image.naturalWidth, image.naturalHeight));
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Photo reader unavailable');
    // Try upright and sideways cards with small corrections for hand-held photos.
    for (const tilt of [0, 4, -4, 8, -8]) {
      for (const orientation of [0, 90]) {
        const angle = (orientation + tilt) * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
        canvas.width = Math.ceil(w * cos + h * sin);
        canvas.height = Math.ceil(w * sin + h * cos);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        ctx.drawImage(image, -w / 2, -h / 2, w, h);
        try { return reader.decodeFromCanvas(canvas).getText(); } catch { /* Try the next angle. */ }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    throw new Error('Barcode unreadable');
  } finally {
    URL.revokeObjectURL(url);
  }
}
