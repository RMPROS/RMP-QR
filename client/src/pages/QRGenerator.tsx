import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Download, QrCode, Package, FileSpreadsheet, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import JSZip from "jszip";

const PAGE_SIZE = 50;

type QRRow = {
  id: number;
  qrNumber: number;
  redirectPath: string;
  destinationUrl: string | null;
  isActive: boolean;
  scanCount: number;
};

function getRedirectUrl(redirectPath: string) {
  return `https://admin.rentalmarketingpro.com${redirectPath}`;
}

async function generateQRDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: "#0A2342", light: "#FFFFFF" },
    errorCorrectionLevel: "H",
  });
}

export default function QRGenerator() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [progress, setProgress] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = trpc.qr.list.useQuery(
    { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, status: "all" },
    { placeholderData: (prev) => prev }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(Number(r.id)));

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  const toggleAll = () => {
    const next = new Set(selected);
    if (allPageSelected) rows.forEach((r) => next.delete(Number(r.id)));
    else rows.forEach((r) => next.add(Number(r.id)));
    setSelected(next);
  };

  const handlePreview = async (qr: QRRow) => {
    try {
      const url = await generateQRDataUrl(getRedirectUrl(qr.redirectPath));
      setPreviewUrl(url);
      setPreviewing(qr.id);
    } catch {
      toast.error("Failed to generate preview");
    }
  };

  const handleDownloadSingle = async (qr: QRRow) => {
    try {
      const url = await generateQRDataUrl(getRedirectUrl(qr.redirectPath));
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-${String(qr.qrNumber).padStart(3, "0")}.png`;
      a.click();
    } catch {
      toast.error("Failed to download QR code");
    }
  };

  const handleDownloadZip = async () => {
    const selectedRows = rows.filter((r) => selected.has(Number(r.id)));
    if (selectedRows.length === 0) {
      toast.error("Select at least one QR code first");
      return;
    }
    setIsDownloadingZip(true);
    setProgress(0);
    try {
      const zip = new JSZip();
      const folder = zip.folder("QR-Codes")!;
      for (let i = 0; i < selectedRows.length; i++) {
        const qr = selectedRows[i];
        const dataUrl = await generateQRDataUrl(getRedirectUrl(qr.redirectPath));
        const base64 = dataUrl.split(",")[1];
        folder.file(`QR-${String(qr.qrNumber).padStart(3, "0")}.png`, base64, { base64: true });
        setProgress(Math.round(((i + 1) / selectedRows.length) * 100));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR-Codes-${selectedRows.length}-codes.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selectedRows.length} QR codes`);
    } catch {
      toast.error("Failed to generate ZIP");
    } finally {
      setIsDownloadingZip(false);
      setProgress(0);
    }
  };

  const handleDownloadSpreadsheet = async () => {
    const selectedRows = rows.filter((r) => selected.has(Number(r.id)));
    if (selectedRows.length === 0) {
      toast.error("Select at least one QR code first");
      return;
    }
    setIsDownloadingCsv(true);
    try {
      const escape = (v: any) => {
        if (v == null) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const headers = ["QR #", "QR Code URL", "Redirect URL", "Destination (Google Review Link)", "Status"];
      const lines = [
        headers.join(","),
        ...selectedRows.map((qr) => [
          String(qr.qrNumber).padStart(3, "0"),
          getRedirectUrl(qr.redirectPath),
          getRedirectUrl(qr.redirectPath),
          qr.destinationUrl ?? "",
          qr.isActive ? "Active" : "Inactive",
        ].map(escape).join(",")),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RentalMarketingPro_QR_Codes_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${selectedRows.length} rows to CSV`);
    } catch {
      toast.error("Failed to export spreadsheet");
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">QR Generator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selected.size > 0 ? `${selected.size} selected` : `${total} total codes`} · select codes then download
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ backgroundColor: "#0A2342", color: "#ffffff" }}
            >
              <Package className="h-4 w-4" />
              {isDownloadingZip
                ? `Generating… ${progress}%`
                : `Download ZIP (${selected.size})`}
            </button>
            <button
              onClick={handleDownloadSpreadsheet}
              disabled={isDownloadingCsv}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ backgroundColor: "#FF8C00", color: "#ffffff" }}
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isDownloadingCsv ? "Exporting…" : `Export CSV (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isDownloadingZip && (
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, backgroundColor: "#FF8C00" }}
          />
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by QR # or URL…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">QR #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Redirect URL</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded" /></td>))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No QR codes found.</td></tr>
              ) : rows.map((qr) => {
                const id = Number(qr.id);
                const qrNumber = Number(qr.qrNumber);
                const isSelected = selected.has(id);
                const isPreviewing = previewing === id;

                return (
                  <>
                    <tr key={id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            setSelected(next);
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-bold" style={{ color: "#0A2342" }}>
                        {String(qrNumber).padStart(3, "0")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {getRedirectUrl(qr.redirectPath)}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate">
                        {qr.destinationUrl
                          ? <span className="text-foreground truncate">{qr.destinationUrl}</span>
                          : <span className="text-muted-foreground italic">Not set</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => isPreviewing ? setPreviewing(null) : handlePreview(qr as any)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                            title="Preview QR code"
                          >
                            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDownloadSingle(qr as any)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                            title="Download QR code"
                          >
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isPreviewing && (
                      <tr key={`preview-${id}`} className="bg-muted/20">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="flex items-center gap-6">
                            <div className="rounded-xl border p-3 bg-white shadow-sm">
                              <img src={previewUrl} alt={`QR ${qrNumber}`} className="h-32 w-32" />
                            </div>
                            <div className="space-y-1">
                              <p className="font-semibold text-sm" style={{ color: "#0A2342" }}>
                                QR #{String(qrNumber).padStart(3, "0")}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{getRedirectUrl(qr.redirectPath)}</p>
                              <p className="text-xs text-muted-foreground">400×400px · PNG · Navy on White</p>
                              <button
                                onClick={() => handleDownloadSingle(qr as any)}
                                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{ backgroundColor: "#FF8C00", color: "#ffffff" }}
                              >
                                <Download className="h-3 w-3" />
                                Download PNG
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} total</span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-accent disabled:opacity-40 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-accent disabled:opacity-40 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
