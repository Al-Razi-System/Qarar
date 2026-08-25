#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataPath = path.resolve(process.argv[2] ?? path.join(root, "data"));
const outputPath = path.join(dataPath, "processed");
const registry = JSON.parse(fs.readFileSync(path.join(dataPath, "regulation_source_registry.json"), "utf8"));

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileHash(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .replace(/[ـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseArticles(text, documentCode) {
  const expression = /(?:^|\n)\s*(?:المادة|مادة)\s*\(\s*(\d+)\s*\)\s*:?[ \t]*/g;
  const matches = [...text.matchAll(expression)];
  const occurrences = new Map();
  const articles = matches.map((match, index) => {
    const printedNumber = Number(match[1]);
    const occurrence = (occurrences.get(printedNumber) ?? 0) + 1;
    occurrences.set(printedNumber, occurrence);
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const officialText = text.slice(start, end).trim();
    return {
      source_item_key: `${documentCode}.article.${String(printedNumber).padStart(2, "0")}.occurrence.${occurrence}`,
      printed_article_number: printedNumber,
      printed_article_occurrence: occurrence,
      item_type: "article",
      official_text: officialText,
      normalized_text_sha256: sha256Buffer(normalizeText(officialText)),
      classification: "display_only",
      requires_workflow_and_meeting: false,
      verification_status: "requires_pdf_verification",
    };
  });
  return {
    preamble: text.slice(0, matches[0]?.index ?? text.length).trim(),
    articles,
    duplicate_numbers: [...occurrences.entries()].filter(([, count]) => count > 1).map(([number, count]) => ({ number, count })),
  };
}

function legacyArticlePages(document) {
  if (!document.legacy_bundle_file) return [];
  const bundle = JSON.parse(fs.readFileSync(path.join(dataPath, document.legacy_bundle_file), "utf8"));
  return (bundle.policy_items ?? [])
    .filter((item) => item.import_enabled !== false && item.payload?.p_item_type === "article")
    .filter((item) => !/preamble/i.test(item.payload?.p_item_code ?? ""))
    .map((item) => item.source?.page ?? null);
}

function attachPageRanges(document, parsed) {
  if (document.manual_page_ranges) {
    for (const article of parsed.articles) {
      const range = document.manual_page_ranges[String(article.printed_article_number)];
      article.source_page_from = range?.[0] ?? null;
      article.source_page_to = range?.[1] ?? range?.[0] ?? null;
      article.page_mapping_basis = "pdf_visual_review";
    }
    return;
  }
  const pages = legacyArticlePages(document);
  if (pages.length !== parsed.articles.length) {
    throw new Error(`${document.code}: عدد مواد TXT (${parsed.articles.length}) لا يطابق مواد الحزمة القديمة (${pages.length})`);
  }
  parsed.articles.forEach((article, index) => {
    article.source_page_from = pages[index];
    article.source_page_to = pages[index];
    article.page_mapping_basis = "legacy_sequence_requires_visual_recheck";
  });
}

function knownIssues(document, parsed) {
  const issues = [];
  if (parsed.duplicate_numbers.length) {
    issues.push({
      code: "duplicate_printed_article_numbers",
      severity: "blocker",
      details: parsed.duplicate_numbers,
      resolution: "لا يجوز استخدام رقم المادة كمفتاح فريد؛ يعتمد source_item_key مع رقم الظهور والسياق.",
    });
  }
  if (document.code === "university_council") {
    issues.push({
      code: "legacy_bundle_renumbered_common_articles",
      severity: "blocker",
      details: "PDF وTXT يطبعان الأحكام العامة 41-53، بينما الحزمة القديمة حولتها إلى 16-28.",
    });
  }
  if (document.code === "graduate_studies_research_council") {
    issues.push({
      code: "legacy_bundle_renumbered_common_articles",
      severity: "blocker",
      details: "PDF وTXT يطبعان الأحكام العامة 41-53، بينما الحزمة القديمة حولتها إلى 46-58.",
    });
  }
  if (document.code === "board_of_trustees") {
    issues.push(
      {
        code: "article_4_transcription_error",
        severity: "error",
        details: "TXT يذكر «إذا شعر مركز» والصورة تظهر «إذا شغر مركز».",
      },
      {
        code: "articles_9_11_boundary_error",
        severity: "blocker",
        details: "فقرة دعوة الخبراء تابعة للمادة 9 في PDF، ثم المادة 10 لمنع مناقشة غير المدرج، ثم المادة 11 للمحضر. حدود TXT مزاحة.",
      },
    );
  }
  return issues;
}

fs.mkdirSync(outputPath, { recursive: true });
const documents = [];
const fingerprints = new Map();

for (const document of registry.documents) {
  const pdfPath = path.join(dataPath, document.pdf_file);
  const textPath = path.join(dataPath, document.text_file);
  if (fileHash(pdfPath) !== document.pdf_sha256) throw new Error(`${document.code}: تغيرت بصمة PDF`);
  if (fileHash(textPath) !== document.text_sha256) throw new Error(`${document.code}: تغيرت بصمة TXT`);

  const parsed = parseArticles(fs.readFileSync(textPath, "utf8"), document.code);
  attachPageRanges(document, parsed);
  const issues = knownIssues(document, parsed);
  for (const article of parsed.articles) {
    const values = fingerprints.get(article.normalized_text_sha256) ?? [];
    values.push(article.source_item_key);
    fingerprints.set(article.normalized_text_sha256, values);
  }

  const output = {
    schema_version: "qarar.legal_source_document.v1",
    status: "review_required_not_importable",
    source_document: {
      code: document.code,
      title_ar: document.title_ar,
      pdf_file: document.pdf_file,
      pdf_sha256: document.pdf_sha256,
      pdf_pages: document.pdf_pages,
      text_file: document.text_file,
      text_sha256: document.text_sha256,
    },
    preamble: parsed.preamble,
    articles: parsed.articles,
    detected_issues: issues,
    review_summary: {
      articles: parsed.articles.length,
      duplicate_printed_numbers: parsed.duplicate_numbers,
      verified_articles: 0,
      workflow_and_meeting_articles: 0,
      import_allowed: false,
    },
  };
  const outputFile = `${document.code}.source.json`;
  fs.writeFileSync(path.join(outputPath, outputFile), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  documents.push({
    code: document.code,
    title_ar: document.title_ar,
    output_file: outputFile,
    ...output.review_summary,
    issues: issues.length,
  });
}

const duplicateTexts = [...fingerprints.entries()]
  .filter(([, items]) => items.length > 1)
  .map(([fingerprint, items]) => ({ fingerprint, items }));
const index = {
  schema_version: "qarar.legal_source_catalog.v1",
  generated_at: new Date().toISOString(),
  status: "review_required_not_importable",
  source_directory: dataPath,
  documents,
  totals: {
    documents: documents.length,
    articles: documents.reduce((sum, document) => sum + document.articles, 0),
    issues: documents.reduce((sum, document) => sum + document.issues, 0),
    duplicate_text_groups: duplicateTexts.length,
  },
  duplicate_text_groups: duplicateTexts,
  decision: {
    legal_text_storage: "مصادر مستقلة غير قابلة للتعديل مع مفتاح داخلي مركب.",
    printed_number_uniqueness: false,
    classification_model: {
      type: "binary",
      values: ["display_only", "requires_workflow_and_meeting"],
      default: "display_only",
    },
    import_allowed: false,
  },
};
fs.writeFileSync(path.join(outputPath, "catalog.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
