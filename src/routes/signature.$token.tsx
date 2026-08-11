import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openSignatureDocument, submitSignature, markSignatureStarted } from "@/lib/signature.functions";
import { CheckCircle2, Download, Loader2, PenLine, ShieldCheck, Trash2, XCircle } from "lucide-react";

export const Route = createFileRoute("/signature/$token")({
  head: () => ({
    meta: [
      { title: "Signature électronique — Mercer & Stellaria Corporation" },
      { name: "description", content: "Consultez et signez électroniquement votre devis ou facture en toute sécurité." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Signature électronique sécurisée" },
      { property: "og:description", content: "Signez votre document du Mercer & Stellaria Corporation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Great+Vibes&family=Caveat:wght@600&display=swap",
      },
    ],
  }),
  component: SignaturePage,
});

const STYLES = [
  { id: "dancing", label: "Élégant", font: "'Dancing Script', cursive" },
  { id: "vibes", label: "Classique", font: "'Great Vibes', cursive" },
  { id: "caveat", label: "Manuscrit", font: "'Caveat', cursive" },
];

const SCALE = 1.35;

type Placement = { id: string; page: number; x: number; y: number; w: number; h: number };

function SignaturePage() {
  const { token } = Route.useParams();
  const openFn = useServerFn(openSignatureDocument);
  const startFn = useServerFn(markSignatureStarted);
  const submitFn = useServerFn(submitSignature);

  const [state, setState] = useState<any>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [pages, setPages] = useState<{ width: number; height: number }[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [method, setMethod] = useState<"drawn" | "generated">("drawn");
  const [style, setStyle] = useState(STYLES[0]!.id);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = async (withPin?: string) => {
    setLoading(true);
    setFatalError(null);
    try {
      const r: any = await openFn({ data: { token, pin: withPin ?? null, origin: window.location.origin } });
      setState(r);
    } catch (e: any) {
      const message = e?.message ?? "Lien invalide";
      setFatalError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Rendu du PDF avec pdf.js (fidèle au document original)
  useEffect(() => {
    if (!state?.pdfBase64) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const raw = atob(state.pdfBase64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      if (cancelled) return;
      const dims: { width: number; height: number }[] = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: SCALE });
        dims.push({ width: viewport.width, height: viewport.height });
        setPages([...dims]);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const canvas = canvasRefs.current[n - 1];
        if (!canvas) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (ctx) await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    })().catch(() => toast.error("Impossible d'afficher le document."));
    return () => { cancelled = true; };
  }, [state?.pdfBase64]);

  const locked = Boolean(result) || state?.status === "already_signed";

  const addPlacement = (pageIndex: number, clientX: number, clientY: number) => {
    if (!signatureData || locked) return;
    const canvas = canvasRefs.current[pageIndex];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = 180;
    const h = 70;
    const x = Math.max(0, Math.min(clientX - rect.left - w / 2, rect.width - w));
    const y = Math.max(0, Math.min(clientY - rect.top - h / 2, rect.height - h));
    setPlacements((p) => [...p, { id: crypto.randomUUID(), page: pageIndex + 1, x, y, w, h }]);
  };

  const startDrag = (e: React.PointerEvent, id: string, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    const target = placements.find((p) => p.id === id);
    if (!target || locked) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...target };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPlacements((list) =>
        list.map((p) => {
          if (p.id !== id) return p;
          if (mode === "move") return { ...p, x: Math.max(0, base.x + dx), y: Math.max(0, base.y + dy) };
          return {
            ...p,
            w: Math.max(60, Math.min(base.w + dx, 480)),
            h: Math.max(28, Math.min(base.h + dy, 260)),
          };
        }),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const submit = async () => {
    if (!signatureData || placements.length === 0) return;
    setSubmitting(true);
    try {
      const jpeg = await toJpeg(signatureData);
      const payload = {
        token,
        pin: pin || null,
        origin,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        method,
        style: method === "generated" ? style : null,
        image_base64: jpeg,
        placements: placements.map((p) => ({
          page: p.page,
          x: p.x / SCALE,
          y: p.y / SCALE,
          width: p.w / SCALE,
          height: p.h / SCALE,
        })),
      };
      const r: any = await submitFn({ data: payload });
      setResult(r);
      toast.success("Document signé");
    } catch (e: any) {
      toast.error(e?.message ?? "Signature impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const download = () => {
    if (!result?.base64) return;
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${result.base64}`;
    link.download = result.filename ?? "document-signe.pdf";
    link.click();
  };

  if (loading) {
    return <Centered><Loader2 className="h-6 w-6 animate-spin text-gold" /><p className="mt-3 text-sm text-muted-foreground">Chargement du document sécurisé…</p></Centered>;
  }

  if (fatalError) {
    return (
      <Centered>
        <XCircle className="h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Chargement impossible</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{fatalError}</p>
        <p className="mt-4 text-xs text-muted-foreground">Contactez votre avocat pour régénérer le lien si nécessaire.</p>
      </Centered>
    );
  }

  if (!state || ["not_found", "revoked", "expired", "exhausted", "unsupported_type"].includes(state.status)) {
    const messages: Record<string, string> = {
      not_found: "Ce lien de signature est introuvable.",
      revoked: "Ce lien de signature a été révoqué par l'avocat.",
      expired: "Ce lien de signature a expiré.",
      exhausted: "Ce lien a atteint son nombre maximal d'ouvertures.",
      unsupported_type: "Ce document ne peut pas être signé en ligne (format non PDF).",
    };
    return (
      <Centered>
        <XCircle className="h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Lien indisponible</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{messages[state?.status ?? "not_found"]}</p>
        <p className="mt-4 text-xs text-muted-foreground">Contactez votre avocat pour obtenir un nouveau lien.</p>
      </Centered>
    );
  }

  if (state.status === "pin_required" || state.status === "pin_invalid") {
    return (
      <Centered>
        <ShieldCheck className="h-10 w-10 text-gold" />
        <h1 className="mt-4 text-xl font-semibold">Document protégé</h1>
        <p className="mt-2 text-sm text-muted-foreground">Saisissez le code d'accès communiqué par votre avocat.</p>
        {state.status === "pin_invalid" && <p className="mt-2 text-sm text-destructive">Code incorrect.</p>}
        <div className="mt-5 flex w-full max-w-xs gap-2">
          <Input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" placeholder="Code" />
          <Button onClick={() => void load(pin)} className="bg-navy text-white hover:bg-navy-deep">Valider</Button>
        </div>
      </Centered>
    );
  }

  if (state.status === "already_signed" && !result) {
    return (
      <Centered>
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h1 className="mt-4 text-xl font-semibold">Document déjà signé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.document?.number} — signé par {state.signature?.signer} le{" "}
          {new Date(state.signature?.signed_at).toLocaleString("fr-FR")}
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{state.signature?.signature_uid}</p>
      </Centered>
    );
  }

  const doc = state.document ?? {};
  const docLabel = doc.kind === "matter_document"
    ? "Document"
    : (doc.kind === "quote" ? "Devis" : "Facture");
  const canSign = firstName.trim().length > 1 && lastName.trim().length > 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/95 backdrop-blur">
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Mercer & Stellaria Corporation</p>
            <h1 className="text-lg font-semibold">
              {docLabel} {doc.number}
              {doc.kind !== "matter_document" && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {doc.total?.toFixed?.(2)} {doc.currency}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {result ? (
              <Button onClick={download} className="bg-gold text-navy-deep hover:opacity-90">
                <Download className="mr-1.5 h-4 w-4" />Télécharger le PDF signé
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setDialogOpen(true); void startFn({ data: { token } }); }}>
                  <PenLine className="mr-1.5 h-4 w-4" />{signatureData ? "Modifier ma signature" : "Créer ma signature"}
                </Button>
                <Button
                  disabled={!canSign || !signatureData || placements.length === 0 || submitting}
                  onClick={() => void submit()}
                  className="bg-navy text-white hover:bg-navy-deep"
                >
                  {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                  Valider et signer
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_320px]">
        <div ref={containerRef} className="space-y-6">
          {result && (
            <Card className="border-success/40 bg-success/10">
              <CardContent className="flex items-start gap-3 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                <div className="text-sm">
                  <p className="font-semibold">Document signé et scellé</p>
                  <p className="text-muted-foreground">
                    Identifiant de signature : <span className="font-mono">{result.signature_uid}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {pages.map((p, index) => (
            <div key={index} className="relative mx-auto w-fit rounded-lg border border-border/60 bg-white shadow-[var(--shadow-card)]">
              <canvas
                ref={(el) => { canvasRefs.current[index] = el; }}
                onClick={(e) => addPlacement(index, e.clientX, e.clientY)}
                className={signatureData && !locked ? "cursor-copy" : "cursor-default"}
                style={{ width: p.width, height: p.height, display: "block" }}
              />
              {placements.filter((pl) => pl.page === index + 1).map((pl) => (
                <div
                  key={pl.id}
                  onPointerDown={(e) => startDrag(e, pl.id, "move")}
                  className="group absolute rounded border-2 border-dashed border-gold/80 bg-white/40"
                  style={{ left: pl.x, top: pl.y, width: pl.w, height: pl.h, touchAction: "none" }}
                >
                  {signatureData && (
                    <img src={signatureData} alt="Signature" className="h-full w-full object-contain" draggable={false} />
                  )}
                  {!locked && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPlacements((l) => l.filter((x) => x.id !== pl.id)); }}
                        className="absolute -right-3 -top-3 rounded-full bg-destructive p-1 text-white opacity-0 transition group-hover:opacity-100"
                        aria-label="Retirer la signature"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <span
                        onPointerDown={(e) => startDrag(e, pl.id, "resize")}
                        className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-sm bg-gold"
                        style={{ touchAction: "none" }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
          {pages.length === 0 && (
            <div className="flex h-64 items-center justify-center rounded-lg border border-border/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <h2 className="text-base font-semibold">Signature du document</h2>
              <p className="text-muted-foreground">
                Émis par Me {doc.owner_name}. {doc.matter_number ? `Dossier ${doc.matter_number}.` : ""}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="fn">Prénom</Label>
                <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={locked} />
                <Label htmlFor="ln">Nom</Label>
                <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={locked} />
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>Renseignez votre prénom et votre nom.</li>
                <li>Créez votre signature (dessinée ou générée).</li>
                <li>Cliquez sur le document pour la positionner, déplacez-la ou redimensionnez-la.</li>
                <li>Validez : le document devient définitif.</li>
              </ol>
              {signatureData && !locked && (
                <div className="rounded-md border border-border/60 bg-card p-2">
                  <img src={signatureData} alt="Aperçu de la signature" className="mx-auto h-14 object-contain" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {placements.length} emplacement{placements.length > 1 ? "s" : ""} sélectionné{placements.length > 1 ? "s" : ""}.
              </p>
            </CardContent>
          </Card>
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            En validant, vous acceptez que votre signature électronique, la date, l'heure et votre adresse IP soient
            enregistrées à des fins de preuve. Un certificat de signature est joint au PDF.
          </p>
        </aside>
      </main>

      <SignatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        method={method}
        setMethod={setMethod}
        style={style}
        setStyle={setStyle}
        fullName={`${firstName} ${lastName}`.trim()}
        onConfirm={(data) => { setSignatureData(data); setDialogOpen(false); }}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      {children}
    </div>
  );
}

function SignatureDialog({
  open, onOpenChange, method, setMethod, style, setStyle, fullName, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  method: "drawn" | "generated";
  setMethod: (m: "drawn" | "generated") => void;
  style: string;
  setStyle: (s: string) => void;
  fullName: string;
  onConfirm: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
  };

  useEffect(() => { if (open && method === "drawn") setTimeout(clear, 30); }, [open, method]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const confirm = () => {
    if (method === "drawn") {
      if (!dirty.current) return;
      onConfirm(canvasRef.current!.toDataURL("image/jpeg", 0.95));
      return;
    }
    const font = STYLES.find((s) => s.id === style)?.font ?? "cursive";
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b1220";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `92px ${font}`;
    ctx.fillText(fullName || "Signature", canvas.width / 2, canvas.height / 2);
    onConfirm(canvas.toDataURL("image/jpeg", 0.95));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Votre signature</DialogTitle>
          <DialogDescription>Dessinez votre signature ou générez-la à partir de votre nom.</DialogDescription>
        </DialogHeader>
        <Tabs value={method} onValueChange={(v) => setMethod(v as "drawn" | "generated")}>
          <TabsList className="w-full">
            <TabsTrigger value="drawn" className="flex-1">Dessiner</TabsTrigger>
            <TabsTrigger value="generated" className="flex-1">Générer</TabsTrigger>
          </TabsList>
          <TabsContent value="drawn" className="mt-4">
            <canvas
              ref={canvasRef}
              width={700}
              height={240}
              className="w-full cursor-crosshair rounded-md border border-border/60 bg-white"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                drawing.current = true;
                const ctx = canvasRef.current!.getContext("2d")!;
                const p = pos(e);
                ctx.strokeStyle = "#0b1220";
                ctx.lineWidth = 3.2;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = canvasRef.current!.getContext("2d")!;
                const p = pos(e);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                dirty.current = true;
              }}
              onPointerUp={() => { drawing.current = false; }}
              onPointerLeave={() => { drawing.current = false; }}
            />
            <Button variant="ghost" size="sm" className="mt-2" onClick={clear}>Effacer</Button>
          </TabsContent>
          <TabsContent value="generated" className="mt-4 space-y-3">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition ${
                  style === s.id ? "border-gold bg-gold/10" : "border-border/60 hover:border-border"
                }`}
              >
                <span className="text-3xl text-foreground" style={{ fontFamily: s.font }}>
                  {fullName || "Votre nom"}
                </span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </button>
            ))}
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={confirm} className="bg-navy text-white hover:bg-navy-deep">Utiliser cette signature</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Convertit une image data-URL en base64 JPEG (fond blanc) pour l'intégration PDF. */
async function toJpeg(dataUrl: string): Promise<string> {
  if (dataUrl.startsWith("data:image/jpeg")) return dataUrl.slice(dataUrl.indexOf(",") + 1);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.95).split(",")[1]!;
}
