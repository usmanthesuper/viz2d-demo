"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {VisualizerType} from "./index"
import { useVisualizer, TextureInfo } from "./use-visualizer";

/* ---------------------------------------------------
 Helpers
--------------------------------------------------- */

function getHoverIndex(
  e: React.MouseEvent | React.TouchEvent,
  canvas: HTMLCanvasElement,
  width: number,
  height: number
) {
  let clientX: number | null = null;
  let clientY: number | null = null;

  if ("touches" in e) {
    const t = e.touches[0];
    if (!t) return -1;
    clientX = t.clientX;
    clientY = t.clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const rect = canvas.getBoundingClientRect();

  const x = Math.floor(((clientX - rect.left) / rect.width) * width);
  const y = Math.floor(((clientY - rect.top) / rect.height) * height);

  return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
}

/* ---------------------------------------------------
 Small UI Parts
--------------------------------------------------- */

const TextureSlider = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit:string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) => (
  <div>
    <div className="flex justify-between text-xs">
      <span>{label}</span>
      <span>{value.toFixed(2)}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-cyan-500"
    />
  </div>
);

const SegmentTextureControls = ({
  segmentId,
  tex,
  config,
  onUpdate,
}: {
  segmentId: number;
  tex: TextureInfo;
  config: VisualizerType;
  onUpdate: (segmentId: number, patch: Partial<TextureInfo>) => void;
}) => (
  <div className="mt-2 rounded-md border p-2 space-y-1 bg-muted/30">
    {config.allowScaling && (
      <TextureSlider
        label="Scale"
        value={tex.scale}
        min={0.2}
        max={5}
        step={0.05}
        unit='m'
        onChange={(v) => onUpdate(segmentId, { scale: v })}
      />
    )}

    <TextureSlider
      label="Rotate"
      value={tex.rotation}
      min={-180}
      max={180}
      step={1}
      unit="°"
      onChange={(v) => onUpdate(segmentId, { rotation: v })}
    />

    <TextureSlider
      label="Move X"
      value={tex.offset_x}
      min={-2}
      max={2}
      step={0.05}
      unit="m"
      onChange={(v) => onUpdate(segmentId, { offset_x: v })}
    />

    <TextureSlider
      label="Move Y"
      value={tex.offset_y}
      min={-2}
      max={2}
      step={0.05}
      unit="m"
      onChange={(v) => onUpdate(segmentId, { offset_y: v })}
    />
  </div>
);

/* ---------------------------------------------------
 Texture Selector
--------------------------------------------------- */

