import { trpc } from "@/lib/trpc";
import { QrCode, Activity, TrendingUp, CheckCircle, XCircle, Settings } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function Stats() {
  const { data: stats, isLoading: statsLoading } = trpc.qr.stats.useQuery(undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false });
  const { data: topCodes, isLoading: topLoading } = trpc.qr.topCodes.useQuery({ limit: 10 }, { refetchInterval: 30_000, refetchIntervalInBackground: false });

  const statCards = [
    { label: "Total QR Codes", value: stats?.total ?? 0, icon: QrCode, color: "text-primary" },
    { label: "Active", value: stats?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Inactive", value: stats?.inactive ?? 0, icon: XCircle, color: "text-red-500" },
    { label: "Configured", value: stats?.configured ?? 0, icon: Settings, color: "text-blue-600" },
    { label: "Total Scans", value: stats?.totalScans ?? 0, icon: Activity, color: "text-purple-600" },
  ];

  const chartData = (topCodes ?? []).map((qr) => ({
    name: `#${String(qr.qrNumber).padStart(3, "0")}`,
    scans: qr.scanCount,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Stats</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Overview of your QR code performance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            {statsLoading ? (
              <div className="h-7 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>

      {/* Top performers */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Top 10 Most Scanned</h2>
        </div>
        {topLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No scans recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="scans" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
