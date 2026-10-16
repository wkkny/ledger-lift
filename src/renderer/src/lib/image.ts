/** Longest side sent to the model. A full phone photo overflows its context and slows it down;
 * 1600 px read every row of a 15-row test page correctly, 1200 px skipped one. */
export const MAX_IMAGE_EDGE = 1600;

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.readAsDataURL(blob);
  });
}

/** Shrinks the photo (respecting the phone's rotation) and returns it as base64 JPEG. */
export async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const size = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
  if (size.width === bitmap.width && size.height === bitmap.height && file.type === 'image/jpeg') {
    bitmap.close();
    return toBase64(file);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare that image.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Could not prepare that image.');
  return toBase64(blob);
}
