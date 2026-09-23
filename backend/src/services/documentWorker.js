import { parentPort, workerData } from "node:worker_threads";
import yauzl from "yauzl";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const { type, limits } = workerData;
const bytes = Buffer.from(workerData.bytes);
const failure = (status, message) => Object.assign(new Error(message), { status });
const decode = (buffer) => new TextDecoder("utf-8", { fatal: true }).decode(buffer);

function validateText(text) {
  if (text.length > limits.maxChars) throw failure(413, "В документе слишком много текста. Разделите его на части.");
  if (!text.trim()) throw failure(422, "Текст не найден. Для скана требуется OCR, который пока не поддерживается.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw failure(422, "Документ содержит недопустимые текстовые данные.");
  return text;
}

function readDocx() {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      let expanded = 0;
      let count = 0;
      const files = new Map();
      const seen = new Set();
      const needed = new Set(["[Content_Types].xml", "word/document.xml"]);
      const fail = (error) => { zip.close(); reject(error); };
      zip.on("error", fail);
      zip.on("entry", (entry) => {
        const name = entry.fileName;
        expanded += entry.uncompressedSize;
        count++;
        if (count > limits.maxEntries || expanded > limits.maxExpandedBytes
          || entry.uncompressedSize > Math.max(entry.compressedSize * 200, 1024 * 1024)) {
          return fail(failure(413, "Архив DOCX превышает ограничения распаковки."));
        }
        if (seen.has(name) || /(^|\/)\.\.(\/|$)|\\|^\/|^[a-z]:/i.test(name)
          || /vbaProject|activeX|embeddings/i.test(name) || (entry.generalPurposeBitFlag & 1)) {
          return fail(failure(422, "DOCX содержит недопустимые или зашифрованные вложения."));
        }
        seen.add(name);
        if (!needed.has(name)) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = [];
          let size = 0;
          stream.on("error", fail);
          stream.on("data", (chunk) => {
            size += chunk.length;
            if (size > limits.maxExpandedBytes) {
              stream.destroy();
              fail(failure(413, "DOCX слишком велик после распаковки."));
            } else chunks.push(chunk);
          });
          stream.on("end", () => { files.set(name, decode(Buffer.concat(chunks))); zip.readEntry(); });
        });
      });
      zip.on("end", () => {
        try {
          if (!files.has("word/document.xml") || !files.has("[Content_Types].xml")) throw new Error();
          for (const xml of files.values()) {
            if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error();
          }
          const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, trimValues: false, parseTagValue: false });
          const contentTypes = new XMLParser({ ignoreAttributes: false }).parse(files.get("[Content_Types].xml"));
          const overrides = contentTypes.Types?.Override;
          const entries = Array.isArray(overrides) ? overrides : [overrides];
          if (!entries.some((item) => item?.["@_PartName"] === "/word/document.xml"
            && item["@_ContentType"] === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) throw new Error();
          const tree = parser.parse(files.get("word/document.xml"));
          if (!tree.some((node) => node["w:document"])) throw new Error();
          let text = "";
          const append = (part) => {
            text += part;
            if (text.length > limits.maxChars) throw failure(413, "В документе слишком много текста.");
          };
          const walk = (nodes) => {
            for (const node of nodes) {
              for (const [tag, children] of Object.entries(node)) {
                if (tag === "w:t") append(children.map((child) => child["#text"] || "").join(""));
                else if (tag === "w:tab") append("\t");
                else if (tag === "w:br") append("\n");
                else if (Array.isArray(children)) { walk(children); if (tag === "w:p") append("\n"); }
              }
            }
          };
          walk(tree);
          resolve(text);
        } catch (error) { reject(error); }
      });
      zip.readEntry();
    });
  });
}

try {
  let pages;
  if (type === "txt") {
    const text = decode(bytes);
    if (/^\s*(%PDF-|PK\u0003\u0004)/.test(text)) throw new Error();
    pages = [{ page: null, text: validateText(text) }];
  } else if (type === "docx") {
    if (bytes.subarray(0, 4).toString("hex") !== "504b0304") throw new Error();
    pages = [{ page: null, text: validateText(await readDocx()) }];
  } else {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error();
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false,
      useSystemFonts: false, disableFontFace: true, stopAtErrors: true, verbosity: 0 });
    try {
      const pdf = await loading.promise;
      if (pdf.numPages > limits.maxPages) throw failure(413, "PDF содержит слишком много страниц.");
      pages = [];
      let length = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const stream = page.streamTextContent().getReader();
        let text = "";
        while (true) {
          const chunk = await stream.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            const part = item.str ? item.str + (item.hasEOL ? "\n" : " ") : "";
            length += part.length;
            if (length > limits.maxChars) throw failure(413, "В PDF слишком много текста.");
            text += part;
          }
        }
        pages.push({ page: number, text });
        page.cleanup();
      }
      validateText(pages.map((page) => page.text).join("\n"));
    } finally { await loading.destroy(); }
  }
  parentPort.postMessage({ pages });
} catch (error) {
  parentPort.postMessage({ status: error.status || 422, error: error.status ? error.message
    : "Документ повреждён, зашифрован или имеет неверный формат. TXT должен быть в UTF-8." });
}
