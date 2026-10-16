import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { navLinksFor, ROLE_LABELS } from '../utils/roles.js';

function initials(name = '') {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate('/login', { replace: true });
  };

  const links = navLinksFor(user.role);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            <span>Leave Portal</span>
          </NavLink>

          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            <span className="menu-icon" aria-hidden="true" />
          </button>

          <div id="main-nav" className={`nav-panel ${menuOpen ? 'open' : ''}`}>
            <nav aria-label="Main">
              <ul className="nav-links">
                {links.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} end={link.end}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="user-box">
              <span className="avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <div className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{ROLE_LABELS[user.role]}</span>
              </div>
              <NavLink to="/change-password" className="btn btn-secondary btn-sm">
                Change password
              </NavLink>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="container">
        <Outlet />
      </main>
    </div>
  );
}
