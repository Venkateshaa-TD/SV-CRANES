import { NextResponse } from "next/server";

/**
 * Served as JSON rather than a static file so it can later read
 * per-environment values if needed. Icons are placeholders — swap in real
 * app icons before shipping the PWA. Keeping this route means installing
 * the app to a home screen requires no navigation redesign later.
 */
export function GET() {
  return NextResponse.json({
    name: "FleetView — Crane & Fleet Operations",
    short_name: "FleetView",
    description: "Crane & Fleet Operations Management System",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171e2e",
    // Placeholder mark only — swap for real designed PNG icons (192/512,
    // plus an apple-touch-icon) before shipping this as an installable PWA.
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  });
}
