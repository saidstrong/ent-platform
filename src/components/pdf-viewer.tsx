'use client';

import { useEffect, useMemo, useState } from "react";
import Button from "./ui/button";
import { useI18n } from "../lib/i18n";

type PdfViewerProps = {
  url: string;
  title?: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const PdfViewer = ({ url, title }: PdfViewerProps) => {
  const [zoom, setZoom] = useState<number>(1);
  const { t } = useI18n();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[pdf] url", url);
    }
  }, [url]);

  if (!url) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        {t("pdf.previewUnavailable")}
      </div>
    );
  }

  const iframeSrc = useMemo(() => {
    if (!url) return "";
    const separator = url.includes("#") ? "&" : "#";
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      return `${url}${separator}view=FitH`;
    }
    return `${url}${separator}zoom=${Math.round(clamp(zoom, 0.7, 2) * 100)}`;
  }, [url, zoom]);

  return (
    <div className="space-y-3 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-neutral-700">{title || t("pdf.title")}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => clamp(z - 0.1, 0.7, 2))}>
            -
          </Button>
          <span className="text-xs text-neutral-600">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => clamp(z + 0.1, 0.7, 2))}>
            +
          </Button>
          <span className="mx-2 text-xs text-neutral-400">|</span>
          <a className="text-xs text-blue-700" href={url} target="_blank" rel="noreferrer">
            {t("pdf.openInNewTab")}
          </a>
          <a className="text-xs text-blue-700" href={url} target="_blank" rel="noreferrer" download>
            {t("pdf.download")}
          </a>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-2 md:p-3">
        <div className="mx-auto w-full max-w-[860px] min-w-0 overflow-hidden rounded-lg bg-white shadow">
          <iframe
            src={iframeSrc}
            title={title || t("pdf.title")}
            className="block w-full max-w-full border-0 rounded-lg h-[70vh] md:h-[85vh]"
          />
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
