import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, PenLine, Save, ShieldCheck, Download, Trash2 } from "lucide-react";
import { getTemplateFields, previewGeneratedTemplatePdf, saveGeneratedTemplatePdf } from "@/lib/doc-templates.functions";
import { listMatters, listMatterTree } from "@/lib/matters.functions";
import { type TemplateField, validateFieldValues } from "@/lib/doc-template-fields";

const SCALE = 1.25;
const STYLES = [
  { id: "dancing", label: "Elegant", font: "'Dancing Script', cursive" },
  { id: "vibes", label: "Classique", font: "'Great Vibes', cursive" },
  { id: "caveat", label: "Manuscrit", font: "'Caveat', cursive" },
] as const;

type Matter = { id: string; number: string | null; title: string; status?: string };
type Folder = { id: string; name: string; parent_id: string | null };
type Placement = { id: string; page: number; x: number; y: number; w: number; h: number };

type Props = {
  templateId: string | null;
  templateName?: string;
  onOpenChange: (open: boolean) => void;
};

export function TemplateGenerateDialog({ templateId, templateName, onOpenChange }: Props) {
  const getFieldsFn = useServerFn(getTemplateFields);
  const previewFn = useServerFn(previewGeneratedTemplatePdf);
  const saveFn = useServerFn(saveGeneratedTemplatePdf);
  const listMattersFn = useServerFn(listMatters);
  const listTreeFn = useServerFn(listMatterTree);

  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ base64: string; filename: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [matters, setMatters] = useState<Matter[]>([]);
  const [matterId, setMatterId] = useState<string>("none");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string>("none");

  const [pages, setPages] = useState<{ width: number; height: number }[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [method, setMethod] = useState<"drawn" | "generated">("drawn");
  const [style, setStyle] = useState<string>(STYLES[0].id);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [signFirstName, setSignFirstName] = useState("");
  const [signLastName, setSignLastName] = useState("");

  const [downloading, setDownloading] = useState(false);

  const hasSignature = Boolean(signatureData) && placements.length > 0;

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);
    setPreview(null);
    setFields([]);
    setValues({});
    setPages([]);
    setPlacements([]);
    void Promise.all([
      getFieldsFn({ data: { template_id: templateId } }),
      listMattersFn({ data: {} }),
    ])
      .then(([f, m]: any) => {
        const loadedFields = (f.fields ?? []) as TemplateField[];
        setFields(loadedFields);
        const initialValues: Record<string, string> = {};
        for (const field of loadedFields) initialValues[field.key] = field.default_value ?? "";
        setValues(initialValues);
        setMatters((m ?? []) as Matter[]);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    if (!templateId || matterId === "none") {
      setFolders([]);
      setFolderId("none");
      return;
    }
    void listTreeFn({ data: { matter_id: matterId } })
      .then((r: any) => {
        setFolders((r.folders ?? []) as Folder[]);
        setFolderId("none");
      })
      .catch((e: Error) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId, templateId]);

  const fieldIssues = useMemo(() => validateFieldValues(fields, values), [fields, values]);

  const generationPayload = useMemo(() => {
    const payload: any = {
      template_id: templateId,
      values,
    };
    if (hasSignature) {
      payload.signature = {
        first_name: signFirstName.trim(),
        last_name: signLastName.trim(),
        method,
        style: method === "generated" ? style : null,
        image_base64: signatureData!.split(",")[1] ?? signatureData,
        placements: placements.map((p) => ({
          page: p.page,
          x: p.x / SCALE,
          y: p.y / SCALE,
          width: p.w / SCALE,
          height: p.h / SCALE,
        })),
      };
    }
    return payload;
  }, [templateId, values, hasSignature, signFirstName, signLastName, method, style, signatureData, placements]);

  useEffect(() => {
    if (!templateId || loading) return;
    const timer = setTimeout(() => {
      setPreviewing(true);
      previewFn({ data: { template_id: templateId, values } })
        .then((r: any) => setPreview({ base64: r.base64, filename: r.filename }))
        .catch((e: Error) => toast.error(e.message))
        .finally(() => setPreviewing(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [templateId, values, loading, previewFn]);

  useEffect(() => {
    if (!preview?.base64) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      const raw = atob(preview.base64);
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
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const canvas = canvasRefs.current[n - 1];
        if (!canvas) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (ctx) await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      }
    })().catch(() => toast.error("Impossible d'afficher l'aperçu PDF."));

    return () => {
      cancelled = true;
    };
  }, [preview?.base64]);

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (matterId === "none") throw new Error("Sélectionnez un dossier client.");
      if (fieldIssues.length > 0) throw new Error(fieldIssues[0]!.message);
      if (hasSignature && (!signFirstName.trim() || !signLastName.trim())) {
        throw new Error("Indiquez le prénom et le nom du signataire.");
      }
      return saveFn({
        data: {
          generation: generationPayload,
          matter_id: matterId,
          folder_id: folderId === "none" ? null : folderId,
          filename: (templateName || "document").trim(),
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Document enregistré: ${r.filename}`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download() {
    if (!templateId) return;
    if (fieldIssues.length > 0) {
      toast.error(fieldIssues[0]!.message);
      return;
    }
    if (hasSignature && (!signFirstName.trim() || !signLastName.trim())) {
      toast.error("Indiquez le prénom et le nom du signataire.");
      return;
    }
    setDownloading(true);
    try {
      const res: any = await previewFn({ data: generationPayload });
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${res.base64}`;
      link.download = res.filename ?? "document.pdf";
      link.click();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  function addPlacement(pageIndex: number, clientX: number, clientY: number) {
    if (!signatureData) return;
    const canvas = canvasRefs.current[pageIndex];
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = 180;
    const h = 70;
    const x = Math.max(0, Math.min(clientX - rect.left - w / 2, rect.width - w));
    const y = Math.max(0, Math.min(clientY - rect.top - h / 2, rect.height - h));
    setPlacements((prev) => [...prev, { id: crypto.randomUUID(), page: pageIndex + 1, x, y, w, h }]);
  }

  function startDrag(e: React.PointerEvent, id: string, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    const target = placements.find((p) => p.id === id);
    if (!target) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const base = { ...target };

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPlacements((list) => list.map((p) => {
        if (p.id !== id) return p;
        if (mode === "move") {
          return { ...p, x: Math.max(0, base.x + dx), y: Math.max(0, base.y + dy) };
        }
        return {
          ...p,
          w: Math.max(60, Math.min(base.w + dx, 480)),
          h: Math.max(28, Math.min(base.h + dy, 260)),
        };
      }));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateField[]>();
    for (const f of fields) {
      const g = f.group || "Divers";
      map.set(g, [...(map.get(g) ?? []), f]);
    }
    return Array.from(map.entries());
  }, [fields]);

  return (
    <Dialog open={Boolean(templateId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generer un document - {templateName}</DialogTitle>
          <DialogDescription>
            Renseignez les champs, visualisez le PDF en temps reel, puis telechargez ou enregistrez dans un dossier client.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="space-y-4">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-semibold">Destination</h3>
                  <div className="space-y-2">
                    <Label>Dossier client</Label>
                    <Select value={matterId} onValueChange={setMatterId}>
                      <SelectTrigger><SelectValue placeholder="Choisir un dossier" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choisir un dossier</SelectItem>
                        {matters.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {(m.number ? `${m.number} - ` : "") + m.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sous-dossier</Label>
                    <Select value={folderId} onValueChange={setFolderId}>
                      <SelectTrigger><SelectValue placeholder="Racine du dossier" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Racine du dossier</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.parent_id ? "↳ " : ""}{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Signature</h3>
                    <Button size="sm" variant="outline" onClick={() => setSignatureDialogOpen(true)}>
                      <PenLine className="mr-2 h-4 w-4" />
                      {signatureData ? "Modifier" : "Creer"}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Prenom</Label>
                      <Input value={signFirstName} onChange={(e) => setSignFirstName(e.target.value)} />
                    </div>
                    <div>
                      <Label>Nom</Label>
                      <Input value={signLastName} onChange={(e) => setSignLastName(e.target.value)} />
                    </div>
                  </div>

                  {signatureData && (
                    <div className="rounded-md border border-border/60 bg-card p-2">
                      <img src={signatureData} alt="Signature" className="mx-auto h-12 object-contain" />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {placements.length} emplacement{placements.length > 1 ? "s" : ""} actif{placements.length > 1 ? "s" : ""}.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <h3 className="font-semibold">Champs</h3>
                  {grouped.map(([group, groupFields]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
                      {groupFields.map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label htmlFor={`field-${f.key}`}>{f.label}{f.required ? " *" : ""}</Label>
                          {f.type === "textarea" ? (
                            <textarea
                              id={`field-${f.key}`}
                              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                              value={values[f.key] ?? ""}
                              onChange={(e) => setValue(f.key, e.target.value)}
                            />
                          ) : (
                            <Input
                              id={`field-${f.key}`}
                              type={f.type === "number" || f.type === "currency" ? "text" : f.type === "date" ? "date" : "text"}
                              value={values[f.key] ?? ""}
                              onChange={(e) => setValue(f.key, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {fieldIssues.length > 0 && (
                    <p className="text-xs text-destructive">{fieldIssues[0]!.label}: {fieldIssues[0]!.message}</p>
                  )}
                </CardContent>
              </Card>
            </aside>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Apercu PDF mis a jour automatiquement {previewing ? "..." : ""}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={downloading} onClick={() => void download()}>
                    {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Telecharger PDF
                  </Button>
                  <Button
                    className="bg-navy text-white"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : hasSignature ? <ShieldCheck className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                    {hasSignature ? "Signer et enregistrer" : "Enregistrer dans le dossier"}
                  </Button>
                </div>
              </div>

              <div className="space-y-5 rounded-xl border border-border/60 bg-muted/20 p-3">
                {pages.length === 0 && (
                  <div className="grid h-80 place-items-center text-muted-foreground">
                    {previewing ? <Loader2 className="h-5 w-5 animate-spin" /> : "Apercu indisponible"}
                  </div>
                )}
                {pages.map((p, index) => (
                  <div key={index} className="relative mx-auto w-fit rounded-lg border border-border/60 bg-white shadow-[var(--shadow-card)]">
                    <canvas
                      ref={(el) => { canvasRefs.current[index] = el; }}
                      onClick={(e) => addPlacement(index, e.clientX, e.clientY)}
                      className={signatureData ? "cursor-copy" : "cursor-default"}
                      style={{ width: p.width, height: p.height, display: "block" }}
                    />
                    {placements.filter((pl) => pl.page === index + 1).map((pl) => (
                      <div
                        key={pl.id}
                        onPointerDown={(e) => startDrag(e, pl.id, "move")}
                        className="group absolute rounded border-2 border-dashed border-gold/80 bg-white/40"
                        style={{ left: pl.x, top: pl.y, width: pl.w, height: pl.h, touchAction: "none" }}
                      >
                        {signatureData && <img src={signatureData} alt="Signature" className="h-full w-full object-contain" draggable={false} />}
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlacements((list) => list.filter((x) => x.id !== pl.id));
                          }}
                          className="absolute -right-3 -top-3 rounded-full bg-destructive p-1 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="Retirer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <span
                          onPointerDown={(e) => startDrag(e, pl.id, "resize")}
                          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-sm bg-gold"
                          style={{ touchAction: "none" }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>

        <SignatureDialog
          open={signatureDialogOpen}
          onOpenChange={setSignatureDialogOpen}
          method={method}
          setMethod={setMethod}
          style={style}
          setStyle={setStyle}
          fullName={`${signFirstName} ${signLastName}`.trim()}
          onConfirm={(data) => {
            setSignatureData(data);
            setSignatureDialogOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SignatureDialog({
  open,
  onOpenChange,
  method,
  setMethod,
  style,
  setStyle,
  fullName,
  onConfirm,
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

  useEffect(() => {
    if (open && method === "drawn") setTimeout(clear, 30);
  }, [open, method]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
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
          <DialogDescription>Dessinez votre signature ou generez-la a partir de votre nom.</DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={(v) => setMethod(v as "drawn" | "generated")}>
          <TabsList className="w-full">
            <TabsTrigger value="drawn" className="flex-1">Dessiner</TabsTrigger>
            <TabsTrigger value="generated" className="flex-1">Generer</TabsTrigger>
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
          <Button onClick={confirm} className="bg-navy text-white">Utiliser cette signature</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
