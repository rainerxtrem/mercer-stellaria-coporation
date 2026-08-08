/**
 * Catalogue partagé (client + serveur) des champs d'un modèle documentaire.
 * Utilisé par l'écran de paramétrage, par le moteur d'analyse sémantique et
 * par la validation avant génération.
 */

export type TemplateFieldType = "text" | "textarea" | "number" | "date" | "currency";

/** Origine de la détection du champ. */
export type FieldDetection = "placeholder" | "blank" | "semantic" | "manual";

/** Format attendu (contrôlé avant génération). */
export type FieldFormat =
  | "none" | "date" | "email" | "phone" | "postal_code" | "iban" | "bic"
  | "siren" | "siret" | "tva" | "vin" | "plate" | "amount" | "number";

export type TemplateField = {
  /** Jeton présent dans le document, ou jeton synthétique "{{clé}}" pour un champ déduit. */
  token: string;
  /** Clé technique normalisée (ex. "client_nom"). */
  key: string;
  label: string;
  type: TemplateFieldType;
  /** Chemin de la source automatique, ou "manual" si saisie par l'avocat. */
  source: string;
  required: boolean;
  default_value?: string | null;
  /** Nombre d'occurrences détectées dans le document. */
  occurrences?: number;
  /** Nature sémantique reconnue (voir SEMANTIC_TYPES). */
  semantic?: string | null;
  /** Format à contrôler avant génération. */
  format?: FieldFormat | null;
  /** Comment le champ a été trouvé. */
  detection?: FieldDetection | null;
  /** Extrait du document permettant de localiser la zone à compléter. */
  anchor?: string | null;
  /** Phrase de contexte affichée à l'utilisateur. */
  context?: string | null;
  /** Groupe logique d'affichage du formulaire (ex. "Client", "Véhicule"). */
  group?: string | null;
};

export const FIELD_TYPES: { value: TemplateFieldType; label: string }[] = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Montant" },
];

