const tcp = require("node:net");

function isListening(port) {
  return new Promise((resolve) => {
    const socket = tcp.connect({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
function abortError(signal) {
  if (signal?.aborted) throw signal.reason || new Error("Request aborted");
}
function transient(error) {
  return /net::|fetch failed|ECONN|ETIMEDOUT|ENET|EHOST|socket|network|terminated/i.test(
    error.message,
  );
}
function manualRoutes(mode, proxyUrl) {
  if (mode === "direct") return [{ id: "direct" }];
  if (mode === "system") return [{ id: "system", system: true }];
  if (mode !== "proxy") throw new Error("Unknown network mode");
  const url = new URL(proxyUrl);
  if (!["http:", "https:", "socks4:", "socks5:"].includes(url.protocol))
    throw new Error("Unsupported proxy protocol");
  return [
    {
      id: "manual-" + url.protocol + "//" + url.host,
      proxyRules: url.protocol + "//" + url.host,
    },
  ];
}
class AdaptiveNetwork {
  constructor(session, notify = () => {}) {
    this.session = session;
    this.notify = notify;
    this.routes = [];
    this.sessions = new Map();
    this.lastDiscovery = 0;
    this.preferred = null;
    this.status = { route: "discovering", switches: 0 };
  }
  async discover() {
    if (this.discovery) return this.discovery;
    if (Date.now() - this.lastDiscovery < 60000 && this.routes.length) return;
    this.discovery = this.findRoutes();
    try {
      await this.discovery;
    } finally {
      this.discovery = null;
    }
  }
  async findRoutes() {
    const routes = [];
    const configured =
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.ALL_PROXY;
    if (configured) {
      try {
        const url = new URL(configured);
        if (["http:", "https:", "socks5:", "socks4:"].includes(url.protocol))
          routes.push({
            id: "env-" + url.protocol + "//" + url.host,
            proxyRules: url.protocol + "//" + url.host,
            credentials: url.username
              ? {
                  username: decodeURIComponent(url.username),
                  password: decodeURIComponent(url.password),
                }
              : undefined,
          });
      } catch {}
    }
    const system = await this.session.defaultSession
      .resolveProxy("https://zenmux.ai")
      .catch(() => "DIRECT");
    if (system !== "DIRECT") routes.push({ id: "system", system: true });
    const ports = [7890, 7897, 10809, 1080];
    const listening = await Promise.all(ports.map(isListening));
    listening.forEach((open, i) => {
      if (open) {
        const proxyRules = `${ports[i] === 1080 ? "socks5" : "http"}://127.0.0.1:${ports[i]}`;
        if (!routes.some((r) => r.proxyRules === proxyRules))
          routes.push({ id: "local-" + ports[i], proxyRules });
      }
    });
    routes.push({ id: "direct" });
    this.routes = routes;
    this.lastDiscovery = Date.now();
  }
  async getSession(route) {
    if (this.sessions.has(route.id)) return this.sessions.get(route.id);
    const session = this.session.fromPartition(
      "wm-network-" + this.sessions.size,
    );
    await session.setProxy(
      route.id === "direct"
        ? { mode: "direct" }
        : route.system
          ? { mode: "system" }
          : {
              mode: "fixed_servers",
              proxyRules: route.proxyRules,
              proxyBypassRules: "localhost;127.0.0.1",
            },
    );
    if (route.credentials)
      session.on("login", (event, _details, authInfo, callback) => {
        if (authInfo.isProxy) {
          event.preventDefault();
          callback(route.credentials.username, route.credentials.password);
        }
      });
    this.sessions.set(route.id, session);
    return session;
  }
  async fetch(input, options = {}) {
    const { wmNetwork = { mode: "auto" }, ...requestOptions } = options;
    const mode = wmNetwork.mode || "auto";
    if (mode === "auto") await this.discover();
    const configuredRoutes =
      mode === "auto" ? this.routes : manualRoutes(mode, wmNetwork.proxyUrl);
    const routes = [...configuredRoutes].sort(
      (a, b) =>
        Number(b.id === this.preferred) - Number(a.id === this.preferred),
    );
    const failures = [];
    for (const route of routes) {
      abortError(options.signal);
      try {
        const session = await this.getSession(route);
        const response = await session.fetch(input, requestOptions);
        // SSE is delivered immediately. Partial model output is never replayed.
        const streamed = response.headers
          .get("content-type")
          ?.includes("text/event-stream");
        let result = response;
        if (!streamed && response.status !== 204) {
          const bytes = await response.arrayBuffer();
          result = new Response(bytes, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
        if ([502, 503, 504].includes(response.status) && routes.length > 1)
          throw new Error("Network gateway " + response.status);
        const changed = this.preferred !== route.id;
        this.preferred = route.id;
        this.status = {
          route: route.id === "direct" ? "direct" : "proxy",
          switches: this.status.switches + (failures.length ? 1 : 0),
        };
        if (changed || failures.length)
          this.notify({ stage: "network", ...this.status });
        return result;
      } catch (error) {
        abortError(options.signal);
        if (!transient(error)) throw error;
        failures.push(
          `${route.id === "direct" ? "direct" : "proxy"}: ${error.message}`,
        );
      }
    }
    this.lastDiscovery = 0;
    throw new Error("Network connection failed. " + failures.join(" | "));
  }
}
module.exports = { AdaptiveNetwork, manualRoutes };
