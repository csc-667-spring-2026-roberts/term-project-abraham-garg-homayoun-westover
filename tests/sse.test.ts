import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSseTestApp, startTestServer } from "./helpers/sseTestApp.js";

async function readUntilBufferIncludes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  buffer: string,
  needle: string,
): Promise<string> {
  let acc = buffer;
  while (!acc.includes(needle)) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error(`Stream ended before finding ${needle}`);
    }
    acc += decoder.decode(value, { stream: true });
  }
  return acc;
}

async function testContentTypeHeader(baseUrl: string): Promise<void> {
  const ac = new AbortController();
  const res = await fetch(`${baseUrl}/api/sse?roomId=global`, {
    signal: ac.signal,
  });

  expect(res.headers.get("content-type")).toContain("text/event-stream");
  ac.abort();
}

async function testConnectedEvent(baseUrl: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/sse?roomId=global`);
  const stream = res.body;
  expect(stream).not.toBeNull();
  if (stream === null) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const text = await readUntilBufferIncludes(reader, decoder, "", "event: connected");
  expect(text).toContain("event: connected");
  expect(text).toContain('"roomId":"global"');

  await reader.cancel();
}

async function testBroadcastSingleSubscriber(baseUrl: string): Promise<void> {
  const room = `test-room-${String(Date.now())}`;
  const path = `/api/sse?roomId=${encodeURIComponent(room)}`;

  const res = await fetch(`${baseUrl}${path}`);
  const stream = res.body;
  expect(stream).not.toBeNull();
  if (stream === null) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let acc = await readUntilBufferIncludes(reader, decoder, "", "event: connected");

  const post = await fetch(`${baseUrl}/api/broadcast-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: room }),
  });
  expect(post.ok).toBe(true);

  acc = await readUntilBufferIncludes(reader, decoder, acc, "event: state-update");
  expect(acc).toContain("Test event from server");

  await reader.cancel();
}

async function testBroadcastMultipleSubscribers(baseUrl: string): Promise<void> {
  const room = `test-room-${String(Date.now())}`;
  const path = `/api/sse?roomId=${encodeURIComponent(room)}`;

  const res1 = await fetch(`${baseUrl}${path}`);
  const res2 = await fetch(`${baseUrl}${path}`);
  const stream1 = res1.body;
  const stream2 = res2.body;
  expect(stream1).not.toBeNull();
  expect(stream2).not.toBeNull();
  if (stream1 === null || stream2 === null) {
    return;
  }

  const dec1 = new TextDecoder();
  const dec2 = new TextDecoder();
  const r1 = stream1.getReader();
  const r2 = stream2.getReader();

  let acc1 = await readUntilBufferIncludes(r1, dec1, "", "event: connected");
  let acc2 = await readUntilBufferIncludes(r2, dec2, "", "event: connected");

  const post = await fetch(`${baseUrl}/api/broadcast-test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: room }),
  });
  expect(post.ok).toBe(true);

  acc1 = await readUntilBufferIncludes(r1, dec1, acc1, "event: state-update");
  acc2 = await readUntilBufferIncludes(r2, dec2, acc2, "event: state-update");

  expect(acc1).toContain("Test event from server");
  expect(acc2).toContain("Test event from server");

  await r1.cancel();
  await r2.cancel();
}

describe("Server-Sent Events", () => {
  const app = createSseTestApp();
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    const started = await startTestServer(app);
    baseUrl = started.baseUrl;
    closeServer = started.close;
  });

  afterEach(async () => {
    if (closeServer) {
      await closeServer();
      closeServer = null;
    }
  });

  it("sets Content-Type to text/event-stream", async () => {
    await testContentTypeHeader(baseUrl);
  });

  it("keeps the connection open and sends an initial connected event", async () => {
    await testConnectedEvent(baseUrl);
  });

  it("broadcasts state-update events to subscribers in the same room", async () => {
    await testBroadcastSingleSubscriber(baseUrl);
  });

  it("delivers broadcasts to multiple clients in the same room", async () => {
    await testBroadcastMultipleSubscribers(baseUrl);
  });
});
