import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const executablePath = process.env.DESKTOP_EXECUTABLE;
if (!executablePath)
  throw new Error(
    "Set DESKTOP_EXECUTABLE to the packaged application executable",
  );
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "worldmodel-desktop-"));
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const content = "BT /F1 18 Tf 24 100 Td (WorldModel PDF smoke check) Tj ET";
objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
let pdf = "%PDF-1.4\n",
  offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf +=
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
  offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const pdfPath = path.join(temp, "smoke.pdf");
fs.writeFileSync(pdfPath, pdf);
const app = await electron.launch({
  executablePath: path.resolve(executablePath),
  args: process.platform === "linux" ? ["--no-sandbox"] : [],
  timeout: 60000,
});
try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.worldmodel, { timeout: 30000 });
  const result = await page.evaluate(async (pdfPath) => {
    const before = await window.worldmodel.snapshot();
    const chat = await window.worldmodel.newChat();
    try {
      const imported = await window.worldmodel.importFiles([
        { diskPath: pdfPath, name: "smoke.pdf", owner: chat.id },
      ]);
      const asset = imported.assets.find((a) => a.owner === chat.id);
      return {
        builtin: before.builtin.length,
        pages: asset?.pages,
        thumbnail: asset?.thumbnail,
        warning: asset?.warning,
      };
    } finally {
      await window.worldmodel.deleteChats([chat.id]);
    }
  }, pdfPath);
  assert.ok(result.builtin > 0);
  assert.equal(result.pages, 1);
  assert.equal(result.thumbnail, true);
  assert.equal(result.warning, undefined);
  console.log("Packaged application and native PDF parsing passed", result);
} finally {
  await app.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
