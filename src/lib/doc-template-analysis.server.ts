/**
 * Moteur d'analyse documentaire.
 *
 * Trois couches complémentaires, indépendantes de toute convention de nommage :
 *  1. extraction du contenu (DOCX / PDF éditable) avec structure des tableaux ;
 *  2. détection structurelle : balises, pointillés, lignes à compléter,
 *     cellules de tableau vides, zones réservées ;
 *  3. analyse sémantique par IA de l'intégralité du texte : compréhension du
 *     contexte, qualification des données attendues, fusion des doublons.
 *
 * Fichier strictement serveur.
 */
import { unzipSync, unzlibSync, inflateSync } from "fflate";
import {
  ALL_SEMANTIC_VALUES,
  ALL_SOURCE_VALUES,
  FIELD_SOURCES,
  SEMANTIC_BY_VALUE,
  SEMANTIC_TYPES,
  normalizeKey,
  type FieldFormat,
  type TemplateField,
  type TemplateFieldType,
} from "./doc-template-fields";

const decoder = new TextDecoder("utf-8");
const TYPES = ["text", "textarea", "number", "date", "currency"];

/* ------------------------------------------------------------------ */
/* 0. Assainissement Unicode (racine du bug « unsupported Unicode      */
/*    escape sequence » : PostgreSQL refuse \u0000 et les surrogates    */
/*    isolés dans les chaînes JSON envoyées par l'API).                 */
/* ------------------------------------------------------------------ */

/**
 * Rend une chaîne sûre pour JSON/PostgreSQL sans perdre les accents,
 * apostrophes, guillemets, emojis ni symboles :
 *  - supprime les octets nuls et les caractères de contrôle non imprimables ;
 *  - supprime les surrogates UTF-16 isolés (issus d'un découpage binaire) ;
 *  - normalise les caractères de remplacement en série.
 */
export function sanitizeUnicode(input: unknown): string {
  if (typeof input !== "string") return "";
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    // Surrogate haut : ne conserver que s'il est suivi d'un surrogate bas.
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i]! + input[i + 1]!;
        i += 1;
      }
      continue; // surrogate isolé -> ignoré proprement
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // surrogate bas orphelin
    if (code === 0) continue; // \u0000 : refusé par PostgreSQL
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) continue; // contrôles
    if (code === 0x7f) continue;
    if (code === 0xfffe || code === 0xffff) continue; // non-caractères
    out += input[i];
  }
  return out.replace(/\ufffd{2,}/g, "\ufffd");
}

/** Assainit récursivement toute valeur destinée à la base ou à l'IA. */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeUnicode(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[sanitizeUnicode(k) || k] = sanitizeDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}


/* ------------------------------------------------------------------ */
/* 1. Extraction                                                       */
/* ------------------------------------------------------------------ */

export type ExtractedDoc = {
  text: string;
  /** Zones vides repérées structurellement (cellules, lignes à compléter). */
  blanks: { label: string; anchor: string; context: string }[];
};

function xmlText(fragment: string): string {
  return fragment
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Texte + tableaux d'un DOCX, avec repérage des cellules vides. */
function extractDocx(bytes: Uint8Array): ExtractedDoc {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xmlBytes = files["word/document.xml"];
  if (!xmlBytes) return { text: "", blanks: [] };
  const xml = decoder.decode(xmlBytes);

  const blanks: ExtractedDoc["blanks"] = [];

  // Tableaux : lignes -> cellules ; une cellule vide à côté d'un libellé = champ.
  const tableRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let tbl: RegExpExecArray | null;
  while ((tbl = tableRe.exec(xml)) !== null) {
    const rows = tbl[0].match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? [];
    const grid = rows.map((r) => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) => xmlText(c)));
    const header = grid[0] ?? [];
    grid.forEach((cells, ri) => {
      cells.forEach((cell, ci) => {
        if (cell.replace(/[\s._·…-]/g, "")) return;
        const rowLabel = cells.slice(0, ci).reverse().find((c) => c.trim().length > 1);
        const colLabel = ri > 0 ? (header[ci] ?? "").trim() : "";
        const label = (rowLabel || colLabel || "").trim();
        if (!label || label.length > 90) return;
        blanks.push({
          label,
          anchor: `⟦tableau:${ri}:${ci}⟧`,
          context: `Tableau — cellule vide en regard de « ${label} »`,
        });
      });
    });
  }

  const text = xmlText(xml).replace(/\n{3,}/g, "\n\n").trim();
  return { text, blanks };
}

