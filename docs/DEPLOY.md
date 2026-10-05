# Deploying AskData

AskData is a static site: `npm run build` writes everything to `dist/`, and there's no server code and
no secrets. `vercel.json` sets the build and the response headers. Never add an API key as an
environment variable: users bring their own key in the app.

## Vercel

1. In Vercel, **Add New → Project → Import** the GitHub repository.
2. Keep the settings `vercel.json` provides: framework Vite, install `npm ci`, build `npm run build`,
   output `dist`. Node comes from `engines` in `package.json` (24.x). No environment variables.
3. **Deploy.** Every push to `main` deploys to production; every pull request gets a preview URL.
4. Put the production URL in the README (replace the "Live demo" comment at the top) and in the
   repository's About → Website.

## Check the deployment

Replace `$APP` with the production URL and `$WASM` with the name of `duckdb-eh-*.wasm` in `dist/assets`.

```sh
curl -sI "$APP/assets/$WASM" | grep -iE 'content-type|cache-control|content-encoding'
#   content-type: application/wasm
#   cache-control: public, max-age=31536000, immutable
#   content-encoding: br   (or gzip)
curl -sI "$APP/" | grep -iE 'content-security-policy|x-content-type-options|x-frame-options'
#   content-security-policy: frame-ancestors 'none'
#   x-content-type-options: nosniff
#   x-frame-options: DENY
```

Then in the browser:

- [ ] **Try sample data** loads the 1M-row sample; the engine badge says "Engine ready".
- [ ] A suggested question answers with a chart; the SQL tab opens the editor.
- [ ] DevTools → Console shows no Content-Security-Policy errors.
- [ ] DevTools → Network shows only the app's own origin (plus `extensions.duckdb.org` after loading a
      Parquet or JSON file, and `cdn.jsdelivr.net` after running Python).
- [ ] `/#/bench` runs; copy the results with "Copy as Markdown" if you want numbers from real hardware.

## Other hosts

Any static host works if it serves `.wasm` as `application/wasm` and allows files of about 40 MB: the
two DuckDB wasm builds are 34 and 39 MiB. Cloudflare Pages caps files at 25 MiB, so it would need
DuckDB loaded from a CDN instead. Copy the headers from `vercel.json`: the page's own
Content-Security-Policy is a `<meta>` tag in `index.html`, which can't set `frame-ancestors`, so that
one has to be a response header.
