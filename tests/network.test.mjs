import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { AdaptiveNetwork } = createRequire(import.meta.url)(
  "../electron/network.cjs",
);
function fixture(fetches) {
  let index = 0;
  const session = {
    fromPartition() {
      return { setProxy: async () => {}, fetch: fetches[index++], on() {} };
    },
  };
  const network = new AdaptiveNetwork(session);
  network.discover = async () => {};
  network.routes = [
    { id: "proxy", proxyRules: "http://127.0.0.1:7890" },
    { id: "direct" },
  ];
  return network;
}
test("network falls back to direct and remembers successful route", async () => {
  let proxyCalls = 0,
    directCalls = 0;
  const n = fixture([
    async () => {
      proxyCalls++;
      throw new Error("net::ERR_PROXY_CONNECTION_FAILED");
    },
    async () => {
      directCalls++;
      return new Response('{"ok":true}', {
        headers: { "content-type": "application/json" },
      });
    },
  ]);
  assert.deepEqual(await (await n.fetch("https://example.com")).json(), {
    ok: true,
  });
  await n.fetch("https://example.com");
  assert.equal(proxyCalls, 1);
  assert.equal(directCalls, 2);
  assert.equal(n.status.route, "direct");
});
test("network retries buffered response failures through alternate route", async () => {
  const n = fixture([
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new Error("net::ERR_CONNECTION_CLOSED"));
          },
        }),
      ),
    async () => new Response("complete"),
  ]);
  assert.equal(await (await n.fetch("https://example.com")).text(), "complete");
});
test("partial SSE is not replayed", async () => {
  let fallback = false;
  const n = fixture([
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode("data: partial\n"));
            c.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    async () => {
      fallback = true;
      return new Response("duplicate");
    },
  ]);
  await (await n.fetch("https://example.com")).text();
  assert.equal(fallback, false);
});
test("user cancellation never triggers a new route", async () => {
  const controller = new AbortController();
  const n = fixture([
    async () => {
      controller.abort();
      throw new Error("net::ERR_ABORTED");
    },
    async () => new Response("wrong"),
  ]);
  await assert.rejects(
    n.fetch("https://example.com", { signal: controller.signal }),
  );
  assert.equal(n.sessions.size, 1);
});
test("manual direct never falls back to an available proxy", async () => {
  const n = fixture([
    async () => {
      throw new Error("net::ERR_CONNECTION_FAILED");
    },
  ]);
  await assert.rejects(
    n.fetch("https://example.com", { wmNetwork: { mode: "direct" } }),
    /Network connection failed/,
  );
  assert.equal(n.sessions.size, 1);
  assert.ok(n.sessions.has("direct"));
});
test("manual proxy accepts supported schemes and uses only the configured route", async () => {
  const { manualRoutes } = createRequire(import.meta.url)(
    "../electron/network.cjs",
  );
  for (const protocol of ["http", "https", "socks4", "socks5"])
    assert.equal(
      manualRoutes("proxy", `${protocol}://127.0.0.1:7890`)[0].proxyRules,
      `${protocol}://127.0.0.1:7890`,
    );
  assert.throws(() => manualRoutes("proxy", "file:///tmp/test"));
  const n = fixture([async () => new Response("proxy ok")]);
  const response = await n.fetch("https://example.com", {
    wmNetwork: { mode: "proxy", proxyUrl: "http://127.0.0.1:7890" },
  });
  assert.equal(await response.text(), "proxy ok");
  assert.equal(n.sessions.size, 1);
});
