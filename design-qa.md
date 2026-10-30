# Chart builder feedback QA — 2026-10-30

final result: passed

Scope: the owner's six chart-control/source/Fields corrections and the additional
missing Fields preview report. This is a local verification result, not a release
or a claim that every prototype-only backend feature exists.

## Evidence and normalization

Source visual truth, all inspected as pixels:

- `../output/feedback-reference/1.png` — native chart type menu before correction.
- `../output/feedback-reference/2.png` — Source controls/cards before correction.
- `../output/feedback-reference/3.png` — plain Fields controls before correction.
- `../output/feedback-reference/4.png` — native field selection before correction.
- `../output/feedback-fields/1.png` — latest reference Fields with toolbar and tray.
- `../output/feedback-fields/2.png` — production Fields with preview hidden.
- `../output/prototype-reference/visualization.png` — supplied original visualization target.

Implementation: `http://127.0.0.1:7784/qa/dashboard-lab.html`, real application
components with a development-only Axios fixture; no production data writes.

Desktop captures: 1440×900 CSS and image pixels. The final Fields comparison uses
1440×720 CSS and image pixels. Mobile: 390×844 CSS and image pixels. Effective
capture density is 1 image pixel per CSS pixel. The latest Fields target is
2048×1024 pixels, with browser chrome absent. Its modal crop (2018×1006) was
normalized to 1412×704; implementation modal crop is 1412×692. Content, locale,
column types and saved/new-chart state differ deliberately: real synthetic permitted
fields and existing draft/save behavior replace demo deals and parameter count 3.
No measurement claims are inferred from browser chrome or unknown source density.

Full paired evidence: `../output/feedback-after/fields-paired-comparison-final.png`.
Focused controls: `../output/feedback-after/fields-controls-comparison-final.png`.
Both pairs were opened and inspected together, not inferred from separate paths.

Other inspected implementation captures:

- `source-desktop.png`, `source-mobile.png`, `source-refresh-menu.png`
- `fields-desktop-final.png`, `fields-mobile-final.png`, `aggregation-mobile.png`
- `chart-types-desktop-final.png`, `field-options-desktop-final.png`
- `visualization-desktop-final.png`, `visualization-mobile-menu.png`

All are under `../output/feedback-after/`.

## Findings and iterations

1. [P1, fixed] Native selectors had no chart/field visual cues. Replaced native
   controls with the project's Dropdown/Popover and rounded Tabs, including formula
   editor selectors. Chart trigger and all 23 options now have Lucide type icons;
   source, field and aggregation menus preserve their existing values and contracts.
2. [P1, fixed] Source list lacked module tags/accordion groups and technical-key
   search. Membership now uses permission-filtered menu metadata (ID or slug), with
   General fallback. Label/key matching is case-insensitive; search reads additional
   catalog pages when needed. Search reveal/collapse state is separate from normal
   group collapse preference. Hidden table permissions remain enforced.
3. [P1, fixed] Fields preview was initialized closed (`rowsPreview=false`), had no
   row limit and was below a separate Fields toolbar. It now opens by default in a
   docked tray with independent scrolling, close/reopen, default 10 and clamp 1..1000.
   The existing role/schema/object-list path supplies actual results. Source and limit
   changes remount the preview; loading/error states hide stale rows. Refresh fields
   calls existing schema/layout refetches and preserves draft presentation metadata.
4. [P2, fixed after first comparison] Visibility was at the far edge, aggregation
   and description columns were too far right, and rows were too loose. The final
   grid follows number/name/source/visibility/type/aggregation/description, with
   source-qualified keys, eye controls, existing type icons and green/blue pills.
   Column tracks, density and tray height were corrected and recaptured.
5. [P2, fixed after browser inspection] Reusing full miniature charts in compact
   options made the numeric thumbnail overflow and overlap the settings trigger.
   Compact options now use properly sized library icons; trigger and Configure
   controls have separate space. Full renderer thumbnails remain available to the
   existing expanded visualization picker.
