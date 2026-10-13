import { vi } from "vitest";

export type FakeResponse = { status: number; body?: unknown };
type Handler = (method: string, url: string, body: unknown) => FakeResponse;

// Replaces global fetch with a fake server; returns the mock so tests can inspect calls.
export const stubFetch = (handler: Handler) => {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const { status, body: responseBody } = handler(method, url, body);
    return {
      ok: status < 400,
      status,
      json: async () => responseBody,
    } as Response;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

// Calls made to the API, as "METHOD /path" plus the parsed JSON body.
export const callsTo = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.map(([url, init]) => ({
    request: `${init?.method ?? "GET"} ${url}`,
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  }));
