import { useState } from "react";
import "./DashboardLayout.css";

function NavIcon({ name }) {
  const icons = {
    grid: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 20c0-3.3 2.7-6 6-6M16 8a3 3 0 100-6M21 20c0-3-2.2-5.5-5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    alert: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3L3 20h18L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 19V5M4 19h16M8 16V11M12 16V8M16 16v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    clock: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    settings: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    inbox: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 10l8 4 8-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
    flag: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 21V5M5 5h12l-2 4 2 4H5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
    map: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    pulse: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12h3l2-5 4 10 2-5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  };
  return <span className="dash-nav__icon">{icons[name] || icons.grid}</span>;
}

export default function DashboardLayout({
  config,
  username,
  role,
  activeView,
  onViewChange,
  onSignOut,
  children,
}) {
  const [navOpen, setNavOpen] = useState(false);

  function handleViewChange(viewId) {
    onViewChange(viewId);
    setNavOpen(false);
  }

  return (
    <div className={`dash-layout ${config.themeClass}`}>
      <button
        type="button"
        className={`dash-sidebar-backdrop${navOpen ? " dash-sidebar-backdrop--visible" : ""}`}
        aria-label="Close navigation"
        onClick={() => setNavOpen(false)}
        tabIndex={navOpen ? 0 : -1}
      />

      <aside className={`dash-sidebar${navOpen ? " dash-sidebar--open" : ""}`}>
        <div className="dash-sidebar__brand">
          <strong>RescueLink</strong>
          <span>{config.headerSubtitle}</span>
        </div>
        <nav className="dash-nav" aria-label="Dashboard navigation">
          {config.nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dash-nav__item${activeView === item.id ? " dash-nav__item--active" : ""}`}
              onClick={() => handleViewChange(item.id)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="dash-sidebar__footer">
          <p>
            Signed in as <strong>{username}</strong>
          </p>
          <p className="dash-sidebar__role">{role}</p>
          <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <div className="dash-header__lead">
            <button
              type="button"
              className="dash-nav-toggle"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <p className="dash-header__eyebrow">Multi-Agency Emergency Coordination</p>
              <h1 className="dash-header__title">{config.headerSubtitle}</h1>
              <p className="dash-header__tagline">{config.tagline}</p>
            </div>
          </div>
          <div className="dash-header__status">
            <span className="live-dot" aria-hidden="true" />
            Live monitoring · manual response only
          </div>
        </header>
        <div className="dash-content">{children}</div>
        <footer className="dash-footer">
          <p>
            {config.footerLabel} · All units view incoming reports · No automatic dispatch
          </p>
        </footer>
      </div>
    </div>
  );
}
