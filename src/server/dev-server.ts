import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

export const DEV_RELOAD_SCRIPT = `
<script>
(function() {
  var ws;
  function connect() {
    ws = new WebSocket('ws://' + location.host + '/__glyphmark_ws');
    ws.onmessage = function(e) {
      if (e.data === 'reload') location.reload();
    };
    ws.onclose = function() {
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
</script>`;

export function createDevServer(
  rootDir: string,
  port: number,
): { server: http.Server; notifyReload: () => void } {
  const absoluteRoot = path.resolve(rootDir);
  const clients: Set<WebSocket> = new Set();

  const server = http.createServer((req, res) => {
    if (!req.url || req.url === "/__glyphmark_ws") {
      res.writeHead(404);
      res.end();
      return;
    }

    let urlPath = decodeURIComponent(req.url.split("?")[0]!);
    if (urlPath === "/") urlPath = "/index.html";

    const filePath = path.join(absoluteRoot, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(absoluteRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Try the requested file, then try with .html extension
    let resolvedPath = filePath;
    if (!fs.existsSync(resolvedPath)) {
      if (fs.existsSync(resolvedPath + ".html")) {
        resolvedPath = resolvedPath + ".html";
      } else {
        // List available HTML files
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(generateIndex(absoluteRoot));
        return;
      }
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    try {
      const content = fs.readFileSync(resolvedPath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end("Error reading file");
    }
  });

  const wss = new WebSocketServer({ server, path: "/__glyphmark_ws" });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function notifyReload() {
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send("reload");
      }
    }
  }

  return { server, notifyReload };
}

function generateIndex(rootDir: string): string {
  const files = fs
    .readdirSync(rootDir)
    .filter((f) => f.endsWith(".html"))
    .sort();

  const links = files
    .map((f) => `<li><a href="/${f}">${f.replace(".html", "")}</a></li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html><head><title>Glyphmark</title>
<style>
body { font-family: Georgia, serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; background: #f8f4e8; color: #1c1b19; }
h1 { color: #5d0000; }
a { color: #5d0000; }
li { margin: 0.5em 0; }
</style></head>
<body>
<h1>Glyphmark</h1>
<p>${files.length} document${files.length === 1 ? "" : "s"}</p>
<ul>${links}</ul>
${DEV_RELOAD_SCRIPT}
</body></html>`;
}
