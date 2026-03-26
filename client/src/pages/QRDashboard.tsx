import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Search, Edit2, Clock, ChevronLeft, ChevronRight, CheckSquare, ExternalLink, X } from "lucide-react";
import ScanLogDrawer from "@/components/ScanLogDrawer";

const PAGE_SIZE = 50;

export default function QRDashboard() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit modal state
  const [editModal, setEditModal] = useState<{ id: number; qrNumber: number; currentUrl: string } | null>(null);
  const [editUrl, setEditUrl] = useState("");

  // Bulk modal state
  const [bulkUrl, setBulkUrl] = useState("");
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  // Scan drawer state
  const [scanDrawerQr, setScanDrawerQr] = useState<{ id: number; number: number } | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.qr.list.useQuery(
    { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, status },
    { placeholderData: (prev) => prev, refetchInterval: 30_000, refetchIntervalInBackground: false }
  );

  const updateDest = trpc.qr.updateDestination.useMutation({
    onSuccess: () => {
      utils.qr.list.invalidate();
      setEditModal(null);
      toast.success("Destination updated");
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const bulkUpdate = trpc.qr.bulkUpdateDestination.useMutation({
    onSuccess: () => {
      utils.qr.list.invalidate();
      setSelected(new Set());
      setShowBulkDialog(false);
      setBulkUrl("");
      toast.success(`Updated ${selected.size} QR codes`);
    },
    onError: () => toast.error("Bulk update failed"),
  });

  const toggleStatus = trpc.qr.toggleStatus.useMutation({
    onSuccess: () => { utils.qr.list.invalidate(); toast.success("Status updated"); },
    onError: () => toast.error("Failed to update status"),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(Number(r.id)));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allPageSelected) rows.forEach((r) => next.delete(Number(r.id)));
    else rows.forEach((r) => next.add(Number(r.id)));
    setSelected(next);
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { setDebouncedSearch(val); setPage(1); }, 300);
  };

  const openEdit = (id: number, qrNumber: number, currentUrl: string) => {
    setEditUrl(currentUrl);
    setEditModal({ id, qrNumber, currentUrl });
  };

  const saveEdit = () => {
    if (!editModal) return;
    updateDest.mutate({ id: editModal.id, destinationUrl: editUrl });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">QR Codes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} codes · redirecting via <code className="text-xs bg-muted px-1 py-0.5 rounded">{window.location.hostname}/qr/###</code>
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => setShowBulkDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <CheckSquare className="h-4 w-4" />
            Set Destination ({selected.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by QR #, URL, or destination…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
          className="px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
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
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Scans</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded" /></td>))}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No QR codes found.</td></tr>
              ) : rows.map((qr) => {
                const id = Number(qr.id);
                const qrNumber = Number(qr.qrNumber);
                const scanCount = Number(qr.scanCount ?? 0);
                const isActive = Boolean(qr.isActive);
                const destinationUrl = qr.destinationUrl ?? null;

                return (
                  <tr key={id} className={`hover:bg-muted/30 transition-colors ${selected.has(id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(id)) next.delete(id); else next.add(id);
                          setSelected(next);
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">{String(qrNumber).padStart(3, "0")}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {window.location.hostname}{qr.redirectPath}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {destinationUrl ? (
                        <a href={destinationUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs hover:text-primary truncate">
                          <span className="truncate">{destinationUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{scanCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleStatus.mutate({ id, isActive: !isActive })}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-600 hover:bg-red-200"}`}
                      >
                        {isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(id, qrNumber, destinationUrl ?? "")}
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                          title="Edit destination"
                        >
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => setScanDrawerQr({ id, number: qrNumber })}
                          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
                          title="View scan history"
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </td>
                  </tr>
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-accent disabled:opacity-40 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 flex items-center justify-center rounded-lg border hover:bg-accent disabled:opacity-40 transition-colors"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditModal(null)} />
          <div className="relative bg-card rounded-xl border shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Edit Destination</h2>
                <p className="text-sm text-muted-foreground">QR #{String(editModal.qrNumber).padStart(3, "0")}</p>
              </div>
              <button onClick={() => setEditModal(null)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="https://g.page/r/your-review-link/review"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-4"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditModal(null); }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditModal(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={saveEdit}
                disabled={updateDest.isPending || !editUrl.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {updateDest.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk URL Dialog */}
      {showBulkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBulkDialog(false)} />
          <div className="relative bg-card rounded-xl border shadow-xl p-6 w-full max-w-md">
            <h2 className="text-base font-semibold mb-1">Set Destination URL</h2>
            <p className="text-sm text-muted-foreground mb-4">Apply to {selected.size} selected QR code{selected.size !== 1 ? "s" : ""}.</p>
            <input
              type="url"
              value={bulkUrl}
              onChange={(e) => setBulkUrl(e.target.value)}
              placeholder="https://g.page/r/your-review-link/review"
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowBulkDialog(false)} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => bulkUpdate.mutate({ ids: Array.from(selected), destinationUrl: bulkUrl })}
                disabled={bulkUpdate.isPending || !bulkUrl.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {bulkUpdate.isPending ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan Log Drawer */}
      {scanDrawerQr && <ScanLogDrawer qrCodeId={scanDrawerQr.id} qrNumber={scanDrawerQr.number} onClose={() => setScanDrawerQr(null)} />}
    </div>
  );
}
