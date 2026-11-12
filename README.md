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
- Upright carton placement, with 90-degree rotation, a configurable standard/width overhang of up to 100 mm (10 cm), and a long-unit length extension, enabled by default.
- Height and gross-weight limits include pallet height and tare weight.
- Single-layer default; additional layers require confirmation of the manufacturer-approved limit.
- Pallet counts, partial pallets, top-view visualization, and weight breakdown.
- Save plans in browser storage, export JSON, and print to PDF.

## Catalogue coverage

The catalogue contains **1,191 Saudi model and reference entries**, expanded from 856 listings by researching **3,591 distinct pages** from official LG market websites and selected reviewed retailer/manual sources on 12 November 2026.

- **335** additional identifiers were discovered, including models with hyphenated codes.
- **972** entries have collected published technical specifications.
- **412** entries have regional source references, with full source model codes preserved.
- **391** entries have packaged width, depth, and height.
- **386** entries have both packaged dimensions and gross weight for pallet planning.
- **219** entries still lack collected technical fact tables; unresolved shipping/detail fields are listed in `dist/missing-data.json`.

The indexed markets are Saudi Arabia (English/Arabic), UAE, Levant, Egypt, United Kingdom, Australia and Africa, plus selected exact-model official references from India and South Africa. Reviewed Saudi retailer references are labelled separately. Published manual links are retained for selected models. This research does not claim to cover every LG product ever manufactured or every retailer.

Use **Full details** to inspect all collected technical facts, source markets, exact source model codes, and document links. Use **All dimensions** for the main dimensional specifications. Explicit inches/pounds are converted to millimetres/kilograms for planner inputs; original published values are retained. LG's published `Dimension in Shiping` labels and `*` dimension separators are recognized without estimating carton sizes.

Unpublished or ambiguous values remain blank. Overseas packing data stays reference-only and does not automatically replace Saudi shipping inputs. Product dimensions/net weight are never substituted for carton dimensions/gross weight. Bundles require separate component plans; multiple or conflicting packing measurements require review. Listings may be discontinued and current availability is unverified.

The bundled catalogue is deployed with the app. User edits, additional models, and saved plans are stored only in the current browser; there is no server database or cross-device synchronization. Export backups before clearing browser data.

## Planning method

`dist/planner.js` enumerates upright strip layouts using both footprint orientations and selects the feasible pattern with the most cartons. It then applies the height, layer, and gross-weight limits. It plans one model per pallet and does not guarantee a globally optimal packing solution. Loads are centered on the physical pallet. Optional overhang expands the allowable footprint without changing the pallet dimensions; actual left/right/front/back overhang is reported for each pallet. Cartons with no pallet contact are excluded. Partial base layers are centered separately, while stacked layers retain aligned positions.

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
- `24 WFB0914XM on Standard, 2 per layer, overhang 10 cm`
- `no overhang` (follow-up to an existing chat plan)

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


## Overhang and 2/4-carton arrangements

The planner defaults to a **100 mm (10 cm) standard/width allowance**, with the long-unit length extension described below. Standard remains 1200 × 1000 mm and Euro remains 1200 × 800 mm. Uncheck **Allow carton overhang** to restore a strict pallet footprint, or set a smaller allowance.

Choose Auto, 2, or 4 cartons per layer. Quick selections support 2 cartons in one layer, 4 cartons as 2 per layer × 2 layers, and 4 cartons in one layer. A fixed per-layer request is rejected when the carton sizes cannot fit within the allowance; it is never forced into the drawing. Layer count, total height, gross weight, and manufacturer stacking confirmation are still checked separately. For example, two 890 mm-high dishwasher cartons stacked above a 150 mm pallet need 1930 mm of total height.

The top view shows the actual pallet as a dashed outline and overhanging carton areas in amber. Each pallet's exact overhang and loaded footprint are included in exported plans. Geometric fit does not certify adequate carton support, stacking strength, stability, or restraint. Old saved plans retain their original settings.

Run the additional geometry and arrangement checks with:

```sh
node scripts/build-worker.mjs
node --test tests/*.test.cjs tests/chat-api.test.mjs
```

## Full model research and regional references

The **Full details** action opens searchable technical specifications with a source/market selector. It retains published capacities, controls, connectivity, features, dimensions, weights, exact regional model codes, and official document links where available. Sources reporting different packing values are flagged. Saudi retailer references are explicitly labelled. Overseas measurements remain reference data and do not automatically enter Saudi pallet calculations.

The broader researcher first indexes selected LG market sitemaps, then rechecks known models, discovers additional Saudi product identifiers, and collects matching regional product pages:

```sh
python3 scripts/research-models.py --phase index --work work/research
python3 scripts/research-models.py --phase all --work work/research
```

It resumes from per-phase caches under the ignored work directory. `curl` is the dependency-free transport; when `httpx` is installed, the researcher reuses connections. Concurrency is bounded to eight requests. The scope is the Saudi catalogue and its exact-code regional references, not every LG product ever made. Absence of a published specification remains a gap.

Additional outputs:

- `dist/product-details.json`: collected technical facts, source URLs, markets, full source model codes, and document references.
- `dist/missing-data.json`: unresolved shipping inputs, including bundle entries that require component-level planning.
- `data/reviewed-sources.json`: individually reviewed retailer references; unspecified dimensions are kept as reference facts and never inferred to be carton dimensions.
- `data/reviewed-documents.json`: verified official support pages and manual download links.

Promotional bundles remain reference listings and cannot be planned as one combined carton. Plan each actual component model separately. The model-details assets are gzip-compressed inside the deployed Worker and loaded on demand by the browser, keeping the main planner catalogue separate from the larger fact collection.


## Units longer than the pallet

**Allow unit length greater than pallet length** is enabled for new planner requests. With overhang enabled, it expands the length clearance only as far as needed for one upright carton, rotating the footprint by 90 degrees when appropriate. For example, an 1800 mm carton on a 1200 mm pallet has 300 mm of centered overhang at each length end. The actual pallet length remains 1200 mm; the loaded footprint includes the carton extension.

The standard/width allowance remains limited to 100 mm per side. Long-unit mode does not extend the width limit, waive weight/height/stacking checks, or certify load support and restraint. Uncheck the long-unit option to use the normal allowance on both axes; disabling all overhang also disables long-unit expansion. Existing saved plans keep their original settings. Chat calculations use the same option from the planner form.

## Layer options and total loaded height

The main form exposes **1, 2, 3, 4, or custom maximum layers**, alongside pallet height and the total height limit. Model-specific height choices update as soon as an exact model is selected. Total loaded height is `pallet height + layer count × packaged carton height`; for an 885 mm carton on a 150 mm pallet, the 1–4 layer choices are 1035, 1920, 2805, and 3690 mm.

The preview identifies choices above the current height limit. **Set height limit to selected stack** raises the input only after an explicit click; changing layers alone does not raise a transport limit. Stacking approval remains required for multiple layers. The result distinguishes requested layers, height-limited layers, and actual layers after carton quantity and weight constraints. A side elevation and per-layer carton/height breakdown show the first pallet, while the pallet table reports each pallet's actual height. This breakdown is saved and exported with the plan.
