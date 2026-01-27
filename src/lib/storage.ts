'use client';

import { getIdTokenResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";

const inferContentType = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogg")) return "video/ogg";
  return undefined;
};

// Canonical storage prefixes for ent-platform.firebasestorage.app (deploy rules via `firebase deploy --only storage`).
export const STORAGE_PREFIXES = {
  attachments: "attachments",
  lessonResources: "lesson-resources",
  quizImages: "quiz-images",
} as const;

const shouldLogStorage = () => process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_STORAGE === "true";

const redactStorageUrl = (bucket: string, path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`;

const decodeTokenExp = (token: string) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
};

export const uploadFile = async (path: string, file: File, metadata?: Parameters<typeof uploadBytes>[2]) => {
  const storageRef = ref(storage, path);
  type UploadMeta = NonNullable<Parameters<typeof uploadBytes>[2]> & { contentType?: string };
  const meta = metadata as UploadMeta | undefined;
  const contentType = meta?.contentType || file.type || inferContentType(file.name);
  const resolvedMetadata = contentType ? ({ ...(meta || {}), contentType } as Parameters<typeof uploadBytes>[2]) : metadata;
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No authenticated user; cannot upload to Storage.");
  }
  const tokenResult = await getIdTokenResult(user, true);
  if (!tokenResult?.token) {
    throw new Error("Missing ID token; upload aborted.");
  }
  if (shouldLogStorage()) {
    const bucket = storageRef.bucket;
    const exp = decodeTokenExp(tokenResult.token);
    console.info("[storage] upload request", {
      method: "POST",
      url: redactStorageUrl(bucket, storageRef.fullPath),
      authHeader: true,
      uid: user.uid,
      tokenExp: exp,
    });
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        const role = snap.exists() ? (snap.data() as { role?: string }).role : undefined;
        console.info("[storage] uploader role", { uid: user.uid, role: role || "missing" });
      })
      .catch(() => null);
  }
  await uploadBytes(storageRef, file, resolvedMetadata);
  return getDownloadURL(storageRef);
};

export const uploadLessonAttachment = async (courseId: string, lessonId: string, file: File) => {
  const filename = `${Date.now()}_${file.name}`;
  const path = `${STORAGE_PREFIXES.attachments}/${courseId}/${lessonId}/${filename}`;
  const url = await uploadFile(path, file, { contentType: file.type });
  return { url, path, name: file.name, size: file.size, contentType: file.type };
};

export const uploadQuizImage = async (courseId: string, lessonId: string, file: File) => {
  const filename = `${Date.now()}_${file.name}`;
  const path = `${STORAGE_PREFIXES.quizImages}/${courseId}/${lessonId}/${filename}`;
  const url = await uploadFile(path, file, { contentType: file.type });
  return { url, path, name: file.name, size: file.size, contentType: file.type };
};
