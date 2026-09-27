import { qrSvg } from "./qr";

export type CardRow = {
  name: string;
  qrToken: string;
  slotLabel: string | null;
  sectionLabel: string | null;
};

// Physical dimensions matter here in a way they don't anywhere else in this
// app. The ESP32-CAM reads these cards from a fixed guide at ~8cm with a QVGA
// (320px wide) frame, which works out to about 3.3 pixels per millimetre. A
// 34mm QR is therefore ~113px across; divided by the 29 modules of a version-1
// code plus its quiet zone, the decoder gets ~3.9 pixels per module. quirc
// needs 3 to have a chance and is comfortable at 4.
//
// Shrink the QR and you fall off that cliff quickly — at 25mm you're at 2.9
// and the reader becomes unreliable in exactly the way that's maddening to
// debug, because it still works sometimes.
const QR_MM = 34;

// CR80 — the same size as a bank card, so ordinary laminating pouches and
// lanyard holders fit. Four rows of two fit on A4 with room for cut margins.
const CARD_W_MM = 85.6;
const CARD_H_MM = 54;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

export async function renderCardSheet(rows: CardRow[]): Promise<string> {
  const cards = await Promise.all(
    rows.map(async (r) => {
      const svg = await qrSvg(r.qrToken);
      return `
      <div class="card">
        <div class="qr">${svg}</div>
        <div class="meta">
          <div class="name">${escapeHtml(r.name)}</div>
          <div class="slot">${escapeHtml(r.slotLabel ?? "No locker assigned")}</div>
          <div class="section">${escapeHtml(r.sectionLabel ?? "No schedule")}</div>
          <div class="token">${escapeHtml(r.qrToken)}</div>
        </div>
      </div>`;
    })
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LockIn student cards</title>
<style>
  @page { size: A4; margin: 8mm; }

  :root { color-scheme: light; }
  body {
    margin: 0;
    background: #f4f4f5;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000;
  }

  .notice {
    max-width: 180mm;
    margin: 8mm auto;
    padding: 4mm 5mm;
    background: #fff7ed;
    border: 1px solid #fdba74;
    border-radius: 3mm;
    font-size: 11pt;
    line-height: 1.5;
  }
  .notice h2 { margin: 0 0 2mm; font-size: 12pt; }
  .notice code { background: #fff; padding: 0 1mm; border-radius: 1mm; }

  .sheet {
    display: grid;
    grid-template-columns: repeat(2, ${CARD_W_MM}mm);
    gap: 4mm;
    justify-content: center;
    padding: 4mm 0;
  }

  .card {
    width: ${CARD_W_MM}mm;
    height: ${CARD_H_MM}mm;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 3mm;
    padding: 3mm;
    background: #fff;
    /* A visible cut line on paper; it costs nothing and saves crooked scissors. */
    outline: 0.2mm dashed #9ca3af;
    break-inside: avoid;
  }

  .qr { flex: 0 0 auto; }
  /* Sized here rather than trusting the attributes the qrcode library emits.
     crispEdges stops the printer driver antialiasing module edges into grey,
     which is what the camera sees as a blurry, undecodable code. */
  .card .qr svg {
    width: ${QR_MM}mm;
    height: ${QR_MM}mm;
    display: block;
    shape-rendering: crispEdges;
  }

  .meta { min-width: 0; line-height: 1.3; }
  .name    { font-size: 11pt; font-weight: 700; }
  .slot    { font-size: 14pt; font-weight: 800; margin-top: 1mm; }
  .section { font-size: 8pt; color: #52525b; margin-top: 1mm; }
  .token   { font-size: 6pt; color: #a1a1aa; margin-top: 2mm; font-family: ui-monospace, monospace; }

  @media print {
    body { background: #fff; }
    .notice { display: none; }
    .sheet { padding: 0; gap: 4mm; }
  }
</style>
</head>
<body>
  <div class="notice">
    <h2>Before you print</h2>
    Print at <strong>100% scale</strong> — turn off "Fit to page" / "Shrink to fit".
    Any rescaling changes the physical QR size and the locker's camera is focused
    for a ${QR_MM}mm code.<br><br>
    Use <strong>matte</strong> paper or matte laminate. Glossy lamination reflects
    the locker's lighting straight back into the lens and is the single most
    common cause of a card that won't scan.<br><br>
    ${rows.length} card${rows.length === 1 ? "" : "s"}, 8 per sheet.
  </div>
  <div class="sheet">${cards.join("")}</div>
</body>
</html>`;
}