function decodePdfString(raw: string): string {
  return raw
    .replace(/\\(\d{1,3})/g, (_m, o: string) => String.fromCharCode(parseInt(o, 8)))
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

/** Texte approximatif d'un PDF : décompression des flux puis lecture des opérateurs Tj/TJ. */
function extractPdfText(bytes: Uint8Array): string {
  const latin = new TextDecoder("latin1").decode(bytes);
  const out: string[] = [];
  const streamRe = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    const slice = bytes.subarray(start, end);
    let text = "";
    for (const fn of [unzlibSync, inflateSync] as const) {
      try {
        text = new TextDecoder("latin1").decode(fn(slice));
        break;
      } catch {
        /* flux non compressé ou filtre non supporté */
      }
    }
    if (!text) text = latin.slice(start, end);
    if (!/(Tj|TJ)/.test(text)) continue;
    const tokenRe = /\((?:\\.|[^\\()])*\)|\bTJ\b|\bTj\b|\bT\*\b|\bTd\b|\bTD\b/g;
    let t: RegExpExecArray | null;
    let line = "";
    while ((t = tokenRe.exec(text)) !== null) {
      const tok = t[0];
      if (tok.startsWith("(")) line += decodePdfString(tok.slice(1, -1));
      else if (tok === "T*" || tok === "Td" || tok === "TD") {
        if (line.trim()) out.push(line.trim());
        line = "";
      }
    }
    if (line.trim()) out.push(line.trim());
    streamRe.lastIndex = end;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractDocument(bytes: Uint8Array, mime: string, filename: string): ExtractedDoc {
  const isPdf = mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
  let doc: ExtractedDoc = { text: "", blanks: [] };
  try {
    doc = isPdf ? { text: extractPdfText(bytes), blanks: [] } : extractDocx(bytes);
  } catch {
    doc = { text: "", blanks: [] };
  }
  // Toute donnée issue d'un binaire est assainie : jamais de \u0000 ni de
  // surrogate isolé dans le texte, ce qui faisait échouer l'écriture en base.
  return sanitizeDeep({
    text: sanitizeUnicode(doc.text),
    blanks: (doc.blanks ?? []).filter((b) => sanitizeUnicode(b.label).trim().length > 0),
  });
}


/** Compatibilité : texte brut seul. */
export function extractText(bytes: Uint8Array, mime: string, filename: string): string {
  return extractDocument(bytes, mime, filename).text;
}

/* ------------------------------------------------------------------ */
/* 2. Détection structurelle                                           */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{\{\s*([^{}]{1,80}?)\s*\}\}/g,
  /\{\s*([^{}]{1,80}?)\s*\}/g,
  /\[\[\s*([^\[\]]{1,80}?)\s*\]\]/g,
  /\[\s*([^\[\]]{1,80}?)\s*\]/g,
  /<<\s*([^<>]{1,80}?)\s*>>/g,
  /«\s*([^«»]{1,80}?)\s*»/g,
  /%\s*([A-Za-z0-9_ .-]{1,60}?)\s*%/g,
];

export function detectPlaceholders(text: string): { token: string; inner: string; occurrences: number }[] {
  const found = new Map<string, { token: string; inner: string; occurrences: number }>();
  for (const re of PLACEHOLDER_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[0];
      const inner = (m[1] ?? "").trim();
      if (!inner || inner.length < 2) continue;
      if (/^\d+$/.test(inner)) continue;
      const existing = found.get(token);
      if (existing) existing.occurrences += 1;
      else found.set(token, { token, inner, occurrences: 1 });
    }
  }
  const tokens = Array.from(found.values());
  return tokens
    .filter((t) => !tokens.some((o) => o.token !== t.token && o.token.includes(t.token)))
    .slice(0, 120);
}

const BLANK_RUN = /(_{3,}|\.{4,}|…{2,}|·{3,}|-{6,}|\u00a0{4,})/;

