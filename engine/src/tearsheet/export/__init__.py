"""Downloads of a saved report: a PDF, a slide deck and an Excel workbook
(docs/superpowers/specs/2026-11-08-report-downloads-design.md).

Each file is made from the saved report when Liam clicks, read-only, with no AI. `data.load`
reads everything a file needs once; `workbook`, `deck` and the print page each draw from it.
"""
