import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import type { Locale } from "../domain/types";
import { translate } from "../i18n";

export function ReportDialog({
  locale,
  placeName,
  onClose,
  onExport,
}: {
  locale: Locale;
  placeName?: string;
  onClose: () => void;
  onExport: (text: string) => Promise<void>;
}) {
  const t = translate(locale);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    input.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("reportIssue")}
        ref={dialog}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key !== "Tab") return;
          const elements = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),textarea",
            ) ?? []),
          ];
          const first = elements[0],
            last = elements.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
          if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="dialog-heading">
          <h2>{t("reportIssue")}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("close")}
          >
            <X size={20} />
          </button>
        </div>
        <p>{placeName}</p>
        <textarea
          ref={input}
          value={issue}
          maxLength={4000}
          aria-label={t("issuePlaceholder")}
          placeholder={t("issuePlaceholder")}
          onChange={(e) => setIssue(e.target.value)}
        />
        <button
          className="primary"
          disabled={!issue.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onExport(issue.trim());
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={18} />
          {t("exportIssue")}
        </button>
      </div>
    </div>
  );
}
