"use client";

import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateFile } from "@/lib/client/upload";
import { Button, cn } from "../ui/primitives";

/** Drag-and-drop / click / paste image picker with preview and validation. */
export function Dropzone({ file, onChange, disabled }: { file: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // Dimensions are remembered per file so a replaced image never shows stale values.
  const [measured, setMeasured] = useState<{ file: File; w: number; h: number } | null>(null);
  const dims = measured && measured.file === file ? measured : null;

  const accept = useCallback(
    (f: File | undefined | null) => {
      if (!f) return;
      const err = validateFile(f);
      setError(err);
      if (!err) onChange(f);
    },
    [onChange],
  );

  // Paste from clipboard (Ctrl+V) — handy for screenshots.
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, disabled]);

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {preview && file ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
          <div className="flex max-h-[420px] justify-center overflow-auto bg-ink/60 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={preview} alt="Selected screenshot preview" className="h-auto max-w-full rounded-md" onLoad={(e) => file && setMeasured({ file, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-xs text-muted">
                {(file.size / 1024 / 1024).toFixed(2)} MB{dims ? ` · ${dims.w}×${dims.h}px` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={disabled}>
                <RefreshCw className="size-3.5" aria-hidden /> Replace
              </Button>
              <Button variant="danger" size="sm" onClick={() => { onChange(null); setError(null); }} disabled={disabled}>
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files?.[0]); }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            drag ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2/60 hover:border-accent/50 hover:bg-surface-2",
          )}
        >
          <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
            {drag ? <ImagePlus className="size-6" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
          </span>
          <span className="text-sm font-medium">{drag ? "Drop the screenshot here" : "Drag & drop a screenshot, or click to choose"}</span>
          <span className="text-xs text-muted">PNG, JPG or WEBP · up to 10 MB · you can also paste with Ctrl+V</span>
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
