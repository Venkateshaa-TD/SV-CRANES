// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const findUniqueMock = vi.fn();
const authMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

// React's cache() requires a request-like render scope in real Next.js,
// but in this standalone Vitest run it just memoizes per call — fine for
// unit-testing the underlying logic once per test via a fresh mock state.
import { getCurrentUser } from "./current-user";

const SESSION = { user: { id: "user-1" } };

beforeEach(() => {
  findUniqueMock.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue(SESSION);
});

describe("getCurrentUser", () => {
  it("returns null when there is no session at all", async () => {
    authMock.mockResolvedValueOnce(null);
    expect(await getCurrentUser()).toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns the live user for a valid, active session", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      companyId: "company-1",
      role: "OPERATOR",
      name: "Ajay Singh",
      email: "operator1@svcranes.dev",
      isActive: true,
      archivedAt: null,
    });
    const user = await getCurrentUser();
    expect(user?.id).toBe("user-1");
    expect(user?.role).toBe("OPERATOR");
  });

  it("treats a deactivated user as signed out even with a valid session token", async () => {
    // The JWT itself is still validly signed — this is exactly the stale
    // session scenario: an admin deactivates the account after the token
    // was issued, and it must stop working on the very next request.
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      companyId: "company-1",
      role: "OPERATOR",
      name: "Ajay Singh",
      email: "operator1@svcranes.dev",
      isActive: false,
      archivedAt: null,
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("treats an archived user as signed out", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "user-1",
      companyId: "company-1",
      role: "OPERATOR",
      name: "Ajay Singh",
      email: "operator1@svcranes.dev",
      isActive: true,
      archivedAt: new Date(),
    });
    expect(await getCurrentUser()).toBeNull();
  });

  it("treats a since-deleted user (no matching row) as signed out", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    expect(await getCurrentUser()).toBeNull();
  });
});
