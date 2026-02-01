import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";
import { getAdminApp } from "./firebase-admin";

const resolveWorkerSrc = () => {
  try {
    const base = path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "pdf-parse");
    const cjsWorker = path.join(base, "cjs", "pdf.worker.mjs");
    if (fs.existsSync(cjsWorker)) {
      return pathToFileURL(cjsWorker).toString();
    }
    const esmWorker = path.join(base, "esm", "pdf.worker.mjs");
    if (fs.existsSync(esmWorker)) {
      return pathToFileURL(esmWorker).toString();
    }
    return "";
  } catch {
    return "";
  }
};

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
  const workerSrc = resolveWorkerSrc();
  if (workerSrc) {
    PDFParse.setWorker(workerSrc);
  }
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText({ first: maxPages });
  const text = typeof result?.text === "string" ? result.text : "";
  await parser.destroy();
  return { text: text.trim(), metadata };
};
