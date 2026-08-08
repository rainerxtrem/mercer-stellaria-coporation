import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  FIELD_FORMATS, FIELD_SOURCES, FIELD_TYPES, SEMANTIC_BY_VALUE, SEMANTIC_TYPES,
  detectionLabel, normalizeKey, semanticLabel, sourceLabel,
  type FieldFormat, type TemplateField, type TemplateFieldType,
} from "@/lib/doc-template-fields";
import { analyzeTemplateVersion, getTemplateFields, saveTemplateFields } from "@/lib/doc-templates.functions";

type Props = {
  templateId: string | null;
  templateName?: string;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
};

const SEMANTIC_GROUPS = Array.from(new Set(SEMANTIC_TYPES.map((s) => s.group)));

export function TemplateFieldsDialog({ templateId, templateName, canManage, onOpenChange }: Props) {
  const getFieldsFn = useServerFn(getTemplateFields);
  const analyzeFn = useServerFn(analyzeTemplateVersion);
  const saveFn = useServerFn(saveTemplateFields);

  const [loading, setLoading] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionLabel, setVersionLabel] = useState<string>("");
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);
    setFields([]);
    setVersionId(null);
    getFieldsFn({ data: { template_id: templateId } })
      .then((r: any) => {
        setVersionId(r.version_id);
        setVersionLabel(`v${r.version} · ${r.file_name}`);
        setFields((r.fields ?? []) as TemplateField[]);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function analyze() {
    if (!templateId) return;
    setAnalyzing(true);
    try {
      const r: any = await analyzeFn({ data: { template_id: templateId } });
      setVersionId(r.version_id);
      setFields((r.fields ?? []) as TemplateField[]);
      if (r.note) toast.warning(r.note);
      else {
        const s = r.stats ?? {};
        toast.success(
          `${r.fields?.length ?? 0} champ(s) identifié(s)` +
          (r.ai ? ` — analyse sémantique (${s.placeholders ?? 0} balise(s), ${s.blanks ?? 0} zone(s) vide(s))` : ""),
        );
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  const save = useMutation({
    mutationFn: () => saveFn({ data: { version_id: versionId!, fields: fields.map((f) => ({
      token: f.token, key: f.key, label: f.label, type: f.type,
      source: f.source, required: f.required,
      default_value: f.default_value ?? null,
      occurrences: f.occurrences ?? 0,
      semantic: f.semantic ?? null,
      format: f.format ?? null,
      detection: f.detection ?? null,
      anchor: f.anchor ?? null,
      context: f.context ?? null,
      group: f.group ?? null,
    })) } }),
    onSuccess: () => { toast.success("Paramétrage enregistré"); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  function update(i: number, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  /** Changer la nature sémantique réaligne type, format et source proposés. */
  function applySemantic(i: number, semantic: string) {
    const meta = SEMANTIC_BY_VALUE.get(semantic);
    update(i, meta
      ? { semantic, type: meta.type, format: meta.format, source: meta.source, group: meta.group }
      : { semantic });
  }

  function addManual() {
    const n = fields.length + 1;
    setFields((prev) => [...prev, {
      token: `{{champ_${n}}}`, key: `champ_${n}`, label: `Champ ${n}`,
      type: "text" as TemplateFieldType, source: "manual", required: true, default_value: null,
      semantic: "autre", format: "none", detection: "manual", group: "Divers",
    }]);
  }

  const autoCount = fields.filter((f) => f.source !== "manual").length;
  const blankCount = fields.filter((f) => f.detection === "blank").length;
  const semanticCount = fields.filter((f) => f.detection === "semantic").length;

  const grouped = useMemo(() => {
    const map = new Map<string, number[]>();
    fields.forEach((f, i) => {
      const g = f.group || SEMANTIC_BY_VALUE.get(f.semantic ?? "")?.group || "Divers";
      map.set(g, [...(map.get(g) ?? []), i]);
    });
    return Array.from(map.entries());
  }, [fields]);

  return (
    <Dialog open={!!templateId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Champs & variables — {templateName}</DialogTitle>
          <DialogDescription>
            L'analyse lit l'intégralité du document et comprend le contexte : elle identifie les données à
            renseigner même sans balise (lignes à compléter, pointillés, cellules de tableau vides, formulations
            libres), qualifie chaque donnée et fusionne les répétitions en une seule saisie.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-3 text-sm">
          <Badge variant="outline">{versionLabel || "—"}</Badge>
          <Badge variant="secondary">{fields.length} champ(s)</Badge>
          <Badge variant="outline">{autoCount} pré-rempli(s)</Badge>
          {!!blankCount && <Badge variant="outline">{blankCount} zone(s) vide(s)</Badge>}
          {!!semanticCount && <Badge variant="outline">{semanticCount} déduit(s) du contexte</Badge>}
          <div className="ml-auto flex gap-2">
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={addManual}>
                  <Plus className="mr-2 h-4 w-4" /> Champ manuel
                </Button>
                <Button size="sm" className="bg-navy text-white" disabled={analyzing || !versionId} onClick={analyze}>
                  {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Analyse intelligente
                </Button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <Wand2 className="mx-auto mb-3 h-6 w-6 text-gold" />
            Aucun champ paramétré. Lancez l'analyse intelligente ou ajoutez un champ manuel.
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([group, idxs]) => (
              <div key={group} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                {idxs.map((i) => {
                  const f = fields[i]!;
                  return (
                    <div key={`${f.key}-${i}`} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{semanticLabel(f.semantic)}</Badge>
                        <Badge variant="outline" className="text-xs">{detectionLabel(f.detection)}</Badge>
                        {!!f.occurrences && f.occurrences > 1 && (
                          <Badge variant="outline" className="text-xs">{f.occurrences}× fusionnées</Badge>
                        )}
                        <Badge variant={f.source === "manual" ? "outline" : "secondary"} className="text-xs">
                          {f.source === "manual" ? "Saisie manuelle" : sourceLabel(f.source)}
                        </Badge>
                        {canManage && (
                          <Button size="sm" variant="ghost" className="ml-auto text-destructive"
                            onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {(f.anchor || f.context) && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {f.context || f.anchor}
                        </p>
                      )}

                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div>
                          <Label className="text-xs">Libellé</Label>
                          <Input value={f.label} disabled={!canManage} onChange={(e) => update(i, { label: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Clé</Label>
                          <Input value={f.key} disabled={!canManage} onChange={(e) => update(i, { key: normalizeKey(e.target.value) })} />
                        </div>
                        <div>
                          <Label className="text-xs">Nature de la donnée</Label>
                          <Select value={f.semantic ?? "autre"} disabled={!canManage} onValueChange={(v) => applySemantic(i, v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SEMANTIC_GROUPS.map((g) => (
                                <SelectGroup key={g}>
                                  <SelectLabel>{g}</SelectLabel>
                                  {SEMANTIC_TYPES.filter((s) => s.group === g).map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Source de la donnée</Label>
                          <Select value={f.source} disabled={!canManage} onValueChange={(v) => update(i, { source: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_SOURCES.map((g) => (
                                <SelectGroup key={g.group}>
                                  <SelectLabel>{g.group}</SelectLabel>
                                  {g.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Type de saisie</Label>
                          <Select value={f.type} disabled={!canManage} onValueChange={(v) => update(i, { type: v as TemplateFieldType })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Format contrôlé</Label>
                          <Select value={(f.format as string) ?? "none"} disabled={!canManage}
                            onValueChange={(v) => update(i, { format: v as FieldFormat })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FIELD_FORMATS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {f.source === "manual" && (
                          <div className="md:col-span-2">
                            <Label className="text-xs">Valeur par défaut</Label>
                            <Input value={f.default_value ?? ""} disabled={!canManage}
                              onChange={(e) => update(i, { default_value: e.target.value || null })} />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Switch checked={f.required} disabled={!canManage} onCheckedChange={(v) => update(i, { required: v })} />
                          Obligatoire
                        </label>
                        <code className="rounded bg-muted px-2 py-1 text-xs">{f.token}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          {canManage && (
            <Button className="bg-navy text-white" disabled={!versionId || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enregistrer le paramétrage
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
