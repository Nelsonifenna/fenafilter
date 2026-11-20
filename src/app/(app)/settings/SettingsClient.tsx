"use client";

import { Database, ImageIcon, Lock, ShieldCheck, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { api, ApiError, type SessionInfo } from "@/lib/client/api";

export function SettingsClient() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ tone: "accent" | "danger"; text: string } | null>(null);

  useEffect(() => {
    api.session().then(setSession).catch(() => undefined);
  }, []);

  async function clearHistory() {
    if (!window.confirm("Delete all analyses and images from this session? This cannot be undone.")) return;
    setClearing(true);
    setMessage(null);
    try {
      const { items } = await api.history();
      for (const it of items) await api.deleteJob(it.id);
      setMessage({ tone: "accent", text: `Deleted ${items.length} analys${items.length === 1 ? "is" : "es"}.` });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof ApiError ? e.message : "Could not clear history." });
    } finally {
      setClearing(false);
    }
  }

  const svc = session?.services;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your workspace and learn how your data is handled.</p>
      </div>

      <Card>
        <CardHeader icon={<User className="size-4" />} title="Profile" description="You are using FenaFilter as a guest." action={<Badge tone="neutral">Coming soon</Badge>} />
        <div className="p-5 text-sm text-muted">
          Accounts are not required. Sign-in (to keep history across devices) is planned and will not change how analyses work.
        </div>
      </Card>

      <Card>
        <CardHeader icon={<ImageIcon className="size-4" />} title="Image processing" />
        <div className="space-y-3 p-5 text-sm">
          <Row label="Editing method" value="Rows are cut from your original pixels (no AI redrawing)" />
          <Row label="Output format" value="Lossless PNG, same width as the original, metadata removed" />
          <Row label="Fixtures needing review" value="Kept in the image unless you choose Remove" />
          <Row label="Side-by-side layouts" value="Removed fixtures are covered with the background colour when they cannot be cut out" />
        </div>
      </Card>

      <Card>
        <CardHeader icon={<ShieldCheck className="size-4" />} title="Data & privacy" />
        <div className="space-y-3 p-5 text-sm text-muted">
          <p>
            <Lock className="mr-1.5 inline size-3.5 text-accent" aria-hidden />
            Screenshots are stored in private storage and can only be viewed from this browser session. They are never public.
          </p>
          <p>Uploads, results and edited images are deleted automatically after about 24 hours. You can delete them sooner below or from History.</p>
          <p>Your screenshot and your instruction are sent to Google Gemini, which reads the fixtures and interprets the instruction. Team names are used to look up public match statistics on API-Football.</p>
          <p>No API keys or personal data are embedded in your images.</p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Database className="size-4" />} title="Service status" description="Which integrations this installation has configured." />
        <div className="space-y-2 p-5 text-sm">
          {svc ? (
            <>
              <Row label="Fixtures & instructions (Gemini)" value={svc.gemini.configured ? `Configured · ${svc.gemini.model}` : "Not configured"} ok={svc.gemini.configured} />
              <Row label="Football statistics (API-Football)" value={svc.football.configured ? "Configured" : "Not configured"} ok={svc.football.configured} />
              <Row label="Storage" value={svc.storage.mode === "vercel-blob" ? "Private Vercel Blob" : "Local development folder"} ok />
            </>
          ) : (
            <p className="text-muted">Loading…</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader icon={<User className="size-4" />} title="Account" action={<Badge tone="neutral">Coming soon</Badge>} />
        <div className="p-5 text-sm text-muted">Email, password and connected accounts will appear here once sign-in is available.</div>
      </Card>

      <Card className="border-danger/30">
        <CardHeader icon={<Trash2 className="size-4" />} title="Clear history" description="Delete every analysis and image in this session." />
        <div className="space-y-3 p-5">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button variant="danger" onClick={clearHistory} loading={clearing}><Trash2 className="size-4" /> Clear all history</Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-muted">{label}</span>
      <span className={ok === undefined ? "text-fg sm:text-right" : ok ? "text-accent sm:text-right" : "text-warn sm:text-right"}>{value}</span>
    </div>
  );
}