6. [P2, fixed after mobile inspection] The source breadcrumb forced Close onto a
   separate header row at 390px. It is omitted at this narrow breakpoint so title,
   expand, apply and close remain usable. Schema/preview scroll independently;
   menus are viewport-clamped with internal scrolling and no page-width overflow.

Before/first-iteration captures remain in `fields-desktop.png`,
`fields-paired-comparison.png`, `fields-controls-comparison.png` and
`fields-mobile.png`. Revised evidence uses `*-final.png` as listed above.

## Required fidelity surfaces

- Typography: existing Omni4 font, compact UI sizes and weights retained, as the
  owner explicitly requested project styling. No new fonts or bitmap text. Longer
  technical keys truncate with full title text. English fixture and Russian source
  are different locales; exact text widths cannot be compared as identical content.
- Spacing/layout: rounded project controls, aligned toolbar, scoped table tracks,
  stable bottom tray, three visualization columns, separated settings action, and
  narrow-screen controls inspected. The remaining small density differences from
  the demo are accepted project-control sizing, not missing controls or overflow.
- Colors/tokens: project surfaces, borders, selected/accent tokens and semantic
  dimension green / measure blue treatments used. Icons, selected fields and
  aggregations expose the same role cues. No native OS menu surfaces remain.
- Assets: real project Lucide icons and existing typed Cell renderer; no invented
  image substitutes, raster UI, decorative assets or copied demo data.
- Copy/content: live module names/table keys and actual field types are preserved;
  unknown membership has a General fallback. Parameter count is real SQL names (0
  for table sources). SQL uses an explicit Run SQL route to its existing runner;
  schema refresh does not silently execute arbitrary SQL. Refresh interval text
  retains the application's existing Russian copy; translation cleanup is P3.

## Functional and accessibility verification

Supported Chrome browser walkthrough, desktop and 390px:

- All 23 visualization options selected successfully; 0 native selects in each state.
- Selected grouping/measure chips and colored menu options; field default Average
  remains after refresh, save and reopen. Advanced SQL and raw chart contracts unchanged.
- Label `PEOPLE` and key `EMPLOYEES` searches; useful no-match message; permission
  filtering; CRM/HRMS/General groups; normal collapse state survives search; search
  groups remain independently collapsible.
- Fields toolbar, name/description search, eye visibility, actual typed result cells.
- Limits 10, 25 and 1000 returned exactly that many fixture rows; 1001 clamped to 1000.
- Preview close/reopen, schema refresh, source switch Events → People (only two names,
  no old event rows), empty response, error response and delayed Loading state.
- Local create → add to draft → Save dashboard → reopen with metadata preserved;
  edit/source-switch → close/cancel restored the saved chart. No production writes.
- Arrow keys/Enter, Home/End, menu scrolling, Escape and focus return. Nested formula
  aggregation Escape closes the inner menu, then the outer form, leaving dialog open.
- Narrow menu bounds were inside 390×844 (aggregation x190..382; chart x27..268).
  Save/close remain visible and there is no dialog/page horizontal overflow.
- Browser error log: no runtime errors at the end of the walkthrough.

Automated final run: 969 passed, 4 pre-existing PostgreSQL integration cases skipped
because `OMNI4_SQL_UI_PG_SOCKET` is unset. Typecheck, full lint and production build
passed. New tests cover metadata-based grouping/search/permissions, preview limit,
real response rendering, restricted fields, loading/error stale-row suppression,
empty and hidden fields. Existing drag/query/save contracts remain under regression.

## Remaining limits and release step

- No authenticated production tab was available in connected Chrome. Local fixture
  checks do not establish signed-in production E2E or actual SQL execution.
- This patch does not add backend cache TTL or server-calculated-field contracts.
- Library screenshot upload failed before preparation: `Library prepare_uploads is
  not available`. No Library file IDs were created. Inspected screenshots are local.
- No push, PR, merge or deployment for this feedback patch. The branch is based on
  verified production/main e7b2089. Release requires the owner's deployment direction,
  then the established push/PR/merge/Vercel workflow and read-only live smoke.

Implementation checklist: all requested correction controls present; Fields result
path and states verified; paired comparisons inspected after fixes; responsive and
keyboard walkthrough complete; final automated checks passed; release not performed.
