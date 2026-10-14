# Dashboard builder UI QA

final result: passed

The supplied old CRM modal is a layout reference only. Omni4 retains its own UI tokens,
Lucide icon family and existing chart renderer. No changes were made to Udevs CRM.

## Evidence and normalization

Source visual truth: ../qa-evidence/ui-simplification/references/image(20261014-091601).png
and image(20261014-091112).png (both 2048×1280). Their CSS viewport/density is unknown.
Implementation: ../qa-evidence/ui-simplification/screenshots/modal-donut-light-final.png,
modal-donut-dark-final.png, properties-dark-v2.png, mobile-table-preview-light.png and
mobile-donut-dark.png. Native desktop capture: 1440×722; narrow captures: 390×700 and
360×700. Temporary viewport overrides were reset after testing.

Paired full-view comparison: ../qa-evidence/ui-simplification/comparison-modal.png.
Focused Properties comparison: ../qa-evidence/ui-simplification/comparison-properties.png.
Images were normalized to equal widths for visual inspection; pixel-identical fidelity
or equal source CSS density is not claimed. Reference content and synthetic fixture
content intentionally differ.

## Findings and repairs

- P1: Form and table overlapped at 390 px. Replaced mobile implicit grid tracks with
  a vertical flex flow; controls and preview now scroll sequentially. Rechecked at
  390 and 360 px with persistent Cancel/Apply controls and no dialog horizontal overflow.
- P1: Clicking resize handles did not focus keyboard controls. Pointer-down now focuses
  the handle. Native mouse+arrow retest changed a column 213→229, card width12→11,
  native width drag11→10 and height2→3. Saved card reopened at10×3.
- P2: Miniature footprints/palette/line weight were inconsistent. All use a common
  canvas and blue token palette, with readable strokes and real chart geometry.
- P2: Donut preview was too small. Editor preview now enlarges the native plot;
  dashboard card geometry stays independent.
- P2: Scrolling hid source context. Desktop table/field/calculation stay above the
  scrollable secondary choices; the header retains source/group context on mobile.
- P2: Dark fixture portals remained white. The fixture now toggles HTML.dark like
  production. Fresh dark modal and Properties screenshots confirm token inheritance.
- P2: Default table widths clipped the final column. Defaults fit available width;
  intentional saved overflow has an explicit horizontal-scroll control. Amount and
  currency values were visible in the five-column preview.
- P2: Popup controls fell outside the modal accessibility subtree. Popups now stay in
  the widget dialog; native Filter and Properties controls were exercised successfully.

The first screenshots are superseded. Repairs were recaptured and compared before
this pass. No actionable P0/P1/P2 finding remains in the exercised scope.

## Required fidelity surfaces

Typography uses existing system fonts, native control sizes and concise labels.
Spacing follows a single two-column desktop modal and stacked narrow flow. Colors,
borders, focus, selection and hover states use Omni4 tokens in both themes. There
are no new raster assets: charts use the existing renderer; action/type icons use
Lucide. Copy removes separate widget-type/dataset steps and keeps advanced settings
collapsed. Records/count/sample information remains explicit.

## Actual visible manual walkthrough

Native Chrome mouse, keyboard, drag and scroll actions covered source selection,
exact Count2001, Donut/Status selection, Filter Done→653, popup Escape, widget/dashboard
Cancel, field-name search, nine permitted fields via Show all, eye toggles, keyboard
and pointer column order, column resize, card resize/reflow, save/reload/reopen, and
light/dark narrow scrolling. Event/Amount/Status order and width229 reopened correctly.
A chart named Manual status QA was created, saved, reloaded and reopened using native
controls. Hover was exercised by moving the pointer onto an unselected tile; the
Metric selection remained unchanged. Additional selector-based checks corroborated
these scenarios; they are not the sole basis for the manual walkthrough claim.

A fresh final-source tab reported zero runtime console errors. Older test-tab logs
contained createRoot warnings from incremental HMR while editing the fixture; no
such warning occurred on the fresh load. Synthetic API trace showed no denied-table
attempts. No production business, dashboard or dataset records were written by QA.

## Scope limits and follow-up

This verifies a local isolated fixture with real rendered Omni4 components and a
Mac browser; it is not a physical-phone or independent-user study. The original live
resize complaint was not reproduced identically. SQL/JOIN execution and expanded
dashboard permissions belong to a separate task and remain disabled/unchanged here.
Advanced visualizations retain model regression coverage; every advanced combination
was not manually exercised. Saved-definition compatibility and selection guards are
also covered by regression tests.

Checklist: implemented controls; fixed review findings; native walkthrough completed;
paired comparison inspected; final automated validation and release recorded separately.
