import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { Search, Monitor, Smartphone, MapPin, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 50;

function downloadCSV(rows: any[]) {
  const headers = ["Time", "QR #", "City", "Region", "Country", "Device", "IP Address", "Referrer"];
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((log) => [
      format(new Date(log.scannedAt), "yyyy-MM-dd HH:mm:ss"),
      String(log.qrNumber).padStart(3, "0"),
      log.city ?? "",
      log.region ?? "",
      log.country ?? "",
      log.deviceType ?? "",
      log.ipAddress ?? "",
      log.referrer ?? "",
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `scan-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ScanHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = trpc.qr.allScanLogs.useQuery(
    { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined },
    { placeholderData: (prev) => prev, refetchInterval: 30_000, refetchIntervalInBackground: false }
  );

  // Separate query for full export — only fires when exporting
  const exportQuery = trpc.qr.allScanLogs.useQuery(
    { page: 1, pageSize: 10000, search: debouncedSearch || undefined },
    { enabled: false }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data?.rows) {
        downloadCSV(result.data.rows);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scan History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} total scans recorded</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || total === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#FF8C00", color: "#ffffff" }}
        >
          <Download className="h-4 w-4" />
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by QR #, city, country, device…"
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Time</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">QR #</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Device</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No scans recorded yet.</td></tr>
              ) : rows.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.scannedAt), "MMM d, yyyy · h:mm a")}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium">
                    #{String(log.qrNumber).padStart(3, "0")}
                  </td>
                  <td className="px-4 py-3">
                    {(log.city || log.country) ? (
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        {[log.city, log.region, log.country].filter(Boolean).join(", ")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      log.deviceType === "mobile" ? "bg-blue-100 text-blue-700" :
                      log.deviceType === "bot" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {log.deviceType === "mobile" ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                      {log.deviceType ?? "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{log.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total.toLocaleString()} total</span>
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
