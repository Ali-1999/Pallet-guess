# LG Pallet Load Planner

A browser-based pallet planner for LG Saudi Arabia products. Choose a pallet, enter a model and carton quantity, and generate a load layout and pallet breakdown.

Live application: https://lg-pallet-load-planner.gregorybundy66415.chatgpt.site

## Run locally

No build step or dependencies are required. Serve the `dist` directory using a static HTTP server:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Opening `index.html` directly from disk will not load the JSON catalogue reliably.

## Features

- Standard pallet: 1200 × 1000 mm; Euro pallet: 1200 × 800 mm; custom footprint supported.
- Exact-model lookup, quantity input, catalogue search, and editable shipping data.
- Upright carton placement, with 90-degree rotation of the footprint and no overhang.
- Height and gross-weight limits include pallet height and tare weight.
- Single-layer default; additional layers require confirmation of the manufacturer-approved limit.
- Pallet counts, partial pallets, top-view visualization, and weight breakdown.
- Save plans in browser storage, export JSON, and print to PDF.

## Catalogue coverage

The saved catalogue contains **856 model-like listings** discovered in selected categories of the [LG Saudi Arabia sitemap](https://www.lg.com/sa_en/sitemap.xml), checked on 12 November 2026. **9 models** have packaged dimensions and gross weight verified from LG product pages; each record links to its source.

Bulk product-page fetching was blocked by LG with HTTP 403 responses. Remaining listings and their availability are unverified and may include discontinued models. This is a **partial catalogue**, not a complete LG product database. Planning is blocked until a model has carton dimensions and gross weight. The application does not automatically refresh the catalogue.

The bundled catalogue is deployed with the app. User edits, additional models, and saved plans are stored only in the current browser; there is no server database or cross-device synchronization. Export backups before clearing browser data.

## Planning method

`dist/planner.js` enumerates upright strip layouts using both footprint orientations and selects the feasible pattern with the most cartons. It then applies the height, layer, and gross-weight limits. It plans one model per pallet and does not guarantee a globally optimal packing solution.

Verify the carton specifications, pallet rating, stacking strength, load support, and restraint requirements before loading. The tool does not calculate center of gravity, axle loads, transport securement, or mixed-model pallets.

## Files

- `dist/index.html`: application interface.
- `dist/style.css`: responsive styling.
- `dist/app.js`: catalogue management, rendering, and browser persistence.
- `dist/planner.js`: layout and capacity calculations.
- `dist/products.json`: sourced model listings and available shipping specifications.
- `dist/import-report.json`: catalogue coverage and limitations.

JavaScript syntax and calculation checks were run for carton fit, non-overlap, quantity conservation, partial pallets, and height/weight constraints. Visual browser testing was unavailable in the build environment.

Independent tool; not affiliated with LG.
