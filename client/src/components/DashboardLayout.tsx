import { useAuth } from "@/hooks/useAuth";
import { QrCode, BarChart2, History, LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import Login from "@/pages/Login";

const navItems = [
  { icon: QrCode, label: "QR Codes", path: "/" },
  { icon: BarChart2, label: "Stats", path: "/stats" },
  { icon: History, label: "Scan History", path: "/scan-history" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A2342" }}>
        <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#FF8C00", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!user) return <Login />;

  const NavContent = () => (
    <nav className="flex flex-col h-full" style={{ backgroundColor: "#0A2342" }}>
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="h-8 w-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="RMP" className="h-7 w-7 object-contain" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-xs font-bold text-white tracking-tight">Rental Marketing</span>
          <span className="text-xs font-bold tracking-tight" style={{ color: "#FF8C00" }}>Pros</span>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => { setLocation(item.path); setMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: isActive ? "#FF8C00" : "transparent",
                color: isActive ? "#ffffff" : "#A1A0A5",
              }}
              onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,140,0,0.15)"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; } }}
              onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#A1A0A5"; } }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Sign out */}
      <div className="p-3 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
          style={{ color: "#A1A0A5" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(220,38,38,0.15)"; (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "#A1A0A5"; }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#F4F4F4" }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col shadow-xl">
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 h-full shadow-xl">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b bg-white shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" style={{ color: "#0A2342" }} />
          </button>
          <img src="/logo.png" alt="RMP" className="h-7 w-7 object-contain" />
          <span className="font-semibold text-sm" style={{ color: "#0A2342" }}>
            {navItems.find((n) => n.path === location)?.label ?? "QR Manager"}
          </span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
