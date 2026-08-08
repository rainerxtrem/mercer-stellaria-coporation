import { describe, expect, it } from "vitest";
import { zipSync, strToU8, deflateSync } from "fflate";
import {
  extractDocument,
  sanitizeDeep,
  sanitizeUnicode,
  detectBlankZones,
  detectPlaceholders,
  heuristicFields,
} from "../../src/lib/doc-template-analysis.server";

/** Détecte tout caractère refusé par PostgreSQL dans une chaîne JSON. */
function hasUnsafeUnicode(value: unknown): boolean {
  const json = JSON.stringify(value) ?? "";
  const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  return json.includes("\u0000") || /\\u0000/i.test(json) || loneSurrogate.test(json);
}


function makeDocx(body: string): Uint8Array {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(xml),
  });
}

const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

describe("sanitizeUnicode", () => {
  it("conserve accents, apostrophes, guillemets, emojis et symboles", () => {
    const s = "Maître d’œuvre « Élodie » — 100 € ✅ 😀 №42 ½";
    expect(sanitizeUnicode(s)).toBe(s);
  });

  it("supprime les octets nuls et les caractères de contrôle", () => {
    expect(sanitizeUnicode("a\u0000b\u0001c")).toBe("abc");
    expect(sanitizeUnicode("ligne1\nligne2\ttab\r")).toBe("ligne1\nligne2\ttab\r");
  });

  it("supprime les substituts UTF-16 isolés mais garde les paires valides", () => {
    expect(sanitizeUnicode("x\ud83dy")).toBe("xy");
    expect(sanitizeUnicode("\udc00z")).toBe("z");
    expect(sanitizeUnicode("ok 😀")).toBe("ok 😀");
  });

  it("est tolérant aux valeurs non textuelles", () => {
    expect(sanitizeUnicode(undefined)).toBe("");
    expect(sanitizeUnicode(42)).toBe("");
  });
});

describe("sanitizeDeep", () => {
  it("assainit récursivement objets et tableaux sans casser les types", () => {
    const out = sanitizeDeep({
      label: "Nom\u0000 du client",
      nested: [{ context: "cellule\ud800 vide", n: 3, ok: true, nil: null }],
    });
    expect(out.label).toBe("Nom du client");
    expect(out.nested[0]!.context).toBe("cellule vide");
    expect(out.nested[0]!.n).toBe(3);
    expect(out.nested[0]!.ok).toBe(true);
    expect(out.nested[0]!.nil).toBe(null);
    expect(hasUnsafeUnicode(out)).toBe(false);
  });
});

describe("extractDocument — DOCX", () => {
  it("lit un document accentué avec balises et zones à compléter", () => {
    const bytes = makeDocx(
      [
        p("CONVENTION D’HONORAIRES — Maître {{nom_avocat}} 😀"),
        p("Nom du client : ......................"),
        p("Adresse « domicile » : ____________"),
        p("Montant : 1 500 € TTC"),
      ].join(""),
    );
    const doc = extractDocument(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "modele.docx");
    expect(doc.text).toContain("Maître");
    expect(doc.text).toContain("’");
    expect(hasUnsafeUnicode(doc)).toBe(false);

    const fields = heuristicFields(detectPlaceholders(doc.text), detectBlankZones(doc.text));
    expect(fields.length).toBeGreaterThan(0);
    expect(hasUnsafeUnicode(fields)).toBe(false);
  });

  it("survit à un XML contenant des octets nuls et des caractères exotiques", () => {
    const bytes = makeDocx(p("Client\u0000 : ....... ☠ \u0001 ﷽ 𝕏"));
    const doc = extractDocument(bytes, "", "modele.docx");
    expect(doc.text).not.toContain("\u0000");
    expect(hasUnsafeUnicode(doc)).toBe(false);
  });

  it("renvoie un résultat vide plutôt qu'une erreur sur un fichier illisible", () => {
    const doc = extractDocument(new Uint8Array([1, 2, 3, 4, 5]), "", "casse.docx");
    expect(doc).toEqual({ text: "", blanks: [] });
  });
});

describe("extractDocument — PDF", () => {
  function makePdf(lines: string[], compress: boolean): Uint8Array {
    const content = lines
      .map((l) => `BT /F1 12 Tf 40 700 Td (${l.replace(/([()\\])/g, "\\$1")}) Tj T* ET`)
      .join("\n");
    const raw = strToU8(content);
    const stream = compress ? deflateSync(raw) : raw;
    const head = strToU8(`%PDF-1.4\n1 0 obj<</Length ${stream.length}>>stream\n`);
    const tail = strToU8("\nendstream endobj\n%%EOF\n");
    const out = new Uint8Array(head.length + stream.length + tail.length);
    out.set(head, 0);
    out.set(stream, head.length);
    out.set(tail, head.length + stream.length);
    return out;
  }

  it("extrait du texte d'un PDF non compressé avec caractères spéciaux", () => {
    const doc = extractDocument(makePdf(["Nom : ........", "Montant (EUR) : ____"], false), "application/pdf", "a.pdf");
    expect(doc.text).toContain("Nom");
    expect(hasUnsafeUnicode(doc)).toBe(false);
  });

  it("extrait du texte d'un PDF compressé (flate)", () => {
    const doc = extractDocument(makePdf(["Reference : ....", "Ville : ...."], true), "application/pdf", "b.pdf");
    expect(doc.text.length).toBeGreaterThan(0);
    expect(hasUnsafeUnicode(doc)).toBe(false);
  });

  it("ne plante pas sur un PDF binaire corrompu", () => {
    const junk = new Uint8Array(512);
    for (let i = 0; i < junk.length; i += 1) junk[i] = i % 256;
    const doc = extractDocument(junk, "application/pdf", "corrompu.pdf");
    expect(typeof doc.text).toBe("string");
    expect(hasUnsafeUnicode(doc)).toBe(false);
  });
});
