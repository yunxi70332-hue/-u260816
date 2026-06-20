const SUPPORTED_WAIT_STATES = new Set(["domcontentloaded", "load", "networkidle"]);

export function getCdpWaitOptionsFromEnv(env = process.env) {
  return {
    state: normalizeWaitState(env.USM_WAIT_UNTIL ?? "networkidle"),
    networkIdleMs: readPositiveInteger(env.USM_NETWORK_IDLE_MS, 500, "USM_NETWORK_IDLE_MS"),
    timeoutMs: readPositiveInteger(env.USM_WAIT_TIMEOUT_MS, 30000, "USM_WAIT_TIMEOUT_MS")
  };
}

export async function prepareCdpWaitTracking(cdp) {
  await cdp.send("Page.enable");
  const tracker = getNetworkTracker(cdp);
  if (!tracker.enabled) {
    cdp.on("Network.requestWillBeSent", (event) => {
      if (shouldIgnoreRequest(event)) return;
      tracker.inflight.set(event.requestId, {
        method: event.request?.method ?? "GET",
        type: event.type ?? "unknown",
        url: event.request?.url ?? "",
        startedAt: Date.now()
      });
      notifyTracker(tracker);
    });
    cdp.on("Network.loadingFinished", (event) => {
      tracker.inflight.delete(event.requestId);
      notifyTracker(tracker);
    });
    cdp.on("Network.loadingFailed", (event) => {
      tracker.inflight.delete(event.requestId);
      notifyTracker(tracker);
    });
    await cdp.send("Network.enable");
    tracker.enabled = true;
  }
  return tracker;
}

export async function waitForCdpLoadState(cdp, options = {}) {
  const state = normalizeWaitState(options.state ?? "networkidle");
  const timeoutMs = readPositiveInteger(options.timeoutMs, 30000, "timeoutMs");
  const networkIdleMs = readPositiveInteger(options.networkIdleMs, 500, "networkIdleMs");

  await prepareCdpWaitTracking(cdp);

  if (state === "domcontentloaded" || state === "load") {
    await waitForDocumentState(cdp, state, timeoutMs);
    return;
  }

  await waitForDocumentState(cdp, "domcontentloaded", timeoutMs);
  await waitForNetworkIdle(cdp, { networkIdleMs, timeoutMs });
}

async function waitForDocumentState(cdp, state, timeoutMs) {
  const readyState = await cdp.evaluate("document.readyState");
  if (isReadyForState(readyState, state)) return;

  await waitForCdpEvent(cdp, {
    methods: state === "domcontentloaded"
      ? ["Page.domContentEventFired", "Page.loadEventFired"]
      : ["Page.loadEventFired"],
    predicate: () => true,
    timeoutMs,
    timeoutMessage: `Timed out waiting for ${state}`
  });
}

async function waitForNetworkIdle(cdp, { networkIdleMs, timeoutMs }) {
  const tracker = getNetworkTracker(cdp);
  const startedAt = Date.now();

  await new Promise((resolve, reject) => {
    let idleTimer = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      clearTimeout(idleTimer);
      clearTimeout(timeoutTimer);
      tracker.listeners.delete(checkIdle);
    };

    const checkIdle = () => {
      if (finished) return;
      if (tracker.inflight.size === 0) {
        if (idleTimer == null) {
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, networkIdleMs);
        }
        return;
      }

      clearTimeout(idleTimer);
      idleTimer = null;
    };

    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error(formatNetworkIdleTimeout(tracker, startedAt, networkIdleMs, timeoutMs)));
    }, timeoutMs);

    tracker.listeners.add(checkIdle);
    checkIdle();
  });
}

function waitForCdpEvent(cdp, { methods, predicate, timeoutMs, timeoutMessage }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const methodSet = new Set(methods);
    const timeout = setTimeout(() => {
      finished = true;
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    const handler = (event) => {
      if (finished || !predicate(event)) return;
      finished = true;
      clearTimeout(timeout);
      resolve(event);
    };

    for (const method of methodSet) {
      cdp.on(method, handler);
    }
  });
}

function getNetworkTracker(cdp) {
  if (!cdp.__networkIdleTracker) {
    cdp.__networkIdleTracker = {
      enabled: false,
      inflight: new Map(),
      listeners: new Set()
    };
  }
  return cdp.__networkIdleTracker;
}

function notifyTracker(tracker) {
  for (const listener of tracker.listeners) {
    listener();
  }
}

function shouldIgnoreRequest(event) {
  const url = event.request?.url ?? "";
  const type = event.type ?? "";
  return url.startsWith("data:")
    || url.startsWith("blob:")
    || url.startsWith("about:")
    || url.startsWith("chrome:")
    || type === "WebSocket";
}

function isReadyForState(readyState, state) {
  return readyState === "complete" || (state === "domcontentloaded" && readyState === "interactive");
}

function formatNetworkIdleTimeout(tracker, startedAt, networkIdleMs, timeoutMs) {
  const pending = Array.from(tracker.inflight.values())
    .sort((left, right) => left.startedAt - right.startedAt)
    .slice(0, 12)
    .map((request) => {
      const ageMs = Date.now() - request.startedAt;
      return `${request.method} ${request.url} (${request.type}, ${ageMs}ms)`;
    });

  const suffix = pending.length > 0
    ? `\nPending requests:\n${pending.join("\n")}`
    : "\nNo pending requests were recorded when the timeout fired.";

  return `Timed out waiting for networkidle after ${timeoutMs}ms; expected 0 requests for ${networkIdleMs}ms. Elapsed ${Date.now() - startedAt}ms.${suffix}`;
}

function normalizeWaitState(value) {
  const state = String(value).trim().toLowerCase();
  if (SUPPORTED_WAIT_STATES.has(state)) return state;
  throw new Error(`Unsupported wait state: ${value}. Expected one of: ${Array.from(SUPPORTED_WAIT_STATES).join(", ")}`);
}

function readPositiveInteger(value, fallback, name) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (Number.isInteger(number) && number > 0) return number;
  throw new Error(`${name} must be a positive integer, got: ${value}`);
}
