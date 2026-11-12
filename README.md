# LG Pallet Load Planner

A browser-based pallet planner for LG Saudi Arabia products. Choose a pallet, enter a model and carton quantity, and generate a load layout and pallet breakdown.

Live application: https://lg-pallet-load-planner.gregorybundy66415.chatgpt.site

## Run locally

For the planner and guided chat, no build step or dependencies are required. Serve the `dist` directory using a static HTTP server:

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

The saved catalogue contains **856 model-like listings** discovered in selected categories of the [LG Saudi Arabia sitemap](https://www.lg.com/sa_en/sitemap.xml). All 856 linked pages were checked on 12 November 2026, and unavailable/unmatched pages were retried.

- **831** exact-model pages were confirmed.
- **674** models have published dimension or weight specifications saved with their original LG labels.
- **285** models have packaged width, depth, and height.
- **282** models have both packaged dimensions and gross weight for pallet planning.
- **25** pages could not be matched to the requested model or fetched successfully.

Use **All dimensions** in the catalogue to see published product, packaging, stand, and other dimensional specifications where available. Carton width, depth, and height are also shown in separate columns. Explicit imperial measurements are converted to millimetres and kilograms for calculations, while the original values remain visible. Unlabelled LG Saudi TV packaging dimensions and overseas packaging weights follow LG's metric convention; this is noted in the detail view.

Missing carton measurements or gross weights remain blank and block planning. Product dimensions and net weight are never substituted for shipping specifications. Multiple or conflicting carton sizes require review. Listings may include discontinued models and current availability is unverified; this is **not a complete LG product database**. Each record links to its LG source, and `dist/import-report.json` records coverage.

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

## Refresh dimensions from LG

The importer checks each saved model's linked Saudi Arabia page and confirms its model code before extracting specifications. It preserves published dimension and weight labels, converts explicit inches/pounds to mm/kg, and keeps product dimensions separate from packaged dimensions used by the planner. Multiple or conflicting carton specifications require review.

```sh
python3 scripts/enrich-catalogue.py
```

The default cache lives in the ignored `work/catalogue-cache.json`. Re-running resumes from that cache. To recheck pages that failed or did not match the requested model:

```sh
python3 scripts/enrich-catalogue.py --retry-failed
```

To refresh every page, remove the local cache or pass a new `--cache` path. The importer requires `curl`, checks up to three pages concurrently by default, and records coverage in `dist/import-report.json`. Missing specifications are left blank; values from similar models are never substituted.

Run extraction checks with:

```sh
python3 -m unittest discover -s tests -v
```


## Chat assistant

Open **Chat assistant** in the navigation. It can look up dimensions, search models, ask for missing quantity/pallet information, calculate one-model loads, and open or export the resulting plan. Example messages:

- `Plan 24 WFB0914XM on Euro`
- `Dimensions of WFB0914XM`
- `Find washing machines`
- `24 WFB0914XM on custom 140x100 cm`

The assistant has two explicit modes. **Guided mode** works without an AI connection and uses a local command parser. **AI mode** uses OpenAI to interpret natural-language requests into validated actions. Product facts always come from the saved catalogue, and the existing calculator always determines pallet counts. AI output cannot supply replacement carton dimensions, shipping weights, or stacking approvals. Chats are held in memory and reset on page reload; the saved-plan workflow is unchanged.

### AI hosting and activation

The AI endpoint is implemented in `worker/index.mjs`. Build the Worker with its embedded application assets:

```sh
node scripts/build-worker.mjs
```

The generated entry point is `dist/server/index.js` (ignored by Git). Publish it using the existing Sites project as a server-backed deployment. Keep hosted secrets in Sites runtime settings, never source files or browser storage:

- `OPENAI_API_KEY`: required secret for AI mode; provision using the OpenAI Developers plugin workflow required by Sites.
- `OPENAI_MODEL`: optional model ID, default `gpt-4.1-mini`.

Without a configured key, the deployed assistant explicitly shows guided mode. The OpenAI Developers connection and secret provisioning are still required to activate real AI inference; a live provider call has not been verified. No API key is included in this repository. The implementation follows the [Responses API structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs).

`POST /api/chat` requires the Sites-authenticated visitor identity and a same-origin JSON request. It limits message size and history, applies a per-isolate request limit, and returns only validated action fields. The server sets `store: false` on OpenAI requests. In AI mode, user messages, short conversation history, selected request inputs, and a small list of catalogue matches are sent to OpenAI for interpretation. Failures fall back visibly to the guided parser; they are not presented as successful AI responses. `GET /api/chat/status` exposes only the configured mode, never credentials. Private-site access stays controlled by Sites.

Run chat and endpoint checks after building:

```sh
node --test tests/chat.test.cjs tests/chat-api.test.mjs
```

The endpoint tests use mocked AI responses; they verify input validation, authorization, provider failure handling, and secret exclusion, not live model availability. Existing dimension-extraction checks remain available with `python3 -m unittest discover -s tests -v`.
