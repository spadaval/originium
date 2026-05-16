/// <reference types="vite/client" />

import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles.css";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/workspace", label: "Workspace" },
  { to: "/sources", label: "Sources" },
] as const;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content: "Originium Graph Wiki workspace shell.",
      },
      { title: "Originium" },
    ],
    links: [{ rel: "icon", href: "data:," }],
  }),
  component: RootComponent,
  pendingComponent: ShellPending,
  errorComponent: ShellError,
});

function RootComponent() {
  return (
    <RootDocument>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Primary navigation">
          <Link to="/" className="brand" aria-label="Originium overview">
            <span className="brand-mark" aria-hidden="true">
              O
            </span>
            <span>
              <strong>Originium</strong>
              <small>Graph Wiki</small>
            </span>
          </Link>
          <nav className="nav-list">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="nav-link"
                activeProps={{ className: "nav-link active" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-status">
            <span className="state-dot idle" aria-hidden="true" />
            <span>Web shell</span>
          </div>
        </aside>
        <main className="main-surface">
          <Outlet />
        </main>
      </div>
    </RootDocument>
  );
}

function ShellPending() {
  return (
    <div className="state-panel" role="status" aria-live="polite">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-block" />
    </div>
  );
}

function ShellError() {
  return (
    <div className="state-panel error-state" role="alert">
      <strong>Route failed to render</strong>
      <p>Reload the route. If it fails again, check the Vite server log for the concrete route error.</p>
    </div>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