export const FIELD_FORMATS: { value: FieldFormat; label: string }[] = [
  { value: "none", label: "Libre" },
  { value: "date", label: "Date (JJ/MM/AAAA)" },
  { value: "amount", label: "Montant" },
  { value: "number", label: "Nombre" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Téléphone" },
  { value: "postal_code", label: "Code postal" },
  { value: "iban", label: "IBAN" },
  { value: "bic", label: "BIC" },
  { value: "siren", label: "SIREN" },
  { value: "siret", label: "SIRET" },
  { value: "tva", label: "N° TVA" },
  { value: "vin", label: "N° VIN" },
  { value: "plate", label: "Immatriculation" },
];

/**
 * Types sémantiques reconnus par le moteur d'analyse. Chaque entrée porte le
 * type de saisie, le format à contrôler, la source de pré-remplissage la plus
 * probable et le groupe d'affichage.
 */
export type SemanticType = {
  value: string;
  label: string;
  group: string;
  type: TemplateFieldType;
  format: FieldFormat;
  source: string;
};

export const SEMANTIC_TYPES: SemanticType[] = [
  { value: "civilite", label: "Civilité", group: "Personne", type: "text", format: "none", source: "manual" },
  { value: "nom", label: "Nom", group: "Client", type: "text", format: "none", source: "client.last_name" },
  { value: "prenom", label: "Prénom", group: "Client", type: "text", format: "none", source: "client.first_name" },
  { value: "nom_complet", label: "Nom complet", group: "Client", type: "text", format: "none", source: "client.full_name" },
  { value: "date_naissance", label: "Date de naissance", group: "Client", type: "date", format: "date", source: "client.birth_date" },
  { value: "email", label: "E-mail", group: "Coordonnées", type: "text", format: "email", source: "client.email" },
  { value: "telephone", label: "Téléphone", group: "Coordonnées", type: "text", format: "phone", source: "client.phone" },
  { value: "adresse", label: "Adresse", group: "Coordonnées", type: "text", format: "none", source: "client.address" },
  { value: "code_postal", label: "Code postal", group: "Coordonnées", type: "text", format: "postal_code", source: "manual" },
  { value: "ville", label: "Ville", group: "Coordonnées", type: "text", format: "none", source: "manual" },
  { value: "lieu", label: "Lieu (fait à …)", group: "Document", type: "text", format: "none", source: "manual" },
  { value: "date", label: "Date", group: "Document", type: "date", format: "date", source: "system.today" },
  { value: "date_debut", label: "Date de début", group: "Document", type: "date", format: "date", source: "manual" },
  { value: "date_fin", label: "Date de fin", group: "Document", type: "date", format: "date", source: "manual" },
  { value: "duree", label: "Durée", group: "Document", type: "text", format: "none", source: "manual" },
  { value: "societe", label: "Société", group: "Entreprise", type: "text", format: "none", source: "manual" },
  { value: "forme_juridique", label: "Forme juridique", group: "Entreprise", type: "text", format: "none", source: "manual" },
  { value: "capital", label: "Capital social", group: "Entreprise", type: "currency", format: "amount", source: "manual" },
  { value: "siren", label: "SIREN", group: "Entreprise", type: "text", format: "siren", source: "manual" },
  { value: "siret", label: "SIRET", group: "Entreprise", type: "text", format: "siret", source: "manual" },
  { value: "rcs", label: "RCS", group: "Entreprise", type: "text", format: "none", source: "manual" },
  { value: "tva", label: "N° TVA intracommunautaire", group: "Entreprise", type: "text", format: "tva", source: "manual" },
  { value: "representant_legal", label: "Représentant légal", group: "Entreprise", type: "text", format: "none", source: "manual" },
  { value: "fonction", label: "Fonction / qualité", group: "Entreprise", type: "text", format: "none", source: "manual" },
  { value: "avocat", label: "Avocat", group: "Cabinet", type: "text", format: "none", source: "lawyer.full_name" },
  { value: "barreau", label: "Barreau / licence", group: "Cabinet", type: "text", format: "none", source: "lawyer.license" },
  { value: "cabinet", label: "Cabinet", group: "Cabinet", type: "text", format: "none", source: "firm.name" },
  { value: "tribunal", label: "Tribunal / juridiction", group: "Procédure", type: "text", format: "none", source: "manual" },
  { value: "numero_dossier", label: "Numéro de dossier", group: "Procédure", type: "text", format: "none", source: "matter.number" },
  { value: "numero_contrat", label: "Numéro de contrat", group: "Procédure", type: "text", format: "none", source: "manual" },
  { value: "reference", label: "Référence", group: "Procédure", type: "text", format: "none", source: "manual" },
  { value: "objet", label: "Objet / description", group: "Procédure", type: "textarea", format: "none", source: "matter.description" },
  { value: "montant", label: "Montant", group: "Financier", type: "currency", format: "amount", source: "manual" },
  { value: "devise", label: "Devise", group: "Financier", type: "text", format: "none", source: "manual" },
  { value: "iban", label: "IBAN", group: "Financier", type: "text", format: "iban", source: "manual" },
  { value: "bic", label: "BIC", group: "Financier", type: "text", format: "bic", source: "manual" },
  { value: "immatriculation", label: "Immatriculation", group: "Bien / véhicule", type: "text", format: "plate", source: "manual" },
  { value: "marque", label: "Marque", group: "Bien / véhicule", type: "text", format: "none", source: "manual" },
  { value: "modele", label: "Modèle", group: "Bien / véhicule", type: "text", format: "none", source: "manual" },
  { value: "vin", label: "Numéro VIN", group: "Bien / véhicule", type: "text", format: "vin", source: "manual" },
  { value: "numero_serie", label: "Numéro de série", group: "Bien / véhicule", type: "text", format: "none", source: "manual" },
  { value: "kilometrage", label: "Kilométrage", group: "Bien / véhicule", type: "number", format: "number", source: "manual" },
  { value: "signature", label: "Signature", group: "Signature", type: "text", format: "none", source: "manual" },
  { value: "autre", label: "Autre donnée", group: "Divers", type: "text", format: "none", source: "manual" },
];

export const SEMANTIC_BY_VALUE = new Map(SEMANTIC_TYPES.map((s) => [s.value, s]));
export const ALL_SEMANTIC_VALUES: string[] = SEMANTIC_TYPES.map((s) => s.value);

export function semanticLabel(value?: string | null): string {
  if (!value) return "Non qualifié";
  return SEMANTIC_BY_VALUE.get(value)?.label ?? value;
}

export type SourceGroup = { group: string; options: { value: string; label: string }[] };

/** Sources de pré-remplissage automatique disponibles. */
export const FIELD_SOURCES: SourceGroup[] = [
  {
    group: "Saisie",
    options: [{ value: "manual", label: "Saisie manuelle (formulaire)" }],
  },
  {
    group: "Client",
    options: [
      { value: "client.full_name", label: "Client — nom complet" },
      { value: "client.first_name", label: "Client — prénom" },
      { value: "client.last_name", label: "Client — nom" },
      { value: "client.email", label: "Client — email" },
      { value: "client.phone", label: "Client — téléphone" },
      { value: "client.address", label: "Client — adresse" },
      { value: "client.birth_date", label: "Client — date de naissance" },
    ],
  },
  {
    group: "Dossier",
    options: [
      { value: "matter.number", label: "Dossier — numéro" },
      { value: "matter.title", label: "Dossier — intitulé" },
      { value: "matter.type", label: "Dossier — type" },
      { value: "matter.status", label: "Dossier — statut" },
      { value: "matter.opened_on", label: "Dossier — date d'ouverture" },
      { value: "matter.description", label: "Dossier — description" },
    ],
  },
  {
    group: "Avocat",
    options: [
      { value: "lawyer.full_name", label: "Avocat — nom complet" },
      { value: "lawyer.license", label: "Avocat — numéro de licence" },
      { value: "lawyer.email", label: "Avocat — email" },
      { value: "lawyer.phone", label: "Avocat — téléphone" },
      { value: "lawyer.specialty", label: "Avocat — spécialité" },
      { value: "lawyer.city", label: "Avocat — ville" },
    ],
  },
  {
    group: "Cabinet",
    options: [
      { value: "firm.name", label: "Cabinet — nom" },
      { value: "firm.number", label: "Cabinet — numéro" },
      { value: "firm.address", label: "Cabinet — adresse" },
      { value: "firm.manager", label: "Cabinet — directeur" },
    ],
  },
  {
    group: "Facturation",
    options: [
      { value: "invoice.number", label: "Facture — numéro" },
      { value: "invoice.total", label: "Facture — total" },
      { value: "invoice.subtotal", label: "Facture — sous-total" },
      { value: "invoice.issue_date", label: "Facture — date d'émission" },
      { value: "invoice.due_date", label: "Facture — échéance" },
    ],
  },
  {
    group: "Système",
    options: [
      { value: "system.today", label: "Date du jour" },
      { value: "system.city_today", label: "Fait à … le (date du jour)" },
    ],
  },
];

export const ALL_SOURCE_VALUES: string[] = FIELD_SOURCES.flatMap((g) => g.options.map((o) => o.value));

export function sourceLabel(value: string): string {
  for (const g of FIELD_SOURCES) {
    const found = g.options.find((o) => o.value === value);
    if (found) return found.label;
  }
  return value;
}

export function detectionLabel(d?: FieldDetection | null): string {
  switch (d) {
    case "placeholder": return "Balise du document";
    case "blank": return "Zone vide détectée";
    case "semantic": return "Analyse sémantique";
    case "manual": return "Ajouté manuellement";
    default: return "Détecté";
  }
}

export function normalizeKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "champ";
}

