import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chunkPages } from "../electron/service.mjs";
const input = new URL("../full_book.pdf", import.meta.url);
const bytes = fs.readFileSync(input);
const hash = crypto.createHash("sha256").update(bytes).digest("hex");
const output = new URL("../electron/resources/knowledge.json", import.meta.url);
if (
  fs.existsSync(output) &&
  JSON.parse(fs.readFileSync(output, "utf8")).version === hash
) {
  console.log("Built-in knowledge is current");
  process.exit(0);
}
const task = getDocument({
  data: new Uint8Array(bytes),
  useSystemFonts: true,
  isEvalSupported: false,
});
const pdf = await task.promise;
const pages = [];
try {
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join(""),
    );
    page.cleanup();
  }
} finally {
  await task.destroy();
}
const chunks = chunkPages(pages, "builtin-theory").map((c, i) => ({
  ...c,
  id: `builtin-${hash.slice(0, 10)}-${i}`,
}));
fs.writeFileSync(
  output,
  JSON.stringify({ version: hash, pages: pages.length, chunks }),
);
console.log(
  `Embedded knowledge prepared: ${pages.length} pages, ${chunks.length} chunks`,
);