const TextureSelector = ({
  open,
  onOpenChange,
  onSelect,
  config,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (file: File, scale: number) => void;
  config: VisualizerType;
}) => {
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  const textures = selectedKeywords.length
    ? config.textures.filter((t: any) =>
      selectedKeywords.some((k) => t.keywords.includes(k))
    )
    : config.textures;

  async function loadSample(url: string, scale: number) {
    const res = await fetch(url);
    const blob = await res.blob();

    const file = new File([blob], "texture.png", {
      type: blob.type || "image/png",
      lastModified: Date.now(),
    });

    onSelect(file, scale);
    onOpenChange(false);
  }

  function loadUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    onSelect(f, 1);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[910]">
        <DialogHeader>
          <DialogTitle>Select Texture</DialogTitle>
        </DialogHeader>

        {config.textureKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {config.textureKeywords.map((k) => {
              const active = selectedKeywords.includes(k);
              return (
                <button
                  key={k}
                  onClick={() =>
                    setSelectedKeywords((p) =>
                      p.includes(k) ? p.filter((x) => x !== k) : [...p, k]
                    )
                  }
                  className={`px-3 py-1 rounded border text-sm ${active
                      ? "bg-primary text-white border-primary"
                      : "hover:bg-muted"
                    }`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        )}

        <ScrollArea className="h-96">
          <div className="flex flex-wrap justify-center gap-4">
            {config.allowUploadingTextures && (
              <label className="w-40 h-40 border shadow rounded flex flex-col gap-3 items-center justify-center cursor-pointer font-semibold">
                <input
                  type="file"
                  accept=".png,.jpg"
                  className="hidden"
                  onChange={loadUpload}
                />
                <Upload />
                Upload
              </label>
            )}

            {textures.map((t: any, i: number) => (
              <div
                key={i}
                className="w-40 h-40 border shadow rounded cursor-pointer"
                onClick={() => loadSample(t.image, t.scale)}
              >
                <img src={t.image} className="w-full h-full object-contain" />
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------------------------------------------
 Main Component
--------------------------------------------------- */

export default function VisualizerMain({
  file,
  config,
  onClose,
}: {
  file: File;
  config: VisualizerType;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    bundleLoaded,
    loadFile,
    segments,
    hoverSeg,
    setHoverSeg,
    applyTextureToSegment,
    updateSegmentTexture,
    removeSegmentTexture,
    drawToCanvas,
    downloadRenderedImage,
    isBundleLoading,
    isTextureLoading,
    imageSize,
    segMap,
  } = useVisualizer();

  const [selectedSeg, setSelectedSeg] = useState<number | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);

  /* Load file */
  useEffect(() => {
    loadFile(file);
  }, [file, loadFile]);

  /* Redraw */
  useEffect(() => {
    if (!bundleLoaded) return;
    if (!canvasRef.current) return;

    drawToCanvas(canvasRef.current, hoverSeg);
  }, [bundleLoaded, hoverSeg, segments, drawToCanvas]);

  /* Canvas interactions */

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !imageSize || !segMap) return;

    const idx = getHoverIndex(
      e,
      canvasRef.current,
      imageSize.width,
      imageSize.height
    );

    setHoverSeg(idx >= 0 ? segMap[idx] : null);
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !imageSize || !segMap) return;
    if (isBundleLoading || isTextureLoading) return;

    const idx = getHoverIndex(
      e,
      canvasRef.current,
      imageSize.width,
      imageSize.height
    );

    if (idx < 0) return;

    const seg = segMap[idx];
    if (seg !== hoverSeg) return;

    setSelectedSeg(seg);
    setSelectorOpen(true);
  };

  return (
    <div className="fixed z-[900] inset-0 bg-accent">
      <div className="flex flex-col-reverse lg:flex-row h-screen w-screen gap-4 md:p-3">
        {/* Sidebar */}
        <aside className="w-full lg:w-80 h-full border rounded-xl p-4 pb-20 space-y-3 overflow-y-auto">
          <div className="flex justify-between gap-2">
            <img
              src={config.companyLogo}
              className="h-10 max-w-40 object-contain"
            />

            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50"
                    disabled={isBundleLoading || isTextureLoading}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </PopoverTrigger>

                <PopoverContent align="end" className="w-40 p-1 z-[910]">
                  <button
                    className="w-full px-3 py-2 text-xs text-left rounded-sm hover:bg-muted"
                    onClick={() =>
                      canvasRef.current &&
                      downloadRenderedImage(canvasRef.current)
                    }
                  >
                    Download image
                  </button>
                </PopoverContent>
              </Popover>

              <Button size="icon" onClick={onClose}>
                <ArrowLeft />
              </Button>
            </div>
          </div>

          <h3 className="text-sm font-semibold">Segments</h3>

          {segments.map((seg,i) => (
            <div
              key={i}
              className="border rounded shadow"
            >
              <div
                className="p-2 cursor-pointer font-medium flex justify-between items-center"
                onMouseOver={() => setHoverSeg(seg.segment_id)}
                onMouseLeave={() => setHoverSeg(null)}
                onClick={() => {
                  setSelectedSeg(seg.segment_id);
                  setSelectorOpen(true);
                }}
              >
                <div className="flex gap-2 items-center">
                <img src={seg.masked_image} className="w-16 object-contain"/>
                {seg.class_name}
                </div>
                {seg.texture &&
                  <Button
                    variant="destructive"
                    size='icon'
                    onClick={(e) => {e.stopPropagation();removeSegmentTexture(seg.segment_id)}}
                  ><Trash2 /></Button>
                }
              </div>

              {seg.texture && (
                <div className="p-2 border-t">
                <SegmentTextureControls
                  segmentId={seg.segment_id}
                  tex={seg.texture}
                  config={config}
                  onUpdate={updateSegmentTexture}
                  />
                  </div>
              )}
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 max-h-[50dvh] lg:max-h-full h-full">
          <div className="relative h-full border overflow-hidden">
            <canvas
              ref={canvasRef}
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverSeg(null)}
              onClick={handleClick}
              onTouchMove={handleMove}
              onTouchCancel={() => setHoverSeg(null)}
              className="block max-w-full max-h-full mx-auto cursor-pointer touch-none"
              style={{
                pointerEvents:
                  isBundleLoading || isTextureLoading ? "none" : "auto",
              }}
            />

            {(isBundleLoading || isTextureLoading) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-sm text-secondary">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                  {isBundleLoading ? "Loading bundle…" : "Applying texture…"}
                </div>
              </div>
            )}
          </div>

          <TextureSelector
            config={config}
            open={selectorOpen}
            onOpenChange={setSelectorOpen}
            onSelect={(file, scale) =>
              selectedSeg != null &&
              applyTextureToSegment(selectedSeg, file, scale)
            }
          />
        </main>
      </div>
    </div>
  );
}
