// Redimensiona y comprime imágenes en el navegador antes de subirlas (ahorra datos móviles y
// espacio de Storage). Una foto de móvil de 4-8 MB queda en ~150-300 KB.

async function toBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      // 'from-image' aplica la orientación EXIF: las fotos del móvil no salen giradas.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* formato no soportado por createImageBitmap: se prueba con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File|Blob} file
 * @param {{maxSize?:number, quality?:number}} [opts] maxSize = lado mayor máximo en px
 * @returns {Promise<Blob>} JPEG
 */
export async function resizeImage(file, { maxSize = 1200, quality = 0.82 } = {}) {
  const bitmap = await toBitmap(file);
  const width = bitmap.width ?? bitmap.naturalWidth;
  const height = bitmap.height ?? bitmap.naturalHeight;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // los PNG con transparencia no deben quedar negros en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  // Si ya era pequeña y el resultado pesa más, nos quedamos con el original.
  return scale === 1 && file.type === 'image/jpeg' && blob.size > file.size ? file : blob;
}

export const isImage = (file) => file.type.startsWith('image/');

/** Prepara adjuntos: las imágenes se comprimen (lado mayor 1600 px, legible para documentos); los PDF pasan tal cual. */
export async function prepareAttachment(file) {
  if (!isImage(file)) return file;
  const blob = await resizeImage(file, { maxSize: 1600, quality: 0.8 });
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
