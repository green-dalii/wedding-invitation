/** 带真实进度的图片加载：fetch 流 → Blob → 解码。无 Content-Length 时回调 total=0。 */
export async function loadImage(url: string, onProgress: (loaded: number, total: number) => void): Promise<HTMLImageElement> {
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = +(res.headers.get('content-length') || 0);
    if (res.body && 'getReader' in res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        onProgress(loaded, total);
      }
      blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || 'image/webp' });
    } else {
      blob = await res.blob();
    }
  } catch {
    return decodeUrl(url); // 极端环境降级：直接交给 <img>
  }
  const obj = URL.createObjectURL(blob);
  try { return await decodeUrl(obj); } finally { URL.revokeObjectURL(obj); }
}

function decodeUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

let webpP: Promise<boolean> | null = null;
export function supportsWebp(): Promise<boolean> {
  return (webpP ||= new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i.width === 1);
    i.onerror = () => res(false);
    i.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  }));
}
