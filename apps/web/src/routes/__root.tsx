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
  }),
  component: RootComponent,
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
        </aside>
        <main className="main-surface">
          <Outlet />
        </main>
      </div>
    </RootDocument>
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
