// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

const requireCurrentUserMock = vi.fn();
const readFileMock = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: (...args: unknown[]) => requireCurrentUserMock(...args),
}));

vi.mock("@/lib/storage/local-provider", () => {
  class FakeLocalStorageProvider {
    readFile = (...args: unknown[]) => readFileMock(...args);
  }
  return { LocalStorageProvider: FakeLocalStorageProvider };
});

vi.mock("@/lib/storage", async () => {
  const { LocalStorageProvider } = await import("@/lib/storage/local-provider");
  return { getStorageProvider: () => new LocalStorageProvider() };
});

import { GET } from "./route";

beforeEach(() => {
  requireCurrentUserMock.mockReset();
  readFileMock.mockReset();
});

function makeParams(key: string[]) {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/files/[...key]", () => {
  it("blocks an unauthenticated request with 401 and never touches storage", async () => {
    requireCurrentUserMock.mockRejectedValue(new Error("UNAUTHENTICATED"));

    const response = await GET({} as never, makeParams(["expense-receipts", "abc.jpg"]));

    expect(response.status).toBe(401);
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("serves the file for an authenticated user", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "user-1", companyId: "company-1", role: "MANAGER" });
    readFileMock.mockResolvedValue(Buffer.from("fake-image-bytes"));

    const response = await GET({} as never, makeParams(["expense-receipts", "abc.jpg"]));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(readFileMock).toHaveBeenCalledWith("expense-receipts/abc.jpg");
  });

  it("returns 404 rather than a raw filesystem error when the file doesn't exist", async () => {
    requireCurrentUserMock.mockResolvedValue({ id: "user-1", companyId: "company-1", role: "MANAGER" });
    readFileMock.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const response = await GET({} as never, makeParams(["expense-receipts", "missing.jpg"]));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/ENOENT|\/Users\/|C:\\/);
  });
});
