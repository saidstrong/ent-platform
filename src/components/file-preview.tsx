'use client';

import Link from "next/link";
import { useI18n } from "../lib/i18n";

type FilePreviewProps = {
  url: string;
  filename?: string;
  contentType?: string;
  maxHeight?: number;
};

const inferContentType = (url: string) => {
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".ogg")) return "video/ogg";
  return "";
};

const getKind = (contentType: string) => {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("video/")) return "video";
  return "other";
};

export default function FilePreview({ url, filename, contentType, maxHeight = 200 }: FilePreviewProps) {
  const { t } = useI18n();
  const resolvedType = contentType || inferContentType(url);
  const kind = getKind(resolvedType);
  const label = filename || url.split("?")[0].split("/").pop() || t("pdf.openFile");

  if (kind === "image") {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} style={{ maxHeight }} className="w-auto rounded-md border border-neutral-200" />
        <Link href={url} className="text-xs text-blue-700" target="_blank" rel="noreferrer">
          {t("buttons.open")}
        </Link>
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="space-y-2">
        <object data={url} type="application/pdf" className="h-[240px] w-full rounded-md border border-neutral-200">
          <Link href={url} className="text-xs text-blue-700" target="_blank" rel="noreferrer">
            {t("pdf.openPdf")}
          </Link>
        </object>
        <Link href={url} className="text-xs text-blue-700" target="_blank" rel="noreferrer">
          {t("buttons.open")}
        </Link>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="space-y-2">
        <video controls className="w-full rounded-md border border-neutral-200" style={{ maxHeight }}>
          <source src={url} type={resolvedType} />
        </video>
        <Link href={url} className="text-xs text-blue-700" target="_blank" rel="noreferrer">
          {t("buttons.open")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-neutral-700">{label}</span>
      <Link href={url} className="text-blue-700" target="_blank" rel="noreferrer">
        {t("buttons.open")}
      </Link>
    </div>
  );
}
