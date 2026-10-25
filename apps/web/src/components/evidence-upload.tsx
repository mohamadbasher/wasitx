"use client";
import { FileText, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useToast } from "@wasitx/ui";
import { upload } from "@/lib/api";
import { useErrorText } from "@/lib/hooks";

export function EvidenceUpload({ files, onChange, purpose = "DISPUTE_EVIDENCE" }: { files: { id: string; fileName: string }[]; onChange: (f: { id: string; fileName: string }[]) => void; purpose?: "DISPUTE_EVIDENCE" | "PAYMENT_EVIDENCE" }) {
  const t = useTranslations();
  const err = useErrorText();
  const toast = useToast();
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-4 text-sm text-muted hover:bg-surface-2">
        <Upload className="size-4" /> {t("chat.attach")} (JPG, PNG, PDF · 8MB)
        <input
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const r = await upload(file, purpose);
              onChange([...files, r]);
            } catch (er) {
              toast("danger", err(er));
            }
            e.target.value = "";
          }}
        />
      </label>
      {files.map((f) => (
        <p key={f.id} className="flex items-center gap-1.5 text-xs text-muted"><FileText className="size-3.5" />{f.fileName}</p>
      ))}
    </div>
  );
}
