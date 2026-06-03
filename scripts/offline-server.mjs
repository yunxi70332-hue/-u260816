import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const host = "127.0.0.1";
const startPort = 4173;
const endPort = 4190;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"]
]);

if (!existsSync(path.join(distDir, "index.html"))) {
  console.error("Offline build was not found. Run npm run build first.");
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safePath);

  if (requestedPath === "/" || requestedPath.endsWith("/")) {
    filePath = path.join(distDir, "index.html");
  }

  if (!filePath.startsWith(distDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
});

const port = await listenOnAvailablePort(server);
const url = `http://${host}:${port}/`;

console.log("");
console.log(`USM local builder is running at ${url}`);
console.log("Keep this window open while using it. Press Ctrl+C to stop.");
console.log("");

openBrowser(url);

function listenOnAvailablePort(httpServer) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    function tryListen() {
      httpServer.once("error", (error) => {
        if (error.code === "EADDRINUSE" && port < endPort) {
          port += 1;
          tryListen();
          return;
        }
        reject(error);
      });

      httpServer.once("listening", () => resolve(port));
      httpServer.listen(port, host);
    }

    tryListen();
  });
}

function openBrowser(urlToOpen) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", urlToOpen], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [urlToOpen], { detached: true, stdio: "ignore" }).unref();
}
