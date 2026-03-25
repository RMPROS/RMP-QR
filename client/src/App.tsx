import { Toaster } from "sonner";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import QRDashboard from "./pages/QRDashboard";
import Stats from "./pages/Stats";
import ScanHistory from "./pages/ScanHistory";

function App() {
  return (
    <>
      <Toaster richColors position="top-right" />
      <DashboardLayout>
        <Switch>
          <Route path="/" component={QRDashboard} />
          <Route path="/stats" component={Stats} />
          <Route path="/scan-history" component={ScanHistory} />
          <Route>
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Page not found.</p>
            </div>
          </Route>
        </Switch>
      </DashboardLayout>
    </>
  );
}

export default App;
