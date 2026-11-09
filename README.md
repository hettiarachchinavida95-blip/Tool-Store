# Hanger Tools — Inventory Manager

A responsive, ready-to-deploy static tool inventory website supporting **500+ records**, with no imposed 500-record limit. Built using plain HTML, CSS and JavaScript; no package installation or build step.

## Features

- Add, edit and delete tool records; deleted records go to **Recently deleted** and can be restored.
- Track Tool ID/SKU, name, category, brand, model, serial number, quantity, reorder minimum, status, location, custodian, purchase date, unit value and notes.
- Search records instantly, filter by category/status, sort, and paginate by 25/50/100 records.
- Statistics: distinct tools, total units, in-use tools and low/no-stock tools.
- Bulk import via **CSV or JSON**. Matching IDs/SKUs update existing records; other records are added. Unmentioned records are preserved.
- Download a CSV for spreadsheets or a JSON backup, including deleted items.
- Responsive design for desktop, tablet and mobile.
- Database uses **IndexedDB** in the current browser, capable of handling thousands of records in common modern browsers.
- Includes optional sample data and a sample CSV template.

## Run locally

Option 1: Open `index.html` in a modern browser. For best cross-browser results, use a local web server:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## Deploy to GitHub Pages

1. Create a GitHub repository (or use your existing `Hanger_Tools` repository after backing up its current site).
2. Upload these files into the repository root: `index.html`, `styles.css`, `app.js`, `favicon.svg`, and `sample-tools.csv`.
3. In **Settings → Pages**, select **Deploy from a branch**, then the `main` branch and `/ (root)` folder.
4. Open the GitHub Pages link provided by GitHub.

There are no absolute paths, so the app works under a GitHub Pages project path like `/Hanger_Tools/`.

## Important: data storage and collaboration

**This version is local-first.** Its IndexedDB records are stored **per browser profile and per website origin**. This is suitable for an individual device. Import/export JSON backups regularly, especially before resetting a device, clearing browser data or moving to another computer. CSV is convenient for reporting and bulk updates; JSON is best for a complete backup.

**GitHub Pages cannot by itself act as a shared inventory database.** If multiple users must see the same 500+ live records or need logins, roles, audit logs and syncing, connect the interface to a hosted database (such as Supabase/Firebase) with authentication and access policies. Do not put database admin credentials into client-side JavaScript.

## Import format

Open `sample-tools.csv` in Excel, edit or paste hundreds of rows, and save it as UTF-8 CSV. The following are supported column headers:

`sku,name,category,brand,model,serial,quantity,minStock,status,location,assignedTo,purchaseDate,unitCost,notes`

- `sku` (Tool ID) and `name` are mandatory.
- `sku` values must be unique; matching IDs are updated on import (case-insensitive).
- `quantity` and `minStock` are nonnegative whole numbers.
- `status` must be `Available`, `In use`, `Maintenance`, or `Retired`.
- `purchaseDate` uses `YYYY-MM-DD` or may be left blank.
- `unitCost` uses numbers without currency symbols.
- Imports accept a file up to 15 MB (and up to 100,000 rows). This is well above a 500-tool inventory. Actual storage limits depend on the browser/device.
- The app supports CSV fields with commas, quotes and newlines.

JSON imports accept an array of tools or an object containing a `tools` array, including backups exported from this site. Existing records not mentioned in the uploaded file are not deleted.

## Troubleshooting

- If tools appear missing on another computer, that device has its own browser storage. Import a JSON backup on the other device.
- If browser storage is blocked, disable private browsing restrictions or try a regular browser window.
- On a shared public computer, don't rely on local browser storage for long-term data.