/* ------------------------------------------------------------------ */
/* Validation avant génération                                         */
/* ------------------------------------------------------------------ */

const FORMAT_RULES: Partial<Record<FieldFormat, { test: (v: string) => boolean; message: string }>> = {
  email: { test: (v) => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(v), message: "Adresse e-mail invalide." },
  phone: { test: (v) => /^[+()\d][\d\s().-]{5,}$/.test(v), message: "Numéro de téléphone invalide." },
  postal_code: { test: (v) => /^\d{4,6}$/.test(v.replace(/\s/g, "")), message: "Code postal invalide." },
  iban: { test: (v) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v.replace(/\s/g, "").toUpperCase()), message: "IBAN invalide." },
  bic: { test: (v) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.replace(/\s/g, "").toUpperCase()), message: "BIC invalide." },
  siren: { test: (v) => /^\d{9}$/.test(v.replace(/\s/g, "")), message: "SIREN : 9 chiffres attendus." },
  siret: { test: (v) => /^\d{14}$/.test(v.replace(/\s/g, "")), message: "SIRET : 14 chiffres attendus." },
  tva: { test: (v) => /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(v.replace(/\s/g, "").toUpperCase()), message: "N° TVA invalide." },
  vin: { test: (v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v.replace(/\s/g, "").toUpperCase()), message: "VIN : 17 caractères attendus." },
  plate: { test: (v) => /^[A-Z0-9-\s]{4,12}$/.test(v.toUpperCase()), message: "Immatriculation invalide." },
  number: { test: (v) => /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, "")), message: "Nombre invalide." },
  amount: { test: (v) => /^-?\d+([.,]\d{1,2})?$/.test(v.replace(/[\s\u202f]|€|EUR|\$/gi, "")), message: "Montant invalide." },
  date: { test: (v) => parseFieldDate(v) !== null, message: "Date invalide (JJ/MM/AAAA)." },
};

/** Analyse une date saisie (JJ/MM/AAAA, AAAA-MM-JJ, JJ-MM-AAAA). */
export function parseFieldDate(raw: string): Date | null {
  const v = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) {
    const day = Number(m[1]); const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    const d = new Date(Number(m[3]), month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type FieldIssue = { key: string; label: string; message: string };

/**
 * Contrôle complet des valeurs saisies : champs obligatoires manquants,
 * formats invalides, cohérence des dates de début/fin.
 */
export function validateFieldValues(
  fields: TemplateField[],
  values: Record<string, string>,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const f of fields) {
    const raw = (values[f.key] ?? "").trim();
    if (!raw) {
      if (f.required) issues.push({ key: f.key, label: f.label, message: "Champ obligatoire non renseigné." });
      continue;
    }
    const format: FieldFormat = (f.format as FieldFormat) || (f.type === "date" ? "date" : f.type === "currency" ? "amount" : f.type === "number" ? "number" : "none");
    const rule = FORMAT_RULES[format];
    if (rule && !rule.test(raw)) issues.push({ key: f.key, label: f.label, message: rule.message });
  }

  const start = fields.find((f) => f.semantic === "date_debut");
  const end = fields.find((f) => f.semantic === "date_fin");
  if (start && end) {
    const a = parseFieldDate(values[start.key] ?? "");
    const b = parseFieldDate(values[end.key] ?? "");
    if (a && b && b.getTime() < a.getTime()) {
      issues.push({ key: end.key, label: end.label, message: "La date de fin précède la date de début." });
    }
  }
  return issues;
}
