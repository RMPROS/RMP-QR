import { useAuth } from "@/hooks/useAuth";
import { QrCode, BarChart2, History, LogOut, Menu, X } from "lucide-react";
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

  // AUTH TEMPORARILY DISABLED
  // if (loading) { return <div>loading...</div> }

  // AUTH TEMPORARILY DISABLED
  // if (!user) return <Login />;

  const NavContent = () => (
    <nav className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-16 border-b">
        <QrCode className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-sm tracking-tight">QR Manager</span>
      </div>
      <div className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <button
              key={item.path}
              onClick={() => { setLocation(item.path); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="p-3 border-t">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r bg-card">
        <NavContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 h-full bg-card border-r shadow-xl">
            <NavContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 h-14 px-4 border-b bg-card">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-sm">
            {navItems.find((n) => n.path === location)?.label ?? "QR Manager"}
          </span>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
