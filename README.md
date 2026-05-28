# Whatnot Purchase Price Lookup

Static GitHub Pages app for cleaning and documenting Whatnot purchase CSVs.

## Features

- Import a Whatnot purchase CSV directly in the browser.
- Auto-flag generic sale-format titles such as:
  - `BUUUUYING CHOICE!`
  - `Item in hand, KNIVES! $1 STARTS!`
  - `SMOKING ACCESSORIES / $1 STARTS`
  - `shown on screen`, `as seen on screen`, `blind box`, `random`, and `miscellaneous` listings.
- Auto-pass descriptive titles such as named patches, QSP/Kizer knife titles, Zippo matches, holsters, keys, wallets, bags, and shoe-size listings.
- Dashboard with category grouping for Knives, Clothes, Fragrances, Accessories, and Other.
- Review queue to correct uncertain titles and set category.
- Searchable/sortable lookup table.
- Saves corrections in browser localStorage.
- Export cleaned CSV with `clean_title`, `lookup_category`, `needs_review`, `review_reason`, and `correction_notes`.
- Backup/restore corrections as JSON.

## GitHub Pages Hosting

Upload these files to a GitHub repository and enable Pages from the repo settings.

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

No build step is required.