/** Lignes à compléter, pointillés, espaces réservés, champs soulignés. */
export function detectBlankZones(text: string): { label: string; anchor: string; context: string }[] {
  const out: { label: string; anchor: string; context: string }[] = [];
  const lines = text.split(/\n+/);
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\u00a0/g, " ").trimEnd();
    if (!line.trim()) return;

    // « Libellé : ______ » ou « Libellé ……… » (éventuellement plusieurs par ligne)
    const segRe = /([A-Za-zÀ-ÿ'’()°.\- ]{2,60}?)\s*(?::|,)?\s*(_{3,}|\.{4,}|…{2,}|·{3,}|-{6,})/g;
    let m: RegExpExecArray | null;
    let matched = false;
    while ((m = segRe.exec(line)) !== null) {
      const label = (m[1] ?? "").replace(/\s+/g, " ").trim();
      if (!label || label.length < 2) continue;
      matched = true;
      out.push({ label, anchor: m[0], context: line.slice(0, 200) });
    }
    if (matched) return;

    // « Libellé : » en fin de ligne, rien après
    const colon = /^([A-Za-zÀ-ÿ'’()°.\- ]{2,60})\s*:\s*$/.exec(line);
    if (colon) {
      out.push({ label: colon[1]!.trim(), anchor: colon[0], context: line.slice(0, 200) });
      return;
    }

    // Ligne composée uniquement de pointillés / soulignés : libellé = ligne précédente
    if (BLANK_RUN.test(line) && !line.replace(BLANK_RUN, "").replace(/[\s:.,]/g, "")) {
      const prev = (lines[idx - 1] ?? "").trim();
      out.push({
        label: prev.slice(0, 60) || "Zone à compléter",
        anchor: line.trim(),
        context: [prev, line].filter(Boolean).join(" / ").slice(0, 200),
      });
    }
  });

  // Déduplication par libellé + ancre
  const seen = new Set<string>();
  return out
    .filter((b) => {
      const k = `${b.label.toLowerCase()}|${b.anchor}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 120);
}

/* ------------------------------------------------------------------ */
/* Heuristique sémantique (secours sans IA)                            */
/* ------------------------------------------------------------------ */

const SEMANTIC_HINTS: [RegExp, string][] = [
  [/civilit|monsieur.*madame|\bm\.?\/mme\b/, "civilite"],
  [/pr[ée]nom/, "prenom"],
  [/nom\s*(et\s*pr[ée]nom|complet)|d[ée]nomination/, "nom_complet"],
  [/date\s*de\s*naissance|n[ée]\(?e?\)?\s*le/, "date_naissance"],
  [/\bnom\b|patronyme/, "nom"],
  [/mail|courriel/, "email"],
  [/t[ée]l|portable|mobile|fax/, "telephone"],
  [/code\s*postal|\bcp\b/, "code_postal"],
  [/\bville\b|commune/, "ville"],
  [/adresse|domicil|si[èe]ge/, "adresse"],
  [/fait\s*[àa]|lieu/, "lieu"],
  [/date\s*de\s*d[ée]but|[àa]\s*compter\s*du|entr[ée]e\s*en\s*vigueur/, "date_debut"],
  [/date\s*de\s*fin|jusqu|[ée]ch[ée]ance|expiration/, "date_fin"],
  [/dur[ée]e/, "duree"],
  [/\bdate\b|le\s*\.{3,}/, "date"],
  [/forme\s*juridique|sarl|sas\b|soci[ée]t[ée]\s*anonyme/, "forme_juridique"],
  [/capital/, "capital"],
  [/siren/, "siren"],
  [/siret/, "siret"],
  [/\brcs\b|registre\s*du\s*commerce/, "rcs"],
  [/tva|intracommunautaire/, "tva"],
  [/repr[ée]sent[ée]|g[ée]rant|pr[ée]sident|mandataire/, "representant_legal"],
  [/fonction|qualit[ée]|\btitre\b/, "fonction"],
  [/soci[ée]t[ée]|entreprise|employeur|raison\s*sociale/, "societe"],
  [/avocat|ma[îi]tre|\bme\b/, "avocat"],
  [/barreau|licence|toque/, "barreau"],
  [/cabinet/, "cabinet"],
  [/tribunal|juridiction|cour\s|greffe/, "tribunal"],
  [/(dossier|affaire).*(num|n°|ref)|num.*dossier/, "numero_dossier"],
  [/contrat.*(num|n°)|num.*contrat/, "numero_contrat"],
  [/r[ée]f[ée]rence|\bref\b/, "reference"],
  [/objet|motif|description|observations|clause/, "objet"],
  [/montant|honoraire|prix|somme|total|tarif|loyer|indemnit/, "montant"],
  [/devise|euro|currency/, "devise"],
  [/iban|compte\s*bancaire/, "iban"],
  [/\bbic\b|swift/, "bic"],
  [/immatriculation|plaque/, "immatriculation"],
  [/marque/, "marque"],
  [/mod[èe]le/, "modele"],
  [/\bvin\b|ch[âa]ssis/, "vin"],
  [/num[ée]ro\s*de\s*s[ée]rie/, "numero_serie"],
  [/kilom[ée]trage|\bkm\b/, "kilometrage"],
  [/signature|signataire|paraphe/, "signature"],
];

function heuristicSemantic(label: string): string {
  const l = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [re, sem] of SEMANTIC_HINTS) if (re.test(l)) return sem;
  return "autre";
}

function fieldFromSemantic(
  label: string,
  semantic: string,
  detection: TemplateField["detection"],
  extra: Partial<TemplateField> = {},
): TemplateField {
  const meta = SEMANTIC_BY_VALUE.get(semantic) ?? SEMANTIC_BY_VALUE.get("autre")!;
  const cleanLabel = label.replace(/[_.:·…]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || meta.label;
  const key = normalizeKey(cleanLabel === meta.label ? semantic : `${semantic}_${cleanLabel}`.slice(0, 55));
  return {
    token: `{{${key}}}`,
    key,
    label: cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1),
    type: meta.type,
    source: meta.source,
    required: true,
    default_value: null,
    occurrences: 1,
    semantic,
    format: meta.format,
    detection,
    anchor: null,
    context: null,
    group: meta.group,
    ...extra,
  };
}

/** Champs déduits sans IA (secours) : balises + zones vides + libellés. */
export function heuristicFields(
  detected: ReturnType<typeof detectPlaceholders>,
  blanks: { label: string; anchor: string; context: string }[],
): TemplateField[] {
  const fields: TemplateField[] = detected.map((d) => {
    const sem = heuristicSemantic(d.inner);
    return fieldFromSemantic(d.inner, sem, "placeholder", {
      token: d.token,
      key: normalizeKey(d.inner),
      occurrences: d.occurrences,
      anchor: d.token,
    });
  });
  for (const b of blanks) {
    fields.push(fieldFromSemantic(b.label, heuristicSemantic(b.label), "blank", {
      anchor: b.anchor,
      context: b.context,
    }));
  }
  return dedupeFields(fields);
}

/* ------------------------------------------------------------------ */
/* Fusion des doublons                                                 */
/* ------------------------------------------------------------------ */

function similarityKey(f: TemplateField): string {
  const label = normalizeKey(f.label);
  // Un même sémantique + libellé proche = même donnée
  return `${f.semantic ?? "autre"}|${label}`;
}

export function dedupeFields(fields: TemplateField[]): TemplateField[] {
  const byKey = new Map<string, TemplateField & { anchors: string[] }>();
  for (const f of fields) {
    const sem = f.semantic ?? "autre";
    // Les sémantiques uniques par nature fusionnent même si les libellés diffèrent.
    const unique = ["date", "lieu", "siren", "siret", "rcs", "tva", "iban", "bic", "vin", "code_postal", "ville", "cabinet", "avocat", "barreau", "tribunal", "numero_dossier", "numero_contrat", "duree", "devise", "signature"];
    const k = unique.includes(sem) ? sem : similarityKey(f);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...f, anchors: [f.anchor ?? f.token] });
      continue;
    }
    prev.occurrences = (prev.occurrences ?? 1) + (f.occurrences ?? 1);
    if (!prev.anchors.includes(f.anchor ?? f.token)) prev.anchors.push(f.anchor ?? f.token);
    if (prev.detection !== "placeholder" && f.detection === "placeholder") {
      prev.token = f.token;
      prev.detection = "placeholder";
    }
    if (prev.source === "manual" && f.source !== "manual") prev.source = f.source;
    if (!prev.context && f.context) prev.context = f.context;
  }
  // Clés techniques uniques
  const used = new Set<string>();
  return Array.from(byKey.values()).map((f) => {
    const { anchors, ...rest } = f;
    let key = rest.key;
    let n = 2;
    while (used.has(key)) key = `${rest.key}_${n++}`.slice(0, 60);
    used.add(key);
    return { ...rest, key, anchor: anchors.join(" ⟂ ").slice(0, 500) };
  }).slice(0, 150);
}

/* ------------------------------------------------------------------ */
/* 3. Analyse sémantique par IA                                        */
/* ------------------------------------------------------------------ */

const AI_SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          semantic: { type: "string" },
          type: { type: "string" },
          format: { type: "string" },
          source: { type: "string" },
          required: { type: "boolean" },
          anchor: { type: "string" },
          context: { type: "string" },
          occurrences: { type: "number" },
        },
        required: ["label", "semantic", "type", "format", "source", "required", "anchor", "context", "occurrences"],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
} as const;

function chunkText(text: string, size = 14000): string[] {
  if (text.length <= size) return [sanitizeUnicode(text)];
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < 4; i += size) {
    // Le découpage peut couper une paire de substituts : on assainit chaque tronçon.
    chunks.push(sanitizeUnicode(text.slice(i, i + size)));
  }
  return chunks;
}

async function askAi(apiKey: string, prompt: string): Promise<any[] | null> {
  const baseUrl = (process.env.AI_API_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es un moteur d'analyse documentaire juridique. Tu lis un document comme un juriste : " +
            "tu identifies TOUTES les informations qui devront être renseignées pour l'utiliser, " +
            "qu'il existe ou non des balises. Tu réponds uniquement en JSON valide.",
        },
        { role: "user", content: sanitizeUnicode(prompt) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "template_fields", schema: AI_SCHEMA } },
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`ai_${res.status}`), { status: res.status });
  const json: any = await res.json();
  const content = sanitizeUnicode(String(json?.choices?.[0]?.message?.content ?? ""));
  let parsed: any = null;
  try {
    parsed = JSON.parse(content.replace(/^```json\s*|```$/g, "").trim());
  } catch {
    return null; // réponse illisible : ignorée proprement
  }
  return Array.isArray(parsed?.fields) ? parsed.fields : null;
}


function normalizeAiField(p: any): TemplateField | null {
  const label = typeof p?.label === "string" ? p.label.trim() : "";
  if (!label) return null;
  const semantic = ALL_SEMANTIC_VALUES.includes(p?.semantic) ? String(p.semantic) : heuristicSemantic(label);
  const meta = SEMANTIC_BY_VALUE.get(semantic)!;
  const f = fieldFromSemantic(label, semantic, "semantic", {
    anchor: typeof p?.anchor === "string" && p.anchor.trim() ? p.anchor.trim().slice(0, 200) : null,
    context: typeof p?.context === "string" ? p.context.trim().slice(0, 240) : null,
    occurrences: Number.isFinite(p?.occurrences) ? Math.max(1, Math.min(50, Math.round(p.occurrences))) : 1,
  });
  if (TYPES.includes(p?.type)) f.type = p.type as TemplateFieldType;
  if (typeof p?.format === "string" && p.format) f.format = p.format as FieldFormat;
  if (ALL_SOURCE_VALUES.includes(p?.source)) f.source = String(p.source);
  else f.source = meta.source;
  if (typeof p?.required === "boolean") f.required = p.required;
  // Une balise explicite dans l'ancre devient le jeton du champ.
  if (f.anchor && /^(\{\{.+\}\}|\[.+\]|«.+»|<<.+>>|%.+%|\{.+\})$/.test(f.anchor)) {
    f.token = f.anchor;
    f.detection = "placeholder";
  }
  return f;
}

/**
 * Analyse complète : structure + sémantique IA, doublons fusionnés.
 * Retourne toujours un résultat exploitable (secours heuristique si IA absente).
 */
export async function analyzeDocument(doc: ExtractedDoc): Promise<{ fields: TemplateField[]; ai: boolean; note?: string; stats: { placeholders: number; blanks: number; semantic: number } }> {
  const detected = detectPlaceholders(doc.text);
  const blanks = [...detectBlankZones(doc.text), ...doc.blanks];
  const fallback = heuristicFields(detected, blanks);
  const stats = { placeholders: detected.length, blanks: blanks.length, semantic: 0 };

  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey || !doc.text.trim()) {
    return { fields: fallback, ai: false, note: apiKey ? undefined : "IA indisponible : proposition structurelle utilisée.", stats };
  }

  const catalogSources = FIELD_SOURCES.flatMap((g) => g.options.map((o) => `${o.value} = ${o.label}`)).join("\n");
  const catalogSemantics = SEMANTIC_TYPES.map((s) => `${s.value} = ${s.label}`).join("\n");
  const chunks = chunkText(doc.text);

  const aiFields: TemplateField[] = [];
  let note: string | undefined;
  try {
    for (const [i, chunk] of chunks.entries()) {
      const prompt = [
        `Partie ${i + 1}/${chunks.length} d'un modèle de document.`,
        "Identifie TOUTES les données variables à renseigner avant utilisation du document :",
        "— informations sur les personnes, sociétés, coordonnées, dates, lieux, montants, références, biens ;",
        "— zones à compléter sans texte indicatif (pointillés, lignes soulignées, cellules vides, « : » suivi de rien) ;",
        "— balises éventuelles ({{x}}, [X], «X», <<X>>, %X%).",
        "Comprends le CONTEXTE : même sans mot-clé habituel, déduis la donnée attendue à partir de la phrase.",
        "Ne crée pas de champ pour du texte figé, des titres, des clauses complètes ou des données déjà renseignées.",
        "Fusionne les répétitions d'une même donnée en un seul champ (indique le nombre d'occurrences).",
        "Pour chaque champ : label lisible en français, semantic, type, format, source, required, anchor (extrait EXACT du document, ≤ 80 caractères, permettant de localiser la zone) et context (phrase du document).",
        "",
        "Valeurs semantic autorisées :",
        catalogSemantics,
        "",
        'Types : "text", "textarea", "number", "date", "currency".',
        'Formats : "none","date","email","phone","postal_code","iban","bic","siren","siret","tva","vin","plate","amount","number".',
        "",
        'Sources de pré-remplissage autorisées (sinon "manual") :',
        catalogSources,
        "",
        i === 0 && (detected.length || blanks.length)
          ? [
              "Indices structurels déjà repérés (à confirmer/compléter) :",
              ...detected.map((d) => `balise ${d.token} (${d.occurrences}×)`),
              ...blanks.slice(0, 60).map((b) => `zone vide « ${b.label} » → ${b.anchor}`),
              "",
            ].join("\n")
          : "",
        "Texte du document :",
        chunk,
      ].filter(Boolean).join("\n");

      // Un tronçon en échec n'interrompt pas l'analyse des autres.
      let proposals: any[] | null = null;
      try {
        proposals = await askAi(apiKey, prompt);
      } catch (e) {
        const status = (e as any)?.status;
        if (status === 429) { note = "Limite IA atteinte : analyse structurelle utilisée."; break; }
        if (status === 402) { note = "Crédits IA épuisés : analyse structurelle utilisée."; break; }
        note = "Analyse IA partiellement indisponible.";
        continue;
      }
      for (const p of proposals ?? []) {
        try {
          const f = normalizeAiField(p);
          if (f) aiFields.push(f);
        } catch {
          /* proposition illisible : ignorée */
        }
      }
    }
  } catch {
    note = note ?? "Analyse IA partiellement indisponible.";
  }

  stats.semantic = aiFields.length;
  if (aiFields.length === 0) {
    return { fields: sanitizeDeep(fallback), ai: false, note: note ?? "Aucun champ proposé par l'IA.", stats };
  }

  // Les champs IA priment (ils portent le contexte), complétés par les balises non vues.
  const merged = dedupeFields([...aiFields, ...fallback]);
  return { fields: sanitizeDeep(merged), ai: true, note, stats };
}


/** Compatibilité ascendante avec l'ancienne signature. */
export async function proposeFields(
  text: string,
  detected: ReturnType<typeof detectPlaceholders>,
): Promise<{ fields: TemplateField[]; ai: boolean; note?: string }> {
  void detected;
  const r = await analyzeDocument({ text, blanks: [] });
  return { fields: r.fields, ai: r.ai, note: r.note };
}
