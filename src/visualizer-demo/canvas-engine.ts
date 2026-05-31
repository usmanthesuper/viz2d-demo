export interface TextureInfo {
  id: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}

interface TextureLayer {
  info: TextureInfo;
  mask: Uint32Array;
  texPixels: Uint8ClampedArray;
  texW: number;
  texH: number;
  hinv: number[] | null; // 9-element row-major H_inv for perspective UV
  edgeWeight: Float32Array; // per-pixel blend weight (0=edge, 1=interior)
}

export class CanvasEngine {
  private basePixels: Uint8ClampedArray | null = null;
  private width = 0;
  private height = 0;
  private layers = new Map<number, TextureLayer>();
  private nextId = 1;
  private cache: Uint8ClampedArray | null = null;
  private dirty = true;

  loadImage(pixels: Uint8ClampedArray, width: number, height: number) {
    this.basePixels = new Uint8ClampedArray(pixels);
    this.width = width;
    this.height = height;
    this.layers.clear();
    this.dirty = true;
  }

  async applyTexture(
    mask: Uint32Array,
    file: File,
    options: { scale: number },
    hinv: number[] | null = null
  ): Promise<TextureInfo> {
    const { pixels, width, height } = await readImagePixels(file);
    const id = this.nextId++;
    const info: TextureInfo = {
      id,
      scale: options.scale,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
    };
    const edgeWeight = computeEdgeWeight(mask, this.width, this.height);
    this.layers.set(id, {
      info,
      mask,
      texPixels: pixels,
      texW: width,
      texH: height,
      hinv,
      edgeWeight,
    });
    this.dirty = true;
    return { ...info };
  }

  updateTexture(id: number, patch: Partial<TextureInfo>): TextureInfo | null {
    const layer = this.layers.get(id);
    if (!layer) return null;
    layer.info = { ...layer.info, ...patch };
    this.dirty = true;
    return { ...layer.info };
  }

  removeTexture(id: number) {
    this.layers.delete(id);
    this.dirty = true;
  }

  getOutput(): { pixels: Uint8ClampedArray; width: number; height: number } {
    if (!this.basePixels) {
      return { pixels: new Uint8ClampedArray(0), width: 0, height: 0 };
    }
    if (!this.dirty && this.cache) {
      return { pixels: this.cache, width: this.width, height: this.height };
    }

    const out = new Uint8ClampedArray(this.basePixels);
    for (const layer of this.layers.values()) {
      composite(out, this.basePixels, this.width, this.height, layer);
    }
    this.cache = out;
    this.dirty = false;
    return { pixels: out, width: this.width, height: this.height };
  }
}

// Compute a soft blend weight per mask pixel: 0 at mask edges, 1 deep inside.
// Uses a simple distance-to-edge approximation via a flood of feather radius.
function computeEdgeWeight(
  mask: Uint32Array,
  imgW: number,
  imgH: number,
  feather = 6
): Float32Array {
  const size = imgW * imgH;
  const inMask = new Uint8Array(size);
  for (let i = 0; i < mask.length; i++) inMask[mask[i]] = 1;

  const weight = new Float32Array(mask.length);

  for (let i = 0; i < mask.length; i++) {
    const idx = mask[i];
    const x = idx % imgW;
    const y = (idx / imgW) | 0;

    // min distance to a non-mask pixel within feather radius
    let minDist = feather;
    outer: for (let dy = -feather; dy <= feather; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= imgH) { minDist = 0; break outer; }
      for (let dx = -feather; dx <= feather; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= imgW) { minDist = 0; break outer; }
        if (!inMask[ny * imgW + nx]) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < minDist) minDist = d;
        }
      }
    }
    weight[i] = Math.min(minDist / feather, 1);
  }

  return weight;
}

function composite(
  out: Uint8ClampedArray,
  base: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  layer: TextureLayer
) {
  const { info, mask, texPixels, texW, texH, hinv, edgeWeight } = layer;
  const rad = (info.rotation * Math.PI) / 180;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const scalePixels = Math.max(info.scale, 0.01) * 100;
  const cx = imgW / 2;
  const cy = imgH / 2;

  let h0 = 1, h1 = 0, h2 = 0,
      h3 = 0, h4 = 1, h5 = 0,
      h6 = 0, h7 = 0, h8 = 1;
  if (hinv) {
    [h0, h1, h2, h3, h4, h5, h6, h7, h8] = hinv;
  }

  for (let i = 0; i < mask.length; i++) {
    const pixIdx = mask[i];
    const px = pixIdx % imgW;
    const py = (pixIdx / imgW) | 0;

    // Perspective-correct UV via H_inv
    let fx: number, fy: number;
    if (hinv) {
      const uw = h6 * px + h7 * py + h8;
      if (uw <= 0) continue;
      fx = (h0 * px + h1 * py + h2) / uw;
      fy = (h3 * px + h4 * py + h5) / uw;
    } else {
      fx = px;
      fy = py;
    }

    // Apply rotation + offset in dewarped space
    const dx = fx - cx + info.offsetX * imgW;
    const dy = fy - cy + info.offsetY * imgH;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    // Tile sample
    const tx = (((rx / scalePixels) % texW) + texW) % texW | 0;
    const ty = (((ry / scalePixels) % texH) + texH) % texH | 0;
    const tBase = (ty * texW + tx) * 4;

    // Lighting from original pixel
    const bBase = pixIdx * 4;
    const gray = Math.min(
      1,
      ((base[bBase] * 0.299 + base[bBase + 1] * 0.587 + base[bBase + 2] * 0.114) / 255) * 1.2
    );

    // Soft blend at mask edges
    const alpha = edgeWeight[i];

    out[bBase]     = texPixels[tBase]     * gray * alpha + base[bBase]     * (1 - alpha);
    out[bBase + 1] = texPixels[tBase + 1] * gray * alpha + base[bBase + 1] * (1 - alpha);
    out[bBase + 2] = texPixels[tBase + 2] * gray * alpha + base[bBase + 2] * (1 - alpha);
    out[bBase + 3] = 255;
  }
}

function readImagePixels(
  file: File
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(url);
      resolve({ pixels: data, width: img.width, height: img.height });
    };
    img.src = url;
  });
}
