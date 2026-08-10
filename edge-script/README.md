# Upload Edge Script

`upload-server.js` runs on **Bunny Edge Scripting**, not on Vercel. It is the
upload/delete proxy the app talks to via `NEXT_PUBLIC_UPLOAD_SERVER_URL`.

It is kept in this repo for version control only — editing it here does not
deploy it. Paste it into the Bunny dashboard to update the running script.

## Why it exists

Writing to Bunny Storage requires an AccessKey. That key must never reach the
browser, so the browser POSTs bytes to this script and the script forwards them
to storage with the key attached.

## Setup

1. **Edge Script environment variables** (Bunny dashboard → your Edge Script →
   Environment Variables):

   | Variable | Value |
   |---|---|
   | `BUNNY_STORAGE_ZONE` | Storage zone name (not the pull zone) |
   | `BUNNY_STORAGE_KEY` | Storage zone password — FTP & API Access → Password |
   | `BUNNY_STORAGE_HOST` | Region host, e.g. `syd.storage.bunnycdn.com` |
   | `BUNNY_CDN_URL` | Public pull zone URL, e.g. `https://dxtr-staging.b-cdn.net` |

   `BUNNY_STORAGE_HOST` must match the region the storage zone was created in.
   The wrong region returns 401, which looks like a bad key. The pull zone
   reports `cdn-storageserver: SYD-690`, so Sydney (`syd.`) is expected here.

2. **Enable CORS on the pull zone.** Downloads fetch chunks from the CDN
   directly, not through this script, so the script's own CORS headers do not
   cover them. Without this the browser blocks every chunk read.
   Purge the pull zone cache afterwards — responses cached without the header
   keep serving without it.

3. **Vercel** needs `NEXT_PUBLIC_UPLOAD_SERVER_URL` (this script's URL) and
   `NEXT_PUBLIC_BUNNY_CDN_URL` (the pull zone URL).

## Routes

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/upload` | `X-File-Name` header, body = file | `{success, url, path}` |
| POST | `/upload-chunk` | `X-File-Name`, `X-Chunk-Index`, body = chunk | `{success, url, path, chunkIndex}` |
| DELETE | `/delete` | `{"filePath": "..."}` | `{success, path}` |

`X-File-Name` is URI-encoded by the client and decoded here.

Chunks are stored as `<path>.chunk<N>`, which is the layout
`downloadChunkedFile` in `src/lib/supabase.js` expects. **Changing the naming
here requires changing it there too.** Nothing on the server ever combines
chunks — that happens in the browser, which is the point of the design.

## Verifying a deploy

```sh
# Should return 404 with a JSON body, not {"status":"ok"}
curl -X POST https://<edge-script-url>/does-not-exist

# Should return the CORS preflight headers
curl -i -X OPTIONS https://<edge-script-url>/upload-chunk
```

If any route returns `{"status":"ok"}`, the old stub script is still deployed.

## Unverified details

These were written without access to the Bunny dashboard and are worth
confirming on first deploy:

- **`Bunny.env.get()`** is the documented way to read Edge Script environment
  variables. If it throws, check the current Edge Scripting docs — the
  alternative is inlining the config, but never inline `BUNNY_STORAGE_KEY` in a
  repo.
- **SDK version** is pinned to `@bunny.net/edgescript-sdk@0.11.2`. Bump if the
  dashboard template uses a newer one.
- **`duplex: "half"`** is required to stream a request body through `fetch`. If
  the runtime rejects it, buffer with `await request.arrayBuffer()` instead —
  simpler, but uses memory proportional to chunk size (50MB).
