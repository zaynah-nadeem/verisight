import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

const VERDICT_LABELS = {
  likely_authentic: "Likely authentic",
  inconclusive: "Inconclusive",
  ai_generated: "Likely AI-generated",
};

const VERDICT_COLORS = {
  likely_authentic: "#3F7A57",
  inconclusive: "#966A1E",
  ai_generated: "#B03A2E",
};

const C2PA_LABELS = {
  absent: "Not present",
  present: "Present",
  valid: "Present and verified",
  invalid: "Failed verification",
  unverified: "Signer not verified",
};

const C2PA_SUMMARY = {
  absent: "No content credentials were found in this file. That is common and does not mean it is fake.",
  present: "Content credentials were found. This file carries a signed record of how it was made.",
  valid: "The credentials match the file and the signer is trusted.",
  unverified:
    "The credentials match the file, but the signer's certificate could not be verified. This does not mean the file was changed.",
  validUntrusted:
    "The credentials match the file, but the signer is not on our trusted list, so we cannot confirm who made it.",
  invalid: "The credentials no longer match the file, so it may have been changed after it was signed.",
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function credentialsHtml(c2pa) {
  const notTrusted = c2pa.status === "valid" && c2pa.trusted === false;
  const title = escapeHtml(notTrusted ? "Present, signer not on trusted list" : C2PA_LABELS[c2pa.status] || "Unknown");
  const actions = Array.isArray(c2pa.actions) ? c2pa.actions : [];
  const codes = Array.isArray(c2pa.codes) ? [...new Set(c2pa.codes)] : [];
  const structured = !!(c2pa.tool || c2pa.signer || actions.length || codes.length);

  const badge = c2pa.ai_generated ? ` <span class="badge">AI-GENERATED</span>` : "";
  const summary = notTrusted ? C2PA_SUMMARY.validUntrusted : C2PA_SUMMARY[c2pa.status] || c2pa.detail || "";
  let html = `<b>${title}</b>${badge}`;
  if (summary) html += `<br/>${escapeHtml(summary)}`;

  if (structured) {
    const rows = [];
    if (c2pa.tool) rows.push(`<tr><td class="k">Made with</td><td>${escapeHtml(c2pa.tool)}</td></tr>`);
    if (c2pa.signer) rows.push(`<tr><td class="k">Signed by</td><td>${escapeHtml(c2pa.signer)}</td></tr>`);
    if (actions.length) rows.push(`<tr><td class="k">History</td><td>${actions.map(escapeHtml).join(", ")}</td></tr>`);
    if (codes.length) rows.push(`<tr><td class="k">Codes</td><td>${codes.map(escapeHtml).join(", ")}</td></tr>`);
    if (rows.length) html += `<table class="info">${rows.join("")}</table>`;
  } else if (c2pa.status !== "absent" && c2pa.detail) {
    // older saved scans only have the text version
    html += `<br/>${escapeHtml(c2pa.detail).replace(/\n/g, "<br/>")}`;
  }
  return html;
}

async function imageToDataUri(uri) {
  try {
    const base64 = await new File(uri).base64();
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    return null; // report still works without the photo
  }
}

async function buildHtml({ result, file }) {
  const { verdict, c2pa, disclaimer } = result;
  const key = verdict.verdict;
  const color = VERDICT_COLORS[key] || "#966A1E";
  const label = VERDICT_LABELS[key] || "Inconclusive";
  const low = Math.round(verdict.confidence_low);
  const high = Math.round(verdict.confidence_high);
  const fileName = file?.fileName || file?.uri?.split("/").pop() || "Untitled";
  const when = file?.createdAt ? new Date(file.createdAt) : new Date();
  const isVideo = result.file_type === "video";

  let preview = "";
  if (!isVideo && file?.uri) {
    const dataUri = await imageToDataUri(file.uri);
    if (dataUri) preview = `<img class="preview" src="${dataUri}" />`;
  }

  const reasons = (verdict.explanation || [])
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  return `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2B1B12; padding: 28px 36px 8px; margin: 0; }
      .brand { font-size: 12px; letter-spacing: 2px; font-weight: 700; color: #7F2D2D; }
      h1 { font-size: 28px; margin: 6px 0 4px; }
      .meta { color: #7A6A5A; font-size: 12px; margin-bottom: 22px; }
      .preview { width: 100%; max-height: 280px; object-fit: contain; border-radius: 10px; margin-bottom: 22px; background: #F0E6D6; }
      .verdict { font-size: 24px; font-weight: 800; color: ${color}; margin-bottom: 16px; }
      .label { font-size: 11px; font-weight: 700; letter-spacing: 1.2px; color: #7A6A5A; margin: 22px 0 8px; }
      .track { height: 10px; background: #E3D4BE; border-radius: 5px; position: relative; }
      .range { position: absolute; top: 0; bottom: 0; left: ${low}%; width: ${Math.max(high - low, 2)}%; background: ${color}; border-radius: 5px; }
      .range-text { font-size: 13px; font-weight: 700; margin-top: 8px; }
      ul { padding-left: 18px; margin: 0; }
      li { margin-bottom: 6px; font-size: 14px; line-height: 1.5; }
      .box { border: 1px solid #E3D4BE; border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.5; }
      .badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; color: #B03A2E; border: 1px solid #B03A2E; border-radius: 999px; padding: 1px 7px; margin-left: 6px; }
      .info { border-collapse: collapse; margin-top: 10px; width: 100%; }
      .info td { padding: 3px 0; vertical-align: top; font-size: 12px; }
      .info td.k { width: 84px; color: #7A6A5A; font-weight: 600; }
      .disclaimer { margin-top: 22px; font-size: 11px; color: #7A6A5A; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="brand">VERISIGHT</div>
    <h1>Scan report</h1>
    <div class="meta">${escapeHtml(fileName)} &middot; ${isVideo ? "Video" : "Image"} &middot; ${escapeHtml(when.toLocaleString())}</div>
    ${preview}
    <div class="verdict">${escapeHtml(label)}</div>
    <div class="label">AI-GENERATED LIKELIHOOD</div>
    <div class="track"><div class="range"></div></div>
    <div class="range-text">Between ${low}% and ${high}%</div>
    <div class="label">WHY WE SAY THAT</div>
    <ul>${reasons}</ul>
    <div class="label">CONTENT CREDENTIALS</div>
    <div class="box">${credentialsHtml(c2pa)}</div>
    <div class="disclaimer">${escapeHtml(disclaimer)}</div>
  </body>
</html>`;
}

// Android only lets the share sheet read files from the app's cache folder.
// So the PDF is saved there ourselves from the text version Print gives us.
async function saveToCache(base64) {
  try {
    const target = new File(Paths.cache, "Verisight-report.pdf");
    if (target.exists) await target.delete();
    await target.create();
    await target.write(base64, { encoding: "base64" });
    return target.uri;
  } catch (e) {
    return null;
  }
}

export async function shareReport({ result, file }) {
  const html = await buildHtml({ result, file });
  const printed = await Print.printToFileAsync({ html, base64: true });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }

  const savedUri = printed.base64 ? await saveToCache(printed.base64) : null;
  await Sharing.shareAsync(savedUri || printed.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "Share scan report",
  });
}