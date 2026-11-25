# Honi Poke Stock Spot Check (PWA)
Upload this folder to a GitHub repo and enable GitHub Pages (Settings > Pages > main / root).
- Managers open `index.html` (add to home screen). Admin: `admin.html` (PIN, first use creates it).
- Shops/categories live in `config.json` (admin "Publish" writes it; phones read it on open).
- App code changes: edit files, then change `CACHE_NAME` in `sw.js` (e.g. spot-check-v2) and `BUILD` in `common.js`
  so phones show "A new version is available - Update now". Saved spot checks (IndexedDB) are never touched by updates.
