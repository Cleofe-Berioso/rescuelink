import { useState } from "react";
import { getLoginInfoCard } from "../utils/roles";
import CommandCenterBackground from "./CommandCenterBackground";
import "./LoginPanel.css";

const ROLE_OPTIONS = [
  {
    id: "ADMIN",
    label: "Admin",
    placeholder: "",
    accent: "warm",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M18 10l2-1.5M6 10L4 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "DRRM",
    label: "DRRM",
    placeholder: "",
    accent: "warm",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "BFP",
    label: "BFP",
    placeholder: " bfp",
    accent: "cool",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4c-2 3-4 5-4 8a4 4 0 008 0c0-3-2-5-4-8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 18h6M8 21h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "POLICE",
    label: "Police",
    placeholder: "",
    accent: "cool",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M12 8v5M12 13l2 2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function RescueLinkBrand() {
  return (
    <header className="command-login__brand">
      <div className="command-login__logo">
        <img
          src="/icon.png"
          alt="RescueLink Logo"
          className="command-login__logo-img"
        />
      </div>
      <div className="command-login__brand-text">
        <h1 className="command-login__title">
          Rescue<span className="command-login__title-accent">Link</span>
        </h1>
        <p className="command-login__subtitle">Emergency Response Dashboard</p>
      </div>
    </header>
  );
}

export default function LoginPanel({ onLogin, busy, errorMessage }) {
  const [selectedRole, setSelectedRole] = useState("DRRM");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const activeRole = ROLE_OPTIONS.find((role) => role.id === selectedRole) || ROLE_OPTIONS[1];
  const infoCard = getLoginInfoCard(selectedRole);

  function submit(e) {
    e.preventDefault();
    e.stopPropagation();
    onLogin(username, password, staySignedIn);
  }

  return (
    <div className="command-login">
      <CommandCenterBackground />

      <div className="command-login__content">
        <RescueLinkBrand />

        <div className="command-login__stage">
          <section className="command-login__panel" aria-labelledby="login-form-title">
            <div className="command-login__roles" role="tablist" aria-label="Staff role">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === role.id}
                  className={`command-login__role command-login__role--${role.accent}${selectedRole === role.id ? " command-login__role--active" : ""
                    }`}
                  onClick={() => setSelectedRole(role.id)}
                >
                  <span className="command-login__role-icon">{role.icon}</span>
                  <span className="command-login__role-label">{role.label}</span>
                </button>
              ))}
            </div>

            <form
              className="command-login__form"
              onSubmit={submit}
              action="#"
              method="post"
              noValidate
            >
              <h2 id="login-form-title" className="command-login__panel-title">
                RescueLink Command Center
              </h2>

              {errorMessage ? (
                <div className="command-login__error" role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <label className={`command-login__field command-login__field--floating ${username || focusedField === "username" ? "is-floating" : ""} ${focusedField === "username" ? "is-focused" : ""}`}>
                <span className="command-login__input-wrap">
                  <span className="command-login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder=""
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="username"
                    required
                  />
                  <span className="command-login__floating-label">Username</span>
                </span>
              </label>

              <label className={`command-login__field command-login__field--floating ${password || focusedField === "password" ? "is-floating" : ""} ${focusedField === "password" ? "is-focused" : ""}`}>
                <span className="command-login__input-wrap">
                  <span className="command-login__input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <path
                        d="M8 11V8a4 4 0 118 0v3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=""
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="current-password"
                    required
                  />
                  <span className="command-login__floating-label">Password</span>
                  <button
                    type="button"
                    className="command-login__toggle-password"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 3l18 18M10.6 10.6A2 2 0 0012 15a2 2 0 001.4-.6M6.7 6.7C4.6 8.1 3.2 10 2.5 12c1.5 3.5 5 6 9.5 6 1.6 0 3.1-.4 4.4-1M17.3 17.3c2.1-1.4 3.5-3.3 4.2-5.3-1.5-3.5-5-6-9.5-6-1.1 0-2.2.2-3.2.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M2.5 12C4 8.5 7.5 6 12 6s8 3.5 9.5 7c-1.5 3.5-5 6-9.5 6S4 15.5 2.5 12z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
                      </svg>
                    )}
                  </button>
                </span>
              </label>

              <label className="command-login__stay-signed-in">
                <input
                  type="checkbox"
                  checked={staySignedIn}
                  onChange={(e) => setStaySignedIn(e.target.checked)}
                  disabled={busy}
                />
                <span>Stay signed in</span>
              </label>

              <button type="submit" className="command-login__submit" disabled={busy}>
                <span className="command-login__submit-glow" aria-hidden="true" />
                {busy ? "Signing in…" : "Sign In to Dashboard"}
              </button>
            </form>
          </section>

          <aside className="command-login__info">
            <h3>{infoCard.title}</h3>
            <p>{infoCard.description}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
