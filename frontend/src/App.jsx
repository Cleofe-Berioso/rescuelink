import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { login, validateStoredSession } from "./api";
import LoginPanel from "./components/LoginPanel";
import AdminDashboard from "./components/dashboard/AdminDashboard";
import ResponderDashboard from "./components/dashboard/ResponderDashboard";
import LoadingState from "./components/LoadingState";
import PageShell from "./components/PageShell";
import {
  buildAuthState,
  clearAuth,
  loadStoredAuth,
  saveAuth,
} from "./utils/authStorage";
import { CITIZEN_ROLE, CITIZEN_WEB_MESSAGE, getDashboardConfig, isStaffRole } from "./utils/roles";

export default function App() {
  const [auth, setAuth] = useState(null);
  const [booting, setBooting] = useState(() => Boolean(loadStoredAuth()?.access));
  const [err, setErr] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!loadStoredAuth()?.access) {
        if (!cancelled) setBooting(false);
        return;
      }

      const stored = await validateStoredSession();
      if (cancelled) return;

      if (stored) {
        setAuth(buildAuthState(stored));
      } else {
        setAuth(null);
      }
      setBooting(false);
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(username, password, staySignedIn) {
    setErr("");
    setLoggingIn(true);
    try {
      const data = await login(username, password);
      const role = data.user?.role || CITIZEN_ROLE;

      if (!isStaffRole(role)) {
        throw new Error(CITIZEN_WEB_MESSAGE);
      }

      const session = {
        access: data.access,
        refresh: data.refresh,
        username: data.user?.username || username,
        role,
        user: data.user,
      };

      saveAuth(session, staySignedIn);
      setAuth({
        ...session,
        config: getDashboardConfig(role),
        staySignedIn,
      });
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoggingIn(false);
    }
  }

  function handleSignOut() {
    clearAuth();
    setAuth(null);
    setErr("");
  }

  if (booting) {
    return (
      <PageShell showBackground={false}>
        <LoadingState message="Restoring session…" />
      </PageShell>
    );
  }

  if (!auth?.access) {
    return <LoginPanel onLogin={handleLogin} busy={loggingIn} errorMessage={err} />;
  }

  return (
    <PageShell showBackground={false}>
      {auth.role === "ADMIN" ? (
        <AdminDashboard auth={auth} onSignOut={handleSignOut} />
      ) : (
        <ResponderDashboard auth={auth} onSignOut={handleSignOut} />
      )}
    </PageShell>
  );
}
