import { trpc } from "@/lib/trpc";
import { X, Monitor, Smartphone, Globe, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";

type Props = {
  qrCodeId: number;
  qrNumber: number;
  onClose: () => void;
};

export default function ScanLogDrawer({ qrCodeId, qrNumber, onClose }: Props) {
  const { data: logs, isLoading } = trpc.qr.scanLogs.useQuery({ qrCodeId, limit: 100 });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold">Scan History</h2>
            <p className="text-sm text-muted-foreground">QR #{String(qrNumber).padStart(3, "0")}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))
          ) : !logs?.length ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No scans recorded yet.</p>
            </div>
          ) : logs.map((log) => (
            <div key={log.id} className="rounded-lg border bg-background p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {format(new Date(log.scannedAt), "MMM d, yyyy · h:mm a")}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  log.deviceType === "mobile" ? "bg-blue-100 text-blue-700" :
                  log.deviceType === "bot" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {log.deviceType === "mobile" ? <Smartphone className="inline h-3 w-3 mr-1" /> : <Monitor className="inline h-3 w-3 mr-1" />}
                  {log.deviceType ?? "unknown"}
                </span>
              </div>
              {(log.city || log.country) && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[log.city, log.region, log.country].filter(Boolean).join(", ")}
                </div>
              )}
              {log.ipAddress && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 shrink-0" />
                  {log.ipAddress}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
