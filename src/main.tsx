import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import { initSentry } from "./lib/sentry";
import {
  hasSensitiveAuthParameters,
  isSensitiveTelemetryLocation,
  scrubConsumedAuthParameters,
} from "./lib/sensitiveUrl";

// After a deploy, open tabs still reference the previous build's hashed
// chunks, which 404. Reload once to pick up the fresh build instead of
// surfacing a broken page; the session flag prevents reload loops when the
// failure is anything other than deploy skew.
window.addEventListener("vite:preloadError", (event) => {
  const alreadyReloaded = sessionStorage.getItem("chunk-reload-at");
  const now = Date.now();
  if (alreadyReloaded && now - Number(alreadyReloaded) < 30_000) return;
  sessionStorage.setItem("chunk-reload-at", String(now));
  event.preventDefault();
  window.location.reload();
});

async function bootstrap(): Promise<void> {
  const suppressTelemetry = isSensitiveTelemetryLocation();

  // Supabase must consume invite/OAuth credentials before telemetry starts.
  // App is dynamically imported so its default Auth client cannot race Sentry.
  if (hasSensitiveAuthParameters()) {
    try {
      const { supabase } = await import("./lib/supabase");
      await supabase.auth.getSession();
    } catch {
      // The invite UI owns the user-facing Auth error. Credentials are still
      // removed from the address bar before any other application code loads.
    } finally {
      scrubConsumedAuthParameters();
    }
  }

  if (!suppressTelemetry) initSentry();

  const [{ default: App }, { default: ErrorBoundary }] = await Promise.all([
    import("./App.tsx"),
    import("./components/ErrorBoundary"),
  ]);

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </ErrorBoundary>
  );
}

void bootstrap();
