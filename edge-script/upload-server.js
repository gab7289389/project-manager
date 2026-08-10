// Bunny Edge Script - upload/delete proxy for Bunny Storage.
//
// Deployed to Bunny Edge Scripting, NOT bundled with the Next.js app. The app
// talks to it via NEXT_PUBLIC_UPLOAD_SERVER_URL.
//
// It exists so the browser never sees the storage AccessKey: the browser POSTs
// bytes here, and this script forwards them to Bunny Storage with the key
// attached.
//
// Routes:
//   POST   /upload         X-File-Name            -> stores file, returns {url}
//   POST   /upload-chunk   X-File-Name,           -> stores <name>.chunk<N>,
//                          X-Chunk-Index            returns {url, path}
//   DELETE /delete         {"filePath": "..."}    -> deletes one object

import * as BunnySDK from "https://esm.sh/@bunny.net/edgescript-sdk@0.11.2";

// ---------------------------------------------------------------------------
// Config. Set these as environment variables on the Edge Script in the Bunny
// dashboard. The AccessKey is your storage zone's password - treat it as a
// secret and do not inline it here.
// ---------------------------------------------------------------------------
const STORAGE_ZONE = Bunny.env.get("BUNNY_STORAGE_ZONE");
const STORAGE_KEY = Bunny.env.get("BUNNY_STORAGE_KEY");
// Storage region hostname. Sydney is "syd"; use "storage" for the default
// Falkenhausen region. Must match the region the storage zone was created in.
const STORAGE_HOST = Bunny.env.get("BUNNY_STORAGE_HOST") || "syd.storage.bunnycdn.com";
// Public CDN base for the pull zone in front of that storage zone.
const CDN_BASE = Bunny.env.get("BUNNY_CDN_URL") || "https://dxtr-staging.b-cdn.net";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-File-Name, X-Chunk-Index, X-Total-Chunks, X-Upload-Id",
  "Access-Control-Max-Age": "86400",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

// The client sends the path URI-encoded, so a nested path arrives as one
// header value. Reject anything that could escape the zone root.
function decodePath(raw) {
  if (!raw) throw new Error("Missing X-File-Name header");

  const path = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\")) {
    throw new Error(`Invalid file path: ${path}`);
  }
  return path;
}

function storageUrl(path) {
  // Each segment is encoded separately so that "/" keeps its meaning as a
  // directory separator.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://${STORAGE_HOST}/${STORAGE_ZONE}/${encoded}`;
}

// Stream the request body straight through to storage. Buffering a 50MB chunk
// in the edge runtime would risk the memory limit for no benefit.
async function putObject(path, request) {
  const response = await fetch(storageUrl(path), {
    method: "PUT",
    headers: {
      AccessKey: STORAGE_KEY,
      "Content-Type": "application/octet-stream",
    },
    body: request.body,
    duplex: "half",
  });

  if (!response.ok) {
    throw new Error(`Storage PUT failed: HTTP ${response.status} ${await response.text()}`);
  }
  return `${CDN_BASE}/${path}`;
}

// Accepts either a bare storage path or a full CDN URL, since the app has sent
// both historically.
function toStoragePath(filePath) {
  if (!filePath) throw new Error("Missing filePath");

  let path = filePath;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    path = new URL(path).pathname;
  }
  path = decodeURIComponent(path.split("#")[0].split("?")[0]).replace(/^\/+/, "");

  if (!path || path.includes("..")) throw new Error(`Invalid file path: ${filePath}`);
  return path;
}

BunnySDK.net.http.serve(async (request) => {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!STORAGE_ZONE || !STORAGE_KEY) {
    return json(
      { error: "Server misconfigured: BUNNY_STORAGE_ZONE and BUNNY_STORAGE_KEY must be set" },
      500
    );
  }

  try {
    // Whole file, small enough not to need chunking.
    if (pathname.endsWith("/upload") && request.method === "POST") {
      const path = decodePath(request.headers.get("X-File-Name"));
      const url = await putObject(path, request);
      return json({ success: true, url, path });
    }

    // One chunk of a large file. The client reassembles these in the browser,
    // so nothing here ever combines them.
    if (pathname.endsWith("/upload-chunk") && request.method === "POST") {
      const basePath = decodePath(request.headers.get("X-File-Name"));
      const chunkIndex = parseInt(request.headers.get("X-Chunk-Index"), 10);

      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        return json({ error: "Invalid or missing X-Chunk-Index" }, 400);
      }

      const path = `${basePath}.chunk${chunkIndex}`;
      const url = await putObject(path, request);
      return json({ success: true, url, path, chunkIndex });
    }

    if (pathname.endsWith("/delete") && request.method === "DELETE") {
      const { filePath } = await request.json();
      const path = toStoragePath(filePath);

      const response = await fetch(storageUrl(path), {
        method: "DELETE",
        headers: { AccessKey: STORAGE_KEY },
      });

      // 404 means it is already gone, which satisfies the caller's intent.
      if (!response.ok && response.status !== 404) {
        return json({ error: `Storage DELETE failed: HTTP ${response.status}` }, 502);
      }
      return json({ success: true, path });
    }

    return json({ error: `No route for ${request.method} ${pathname}` }, 404);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
