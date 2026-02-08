import admin from "firebase-admin";
import { getAdminApp } from "./firebase-admin";

const getBucket = () => {
  const app = getAdminApp();
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    app.options.storageBucket ||
    `${app.options.projectId}.appspot.com`;
  return admin.storage(app).bucket(bucketName);
};

export const extractPdfTextFromStorage = async (storagePath: string, maxPages = 20) => {
  const bucket = getBucket();
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata();
  const [buffer] = await file.download();
  const { text } = await extractPdfTextFromBuffer(buffer, maxPages);
  return { text, metadata };
};

export const extractPdfTextFromBuffer = async (buffer: Buffer, maxPages = 20) => {
  if (!(globalThis as any).DOMMatrix) {
    try {
      const polyfill = await import("dommatrix");
      (globalThis as any).DOMMatrix = (polyfill as any).DOMMatrix || (polyfill as any).default || polyfill;
    } catch {
      // If the polyfill fails, pdf parsing may still fail; caller handles gracefully.
    }
  }
  const mod = await import("pdf-parse");
  const PDFParseCtor = (mod as any).PDFParse || (mod as any).default?.PDFParse;
  if (!PDFParseCtor) {
    throw new Error("PDFParse constructor not available.");
  }
  const parser = new PDFParseCtor({ data: buffer });
  const result = await parser.getText({ first: maxPages });
  const text = typeof result?.text === "string" ? result.text : "";
  if (typeof parser.destroy === "function") {
    await parser.destroy();
  }
  return { text: text.trim() };
};
