// Vitest runs outside Next.js's bundler, which is what normally makes the
// real "server-only" package a no-op (via its "react-server" export
// condition). This stub is aliased in vitest.config.ts so server-side
// modules can still be unit tested directly.
export {};
