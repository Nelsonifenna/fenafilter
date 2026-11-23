"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateFile } from "@/lib/client/upload";
import { Button, cn } from "../ui/primitives";

/**
 * Upload stage: drag & drop, click, or paste (Ctrl+V).
 * `progress` is the real upload percentage (null when not uploading);
 * `processing` shows an indeterminate bar after upload while the analysis starts.
 */
export function Dropzone({
  file,
  onChange,
  disabled,
  progress = null,
  processing = false,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  disabled?: boolean;
  progress?: number | null;
  processing?: boolean;
}) {
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

  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept, disabled]);

  const fileInput = (
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
  );

  if (preview && file) {
    const kind = file.type.replace("image/", "").toUpperCase();
    return (
      <div className="animate-rise">
        {fileInput}
        <div className="border border-line bg-surface">
          {/* progress rail */}
          <div className={cn("h-[2px] bg-line", processing && "sweep")} role={progress !== null ? "progressbar" : undefined} aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            {progress !== null && <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(2, progress)}%` }} />}
          </div>
          <div className="flex max-h-[min(62vh,560px)] justify-center overflow-auto bg-ink p-4 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={preview} alt="Selected screenshot preview" className="h-auto max-w-full" onLoad={(e) => setMeasured({ file, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          </div>
          <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="col-span-2 min-w-0 bg-surface px-4 py-3 sm:col-span-1">
              <dt className="kicker">File</dt>
              <dd className="mt-1 truncate text-sm">{file.name}</dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="kicker">Size</dt>
              <dd className="mt-1 font-mono text-sm tnum">{(file.size / 1024 / 1024).toFixed(2)} MB</dd>
            </div>
            <div className="bg-surface px-4 py-3">
              <dt className="kicker">Pixels</dt>
              <dd className="mt-1 font-mono text-sm tnum">{dims ? `${dims.w} × ${dims.h}` : "—"}</dd>
            </div>
            <div className="col-span-2 bg-surface px-4 py-3 sm:col-span-1">
              <dt className="kicker">Type</dt>
              <dd className="mt-1 font-mono text-sm">{kind}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[12px] text-muted" aria-live="polite">
            {progress !== null ? `Uploading ${Math.round(progress)}%` : processing ? "Starting analysis" : "Ready to analyse"}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={disabled}>
              <RefreshCw className="size-3.5" aria-hidden /> Replace
            </Button>
            <Button variant="danger" size="sm" onClick={() => { onChange(null); setError(null); }} disabled={disabled}>
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {fileInput}
      <button
        type="button"
        disabled={disabled}
        data-drag={drag}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files?.[0]); }}
        className={cn(
          "corners group grid w-full grid-cols-1 gap-8 p-6 text-left transition-colors sm:p-10 md:grid-cols-[1fr_9rem]",
          drag ? "bg-accent-soft" : "bg-surface hover:bg-surface-2",
        )}
      >
        <span className="flex min-h-56 flex-col justify-between gap-8">
          <span>
            <span className="kicker">{drag ? "Release to load" : "No screenshot loaded"}</span>
            <span className="mt-4 block font-display text-section font-semibold uppercase">
              {drag ? "Drop it here" : "Drag a screenshot onto the stage"}
            </span>
            <span className="mt-3 block max-w-md text-sm text-muted">
              Or click to choose a file. You can also paste a screenshot straight from the clipboard.
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className={cn("inline-flex h-10 items-center rounded-[2px] px-4 text-sm font-semibold transition-colors", drag ? "bg-accent text-accent-ink" : "bg-fg text-ink group-hover:bg-accent group-hover:text-accent-ink")}>
              Choose file
            </span>
            <span className="font-mono text-[12px] text-muted">PNG · JPG · WEBP</span>
            <span className="font-mono text-[12px] text-muted">Max 10 MB</span>
            <span className="hidden font-mono text-[12px] text-muted sm:inline">Ctrl+V to paste</span>
          </span>
        </span>
        {/* Ghosted fixture list — hints at what the stage expects */}
        <span className="hidden flex-col justify-center gap-3 md:flex" aria-hidden>
          {[0.9, 0.7, 0.82, 0.6, 0.76].map((w, i) => (
            <span key={i} className="flex items-center gap-2 border-t border-line pt-3">
              <span className="h-1.5 bg-line-strong transition-colors group-hover:bg-faint" style={{ width: `${w * 100}%` }} />
              <span className="ml-auto h-1.5 w-4 bg-line" />
            </span>
          ))}
        </span>
      </button>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
