# Whatnot Purchase Price Lookup

Static GitHub Pages app for documenting Whatnot purchases from a purchase CSV.

## Features

- Import Whatnot purchase CSV in the browser
- Detect generic/uncertain titles like `Knives #30`, `Item shown on Screen #27`, and `BUUUUYING CHOICE! #150`
- Save corrected product titles in browser localStorage
- Search and sort purchases by clean title, seller, category, date, and price
- Export a cleaned CSV with:
  - `clean_title`
  - `needs_review`
  - `review_reason`
  - `correction_notes`
- Export/import a JSON backup of your corrections

## GitHub Pages hosting

1. Create a GitHub repo.
2. Upload `index.html`, `styles.css`, and `app.js`.
3. Go to **Settings → Pages**.
4. Set source to your main branch root.
5. Open the GitHub Pages URL.

## Privacy

The CSV is processed locally in your browser. No server is used. Corrections are saved in the browser's localStorage unless you export the backup JSON.
