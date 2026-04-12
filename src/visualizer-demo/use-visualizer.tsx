"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { VizEngine, TextureInfo, EngineOutput } from "@viz2d/sdk"; // adjust path

// ----------------------
// Types
// ----------------------

export type SegmentWithTexture = {
  id: number;
  className: string;
  mask: Uint32Array;
  area: number;
  maskedImage: string;
  texture?: TextureInfo;
  appliedCatalogTexture?: { image: string; name: string };
};

type ImageSize = { width: number; height: number };

// ----------------------
// Utils (unchanged)
// ----------------------

function createMaskedImage(
  mask: Uint32Array,
  pixels: Uint8Array,
  width: number,
  height: number,
  maxWidth = 250,
  maxHeight = 250,
  borderWidth = 4
): string {
  const size = width * height;
  const data = new Uint8ClampedArray(pixels);

  const maskMap = new Uint8Array(size);
  for (let i = 0; i < mask.length; i++) {
    maskMap[mask[i]] = 1;
  }

  for (let i = 0; i < size; i++) {
    if (!maskMap[i]) {
      const idx = i * 4;
      data[idx] *= 0.35;
      data[idx + 1] *= 0.35;
      data[idx + 2] *= 0.35;
    }
  }

  const bw = borderWidth;

  for (let k = 0; k < mask.length; k++) {
    const i = mask[k];
    const x = i % width;
    const y = (i / width) | 0;

    const isEdge =
      (x > 0 && !maskMap[i - 1]) ||
      (x < width - 1 && !maskMap[i + 1]) ||
      (y > 0 && !maskMap[i - width]) ||
      (y < height - 1 && !maskMap[i + width]);

    if (!isEdge) continue;

    for (let dy = -bw; dy <= bw; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;

      const row = ny * width;

      for (let dx = -bw; dx <= bw; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;

        const bi = row + nx;
        const idx = bi * 4;

        data[idx] = 0;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
    }
  }

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;

  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.putImageData(new ImageData(data, width, height), 0, 0);

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;

  const outCtx = outCanvas.getContext("2d")!;
  outCtx.drawImage(srcCanvas, 0, 0, outW, outH);

  return outCanvas.toDataURL("image/png");
}

// ----------------------
// Hook
// ----------------------

export function useVisualizer(allowedClasses: string[]) {
  const engineRef = useRef(new VizEngine());
  const engine = engineRef.current;

  const [segments, setSegments] = useState<SegmentWithTexture[]>([]);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);

  const [bundleLoaded, setBundleLoaded] = useState(false);
  const [isBundleLoading, setIsBundleLoading] = useState(false);
  const [isTextureLoading, setIsTextureLoading] = useState(false);

  const [hoverSeg, setHoverSeg] = useState<number | null>(null);
  const [imageVersion, setImageVersion] = useState(0);

  // ----------------------
  // Derived
  // ----------------------

  const filteredSegments = useMemo(() => {
    return segments
      .filter(
        (s) =>
          s.area > 2000 &&
          (allowedClasses.length === 0 ||
            allowedClasses.includes(s.className))
      )
      .sort((a, b) => {
        if (a.texture && !b.texture) return -1;
        if (!a.texture && b.texture) return 1;
        return b.area - a.area;
      });
  }, [segments, allowedClasses]);

  const segMap = useMemo(() => {
    if (!imageSize) return null;

    const map = new Int32Array(
      imageSize.width * imageSize.height
    ).fill(-1);

    for (const seg of filteredSegments) {
      for (const idx of seg.mask) {
        map[idx] = seg.id;
      }
    }

    return map;
  }, [filteredSegments, imageSize]);

  // ----------------------
  // Actions
  // ----------------------

  const loadFile = useCallback(async (file: File) => {
    setIsBundleLoading(true);
    try {
      const out: EngineOutput = await engine.loadViz2dFile(file);

      const parsed: SegmentWithTexture[] = out.segments.map((s) => ({
        id: s.id,
        className: s.className,
        mask: s.mask,
        area: s.mask.length,
        maskedImage: createMaskedImage(
          s.mask,
          out.image.pixels,
          out.image.width,
          out.image.height
        ),
      }));

      setSegments(parsed);
      setImageSize({
        width: out.image.width,
        height: out.image.height,
      });

      setBundleLoaded(true);
      setImageVersion((v) => v + 1);
    } finally {
      setIsBundleLoading(false);
    }
  }, [engine]);

  const applyTextureToSegment = useCallback(
    async (
      segmentId: number,
      file: File,
      scale = 1,
      catalog?: { image: string; name: string }
    ) => {
      const seg = filteredSegments.find((s) => s.id === segmentId);
      if (!seg) return;

      setIsTextureLoading(true);

      try {
        const texture = await engine.applyTexture(seg.mask, file, {
          scale,
        });

        setSegments((prev) =>
          prev.map((s) =>
            s.id === segmentId
              ? {
                  ...s,
                  texture,
                  appliedCatalogTexture: catalog,
                }
              : s
          )
        );

        setImageVersion((v) => v + 1);
      } finally {
        setIsTextureLoading(false);
        setHoverSeg(null);
      }
    },
    [engine, filteredSegments]
  );

  const updateSegmentTexture = useCallback(
    async (segmentId: number, patch: Partial<TextureInfo>) => {
      const seg = filteredSegments.find((s) => s.id === segmentId);
      if (!seg?.texture) return;

      setIsTextureLoading(true);

      try {
        const updated = await engine.updateTexture(seg.texture.id, patch);

        setSegments((prev) =>
          prev.map((s) =>
            s.id === segmentId
              ? { ...s, texture: updated||undefined }
              : s
          )
        );

        setImageVersion((v) => v + 1);
      } finally {
        setIsTextureLoading(false);
      }
    },
    [engine, filteredSegments]
  );

  const removeSegmentTexture = useCallback(
    async (segmentId: number) => {
      const seg = filteredSegments.find((s) => s.id === segmentId);
      if (!seg?.texture) return;

      setIsTextureLoading(true);

      try {
        await engine.removeTexture(seg.texture.id);

        setSegments((prev) =>
          prev.map((s) =>
            s.id === segmentId
              ? { ...s, texture: undefined, appliedCatalogTexture: undefined }
              : s
          )
        );

        setImageVersion((v) => v + 1);
      } finally {
        setIsTextureLoading(false);
      }
    },
    [engine, filteredSegments]
  );

  // ----------------------
  // Rendering
  // ----------------------

  const drawToCanvas = useCallback(
    (canvas: HTMLCanvasElement, highlightSeg?: number | null) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const out = engine.getOutput();

      const img = new ImageData(
        new Uint8ClampedArray(out.pixels),
        out.width,
        out.height
      );

      if (highlightSeg != null) {
        const seg = filteredSegments.find((s) => s.id === highlightSeg);
        if (seg) {
          for (const i of seg.mask) {
            const idx = i * 4;
            img.data[idx] *= 0.6;
            img.data[idx + 1] = img.data[idx + 1] * 0.5 + 120;
            img.data[idx + 2] *= 0.6;
          }
        }
      }

      canvas.width = out.width;
      canvas.height = out.height;
      ctx.putImageData(img, 0, 0);
    },
    [engine, filteredSegments]
  );

  const downloadRenderedImage = useCallback((canvas: HTMLCanvasElement) => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL();
    a.download = "download.png";
    a.click();
  }, []);

  // ----------------------
  // API
  // ----------------------

  return {
    bundleLoaded,
    isBundleLoading,
    isTextureLoading,
    imageSize,
    segments: filteredSegments,
    segMap,
    hoverSeg,
    imageVersion,

    setHoverSeg,

    loadFile,
    applyTextureToSegment,
    updateSegmentTexture,
    removeSegmentTexture,
    drawToCanvas,
    downloadRenderedImage,
  };
}