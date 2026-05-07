import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import GuestUpload from "@/pages/GuestUpload";
import AddPatient from "@/pages/AddPatient";
import StudyDetail from "@/pages/StudyDetail";
import PatientDetail from "@/pages/PatientDetail";
import Login from "@/pages/Login";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Studies from "./pages/Studies";
import Worklist from "./pages/Worklist";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import OHIFViewer from "./pages/OHIFViewer";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/patients" component={Patients} />
      <Route path="/patients/add" component={AddPatient} />
      <Route path="/patients/:id" component={PatientDetail} />
      <Route path="/studies" component={Studies} />
      <Route path="/studies/:id" component={StudyDetail} />
      <Route path="/viewer/:id" component={OHIFViewer} />
      <Route path="/worklist" component={Worklist} />
      <Route path="/reports" component={Reports} />
      <Route path="/admin" component={Admin} />
      <Route path="/login" component={Login} />
      <Route path="/upload/:token" component={GuestUpload} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
