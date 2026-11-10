# Design and tooling for bank-quality equity research PDFs (Chromium printToPDF) and 16:9 decks (python-pptx)

Scope note for the report writer: the sourced facts are in "Cited Findings". "Inferences" holds the buildable specs, labelled as recommendations or estimates, plus a few facts from background knowledge that were not re-checked this session (each one says so). Contrast ratios and greyscale lightness (CIE L*) values marked "computed" come from a local script that applies the WCAG 2.x relative-luminance formula to the hex codes. They are arithmetic, not opinion, so they can be re-run.

**Project-specific finding (load-bearing):** Tearsheet's `app/package.json` pins `"electron": "^33.2.1"`, and the installed copy is **33.4.11**. Electron 33 ships **Chromium 130**. CSS `@page` margin boxes (running headers/footers in CSS) shipped in **Chromium 131**, so they are **not available** in the current build. Getting them needs **Electron 34+ (Chromium 132)**. Until then, running headers and footers must come from `printToPDF`'s `headerTemplate`/`footerTemplate`. Sources are in the Tooling section below.

---

## Fonts: what banks and research houses use, which fonts are safe on Mac/Windows/PowerPoint, and free embeddable alternatives

### Takeaway
Big banks use proprietary brand faces (Goldman Sans, UBS Frutiger plus UBS Headline, DeutscheBank, FT Metric) that a third-party tool should not ship. Goldman Sans is free to download, but its licence is restrictive and can be revoked. The practical answer has two halves. In the PDF, embed an SIL-OFL family (e.g., Source Serif 4 + Source Sans 3, or IBM Plex), because Chromium embeds the fonts it uses. In the .pptx, which cannot carry fonts reliably to Mac, Keynote or Google Slides, use fonts already installed everywhere (Arial for sans, Georgia for serif). Avoid Aptos and Calibri as the sole font, because they depend on Office being installed and fall back to substitutes.

### Cited Findings
- Goldman Sans is a sans-serif "designed for dense data-rich environments"; downloading it means agreeing to the "Goldman Sachs Restricted Font License"; the download includes six roman weights, three italic weights and two condensed weights — [Goldman Sachs Design: Goldman Sans](https://design.gs.com/foundation/typography/goldman-sans)
- The Goldman Sans licence forbids using the font to disparage Goldman or to imply affiliation or endorsement, and Goldman can terminate the licence "without notice … for any reason or no reason at all" — [Typeroom](https://www.typeroom.eu/goldman-sachs-releases-goldman-sans-aka-a-bespoke-typeface-with-a-catch); [Techdirt](https://archive.techdirt.com/articles/20200625/11063644781/goldman-sachs-created-font-you-are-forbidden-license-to-critique-goldman-sachs-using-it.shtml); [Irish Times](https://irishtimes.com/business/financial-services/goldman-sachs-creates-its-own-font-but-it-can-t-be-used-to-criticise-the-bank-1.4289256)
- A third-party font site lists Goldman Sans as "Free for personal use", which conflicts with the official restricted licence. Rely on Goldman's own terms — [Cufon Fonts](https://www.cufonfonts.com/font/goldman-sans) vs [design.gs.com](https://design.gs.com/foundation/typography/goldman-sans)
- Goldman Sans can be installed and used in Word, Excel and PowerPoint (download is a ZIP from Goldman) — [Office Watch](https://office-watch.com/2022/goldman-sachs-font-new-look-word-excel-office/)
- UBS's corporate typefaces are UBS Headline and Frutiger. Akira Kobayashi (Monotype) designed UBS Headline by modifying Walbaum — [Scholtysik (UBS identity)](https://scholtysik.mironet.ch/en/projekte/ubs.html); [NDC interview with Akira Kobayashi](https://www.ndc.co.jp/en/polylogue/report-akira-kobayashi-vol1/)
- Deutsche Bank's brand portal announces a proprietary typeface called "DeutscheBank" — [Deutsche Bank brand portal](https://gcp.prd.brandportal.db.com/home)
- The FT uses Metric (a commercial face from Klim Type Foundry) as its main sans, and Financier for display — [FT Brand Guidelines 2014 (third-party copy)](https://altr-quartz-garden.vercel.app/data-visualisation/attachments/FT_BrandGuidelines2014.pdf); [webdesignhot FT design notes](https://www.webdesignhot.com/design.md/ft/)
- J.P. Morgan and Morgan Stanley fonts: only SEO-grade secondary sources were found. They describe custom wordmark lettering, and one claims a customised Garamond for J.P. Morgan, unverified — [madegooddesigns JPMorgan](https://madegooddesigns.com/?p=46554); [madegooddesigns Morgan Stanley](https://madegooddesigns.com/?p=46557)
- Aptos replaced Calibri as the Office default (announced mid-2023). It is a Microsoft 365 **cloud font** on Mac and Windows, downloaded on demand. When it is missing, Office substitutes Calibri — [Office Watch: Aptos substitution](https://office-watch.com/2023/microsofts-font-substitution-for-aptos-really-sucks/); [Trusted Reviews](https://www.trustedreviews.com/news/microsoft-picks-new-office-default-font-aptos-replaces-calibri-after-15-years-4349015); [Windows Central](https://www.windowscentral.com/software-apps/office-365/microsofts-new-default-font-is-already-here-insiders)
- PowerPoint font embedding: supported in Microsoft 365 and **PowerPoint 2019 for Mac 16.17+**. PowerPoint 2016 for Mac cannot embed but can display embedded fonts. Word and Excel for Mac do not support embedded fonts — [Microsoft Support KB 826832](https://support.microsoft.com/kb/826832); third-party claim of 16.11 for subscription builds — [PPTFAQ](https://pptfaq.com/FAQ00076_Embedding_fonts.htm)
- A Microsoft Q&A user reports that embedded fonts are lost after saving and reopening in PowerPoint for Mac, so Mac embedding is not fully reliable — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5653309/powerpoint-for-mac-keeps-losing-embedded-fonts-aft)
- Google Slides does not carry over fonts embedded in a .pptx; custom fonts are replaced with Google defaults. The suggested workaround is standard fonts, or a PDF export — [SlideModel](https://slidemodel.com/fix-compatibility-powerpoint-google-slides/); [Moda](https://moda.app/blog/convert-powerpoint-to-google-slides-without-losing-formatting) (secondary sources)

### Inferences
- **Recommendation, PDF:** embed one OFL family pair. Option A, the classic research look: **Source Serif 4** (body) + **Source Sans 3** (tables, sidebar, charts). Option B, modern and dense: **IBM Plex Sans** (+ Plex Sans Condensed for wide tables) + **IBM Plex Serif**. Option C, all-sans: **Inter** (it has tabular figures via the `tnum` feature). Background knowledge, not re-verified this session: all of these are SIL Open Font License 1.1, which allows embedding in documents and bundling with software. **Libre Franklin** (OFL) is a Franklin Gothic-style alternative close to many US bank looks. Bundle the .woff2/.ttf files inside the app and load them with `@font-face` from local file paths, so printing never depends on the network.
- **Recommendation, .pptx (must look right on other machines):** set the theme fonts to **Arial** (headings and body) or **Georgia** (headings) + **Arial** (body). Background knowledge, not re-verified: Arial, Georgia, Times New Roman, Verdana and Trebuchet MS ship with both macOS and Windows, so Keynote on a Mac without Office will still render them. Calibri and Cambria arrive only with Office, and Aptos only as an M365 cloud font. If the brand needs a "Helvetica/Frutiger-like" look, Arial is the closest universally installed stand-in.
- Do not use Goldman Sans in a distributed product: the licence is revocable, forbids implying affiliation, and must not be redistributed under other terms. The same applies to the other proprietary bank faces.
- Real research PDFs vary. From experience, many US sell-side PDFs use Arial/Helvetica-class sans or Times-class serif body, and European houses often use Frutiger/Univers-class faces. **This is an estimate; no primary source was found.**

### Gaps
- No primary source (bank brand guidelines) confirming the current research-report fonts of J.P. Morgan, Morgan Stanley, BofA, Citi or Barclays.
- The OFL licence status of Source/Plex/Inter/Libre Franklin and the macOS font list were not fetched this session (background knowledge). Verify against Google Fonts or Apple's "Fonts included with macOS" page before shipping.
- Whether Keynote honours fonts embedded in a .pptx was not found. Assume it does not.

---

## Sizes: body, headings, tables, footnotes/sources, sidebars, line height; slide sizes; minimum legible sizes

### Takeaway
Butterick's print guidance is 10–12 pt body, with smaller sizes needing tighter line spacing and shorter lines. Dense research PDFs typically sit at the bottom of that range or just below it (about 9–10 pt body, 7.5–8.5 pt tables, 6.5–7 pt sources and disclosures). Those research-PDF figures are estimates, not sourced. Slide sizes for read-on-screen bank decks are larger (about 24–28 pt titles, 12–16 pt body, 8–9 pt sources); also estimates. WCAG's "large text" threshold and Chromium's header/footer scaling quirks set hard floors.

### Cited Findings
- "In print, the optimal point size for body text is 10–12 point." On the web, 15–25 px. "As you reduce point size, also reduce line spacing and line length." — [Butterick, Practical Typography: point size](https://practicaltypography.com/point-size.html)
- Chromium header/footer templates render scaled down. jsreport advises setting an explicit `font-size` on `html`/`body` inside the template to fix tiny text. ChromicPDF documents a default template font size of 10pt with a default zoom of 0.75 — [jsreport Chrome PDF docs](https://jsreport.net/learn/chrome-pdf); [ChromicPDF.Template](https://hexdocs.pm/chromic_pdf/ChromicPDF.Template.html)
- WCAG 1.4.11 (non-text contrast) requirements are "similar to those for large text in 1.4.3", i.e., 3:1 — [W3C Understanding SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

### Inferences
**PDF type scale (recommendation, estimates calibrated to typical sell-side reports):**

| Element | Size / leading | Weight / face | Notes |
|---|---|---|---|
| Cover headline (report title) | 18–20 pt / 22–24 pt | Bold serif or sans, navy | 1–2 lines max |
| Sub-headline / key thesis | 11–12 pt / 14–15 pt | Regular or italic | |
| H2 section heading | 11–12 pt / 14 pt | Bold sans, navy | 12 pt space above, 4 pt below |
| H3 run-in / bold lead | 9.5 pt | Bold | first words of paragraph, as banks do |
| Body | **9.5 pt / 12.5–13 pt** (≈130–135%) | Serif or sans | 10 pt / 13 pt if readability over density |
| Bullets (key points) | 9.5 pt | | 8–10 pt indent, 3 pt space between |
| Sidebar (key data, ratings box) | 8–8.5 pt / 10.5 pt | Sans | labels grey, values ink, right-aligned |
| Tables | 7.5–8 pt / 9.5–10 pt | Sans, tabular figures | header 7.5 pt bold |
| Chart title | 8.5–9 pt bold | Sans | units in subtitle at 7.5–8 pt |
| Chart axis / labels | 7–7.5 pt | Sans, grey #595959 | |
| Source / notes lines | 6.5–7 pt | Sans, grey #595959 | "Source: Company data, Tearsheet estimates" |
| Running header/footer | 7–7.5 pt | Sans, grey | set explicitly in template (see Tooling) |
| Disclosures / legal | 6.5–7 pt / 8.5 pt | Sans | never below 6 pt |

- **Line length:** a two-column body at US Letter with a 2.2 in sidebar gives about 4.6–5 in of text width, roughly 75–90 characters at 9.5 pt. That is at the top of a comfortable range, so either keep body at 9.5–10 pt or use two text columns on later pages. Estimate; Butterick's line-length page, which gives 45–90 characters, was not fetched this session.
- **Slide (16:9, 13.333 × 7.5 in) type scale (recommendation, estimates):** action title 24–28 pt bold (one or two lines; a full-sentence "so what"); subtitle/kicker 14–16 pt; body/bullets 14–16 pt (12 pt floor for dense banker pages that are read rather than projected); table text 10–12 pt (10 pt floor); chart labels 10–12 pt; footnote/source 8–9 pt; page number/confidentiality 8 pt. For decks actually projected to a room, 18 pt minimum body is the common rule of thumb (unsourced).
- **Large-text threshold:** background knowledge, not re-fetched: WCAG 1.4.3 defines large text as ≥18 pt regular or ≥14 pt bold, with a 3:1 minimum there and 4.5:1 for normal text. So any text under 18 pt (nearly all report text) should meet 4.5:1 against its background.

### Gaps
- No public bank style guide stating exact research-report body sizes was found. The PDF scale above is a practitioner estimate.
- Butterick's line-spacing (120–145%) and line-length (45–90 chars) pages were not fetched this session. Those numbers are background knowledge.

---

## Colour: bank-style palettes, colour-blind-safe semantics (up/down, bull/base/bear, Buy/Hold/Sell), print and greyscale

### Takeaway
Use a restrained navy, greys and one accent palette on white. Do not rely on red versus green alone: give every semantic colour a second cue (sign, arrow, text label, or dash pattern). Pick semantic pairs that differ in greyscale lightness, since the commonly recommended Okabe-Ito "safe" pairs mostly have similar lightness and merge on a mono printer (computed below). Meet WCAG 4.5:1 for text and 3:1 for chart marks against white.

### Cited Findings
- Okabe-Ito (Wong) palette, 8 colours: orange #E69F00, sky blue #56B4E9, bluish green #009E73, yellow #F0E442, blue #0072B2, vermilion #D55E00, reddish purple #CC79A7, black #000000; popularised by Bang Wong (Nature Methods, 2011) — [R `see` package docs](https://search.r-project.org/CRAN/refmans/see/html/okabeito_colors.html); [ggokabeito](https://rdrr.io/cran/ggokabeito/man/palette_okabe_ito.html)
- IBM colour-blind-safe set: #648FFF (ultramarine), #785EF0 (indigo), #DC267F (magenta), #FE6100 (orange), #FFB000 (gold), plus neutrals. Secondary sources only; IBM's page did not show the hexes — [UNC Ainslie Lab PDF](https://ainslielab.web.unc.edu/wp-content/uploads/sites/12416/2024/01/Color-palettes-that-can-be-seen-by-the-color-blind.pdf); [AudioEye](https://www.audioeye.com/post/colorblind-friendly-palettes/)
- WCAG 2.2 SC 1.4.11: graphical objects "required to understand the content" need "a contrast ratio of at least 3:1 against adjacent color(s)". The threshold is strict ("2.999:1 would not meet the 3:1 threshold") — [W3C Understanding SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- ONS (UK Office for National Statistics) chart greys: zero line #B3B3B3 at 1.5 px; other gridlines #D9D9D9 at 1 px; annotation arrows #414042; range highlight #ECECEC; "Do not add any other chart decoration, such as borders or backgrounds." — [ONS Service Manual: chart elements](https://service-manual.ons.gov.uk/data-visualisation/build-specifications/chart-elements)
- The Economist's brand red is listed as #E3120B (secondary). Gridline #B7C6CF and series blue #006BA2 come from an unofficial "Economist-style" prompt and are unverified — [brandcolorcode](https://www.brandcolorcode.com/the-economist); [SlideSpeak (unofficial)](https://slidespeak.co/slide-design-prompts/prompts/economist-style)
- The FT background is "FT pink", given as #FFF1E5 by one source and #FFF1E0 by an R FT theme. The sources conflict — [webdesignhot](https://www.webdesignhot.com/design.md/ft/) vs [highcharter theme-ft](https://rdrr.io/cran/highcharter/src/R/theme-ft.R)
- Chromium header/footer backgrounds need print-colour-adjust settings to print backgrounds — [chromium-dev thread](https://groups.google.com/a/chromium.org/g/chromium-dev/c/xHMM2mVrm1w)

**Computed contrast vs white, and greyscale lightness L\* (0 = black, 100 = white):**

| Colour | Contrast vs #FFF | L\* | Passes text 4.5:1? | Passes marks 3:1? |
|---|---|---|---|---|
| Ink #1A1A1A | 17.40 | 9 | yes | yes |
| Navy #0B2D5B | 13.63 | 19 | yes | yes |
| Grey #595959 | 7.00 | 38 | yes | yes |
| Grey #767676 | 4.54 | 50 | yes (barely) | yes |
| Grey #7F7F7F | 4.00 | 53 | **no** | yes |
| Okabe blue #0072B2 | 5.19 | 46 | yes | yes |
| Okabe bluish green #009E73 | 3.42 | 58 | no | yes |
| Okabe vermilion #D55E00 | 3.87 | 54 | no | yes |
| Okabe orange #E69F00 | 2.25 | 71 | no | **no** |
| Okabe sky #56B4E9 | 2.31 | 70 | no | **no** |
| Green #007A4D | 5.40 | 45 | yes | yes |
| Red #C00000 | 6.48 | 40 | yes | yes |
| Economist red #E3120B | 4.82 | 48 | yes | yes |
| Rule #BFBFBF | 1.84 | 77 | no | no (fine for rules) |
| Grid #D9D9D9 | 1.41 | 87 | no | no (gridlines are non-essential) |
| Tint #DCE6F2 | 1.26 | 91 | n/a (fill) | ink on tint = 13.79 |
| Fill #F2F2F2 | 1.12 | 96 | n/a (fill) | |

White text on navy #0B2D5B = 13.63:1 (computed).

### Inferences
**Recommended "Tearsheet Research" print palette (recommendation):**
- Text: ink **#1A1A1A** (body), secondary **#595959** (labels, sources, axis text). Do not use #7F7F7F for text, since it fails 4.5:1.
- Primary: navy **#0B2D5B** (headings, rules under table headers, main chart series, rating box border).
- Secondary series: blue **#0072B2**, then mid-grey **#7F7F7F** (marks only), then light navy **#8FA9CF** (fills only, with a darker outline or direct label).
- One accent (highlight the subject company or "our estimate"): orange **#E69F00** as a fill or thick line only, never text. Or use **#D55E00** if it must pass 3:1 as a thin line.
- Neutrals: rules **#BFBFBF** (0.5 pt), gridlines **#D9D9D9** (0.5 pt), zero line **#B3B3B3** (0.75 pt), table-header tint **#DCE6F2**, zebra or sidebar fill **#F2F2F2**.
- **Up/down in tables:** keep numbers ink-coloured and carry the meaning in the sign: "+3.2%" / "(3.2)%" or "−3.2%". Optionally colour negatives **#C00000**, which is text-safe at 6.48:1. Avoid green and red as the only signal. Green #007A4D and red #C00000 have similar L\* (45 vs 40) and are a classic deuteranopia confusion pair.
- **Up/down in charts (bars):** positive navy #0B2D5B (L\* 19) vs negative orange #E69F00 (L\* 71). This pair separates by 52 L\* points in greyscale and by hue for colour-blind readers. Orange fails 3:1 against white, so add a #B3B3B3 zero line and data labels.
- **Bull / Base / Bear (scenario lines, football fields):** Bull **#0072B2** (solid), Base **#0B2D5B** (solid, heavier), Bear **#D55E00** (dashed), each with a direct end label. Blue and vermilion are only about 8 L\* apart, so the dash and the label are what keep them apart in greyscale.
- **Buy / Hold / Sell badges:** white bold text on Buy **#007A4D** (5.40:1), Hold **#767676** (4.54:1), Sell **#C00000** (6.48:1). The word itself carries the meaning, so the colour is redundant (good for colour-blind readers). An alternative many banks use is a neutral rating: navy text in a navy-outlined box, with no semantic colour at all.
- Okabe-Ito's mid-tone colours (#009E73, #D55E00, #0072B2, #CC79A7) all sit between L\* 46 and 61, so they merge on a mono printer. Pair any of them with navy (L\* 19) or orange or light navy (L\* 69–71) when greyscale matters.
- Avoid large solid dark fills in the PDF (toner-heavy and they look like a web page). Use navy for 1–2 pt rules and text, and the light tints for fills. Background fills need `printBackground: true` plus `print-color-adjust: exact`.

### Gaps
- No public, primary bank research colour specifications (hex values) were found. Typical banks use a navy/dark blue primary, but I have no citable hex values for specific banks.
- The official FT and Economist chart-style guides were not retrieved. Their hex values above are secondary or unverified.
- IBM palette hexes are from secondary sources only.

---

## Charts and tables: finance style norms (gridlines, no 3D, direct labels, sources, units), FT/Economist/IBCS guidance, zebra vs rules, number alignment and tabular figures

### Takeaway
House style for finance charts is minimal: one gridline direction in light grey, a darker zero line, no borders, backgrounds or 3D, direct labels instead of legends, a message-style title with units in the subtitle, and a source line under every chart. Tables should use thin horizontal rules (not heavy grids), right-aligned tabular figures, units in the header, and estimate columns marked "E". The ONS spec is a public, concrete source for chart greys and line weights. IBCS primary documents could not be retrieved.

### Cited Findings
- ONS: zero gridline 1.5 px solid #B3B3B3; all other gridlines 1 px solid #D9D9D9; gridlines behind data; bar charts keep gridlines even when directly labelled; "Most charts use only one gridline direction; scatter plots are the exception"; categorical axes have no tick marks — [ONS chart elements](https://service-manual.ons.gov.uk/data-visualisation/build-specifications/chart-elements)
- ONS: use direct labelling where possible (e.g., line charts), otherwise a legend placed above the chart, left-aligned, in a single row. Reference lines are 2 px dashed (4 px dash, 4 px gap) #B3B3B3. A highlighted period uses fill #ECECEC. No borders or backgrounds — [ONS chart elements](https://service-manual.ons.gov.uk/data-visualisation/build-specifications/chart-elements)
- IBCS terminology (as implemented by an IBCS-certified chart vendor): Actual (AC) and Forecast (FC) are "primary" scenarios; Plan (PL) and Previous (PY) are "secondary"; PY can mean any past period — [VitaraCharts IBCS guide](https://docs.vitaracharts.com/ibcs-user-guide/ibcs/mapping-ibcs-scenarios)
- python-pptx "Most chart types other than 3D types are supported" (so the deck pipeline naturally avoids 3D) — [python-pptx charts](https://python-pptx.readthedocs.io/en/latest/user/charts.html)

### Inferences
**Chart spec (recommendation), used identically in the PDF (SVG) and the deck:**
- Title: a message ("Margins recover to 18% by FY27E"), 8.5–9 pt bold ink (PDF) or 14–16 pt (slide). Subtitle carries units and period: "EBIT margin, %, FY20–FY27E".
- Number the charts ("Exhibit 3:" or "Figure 3:"), as research houses do; this is common practice, not sourced.
- Axes: no chart border, no plot background. Value axis has no axis line, only #D9D9D9 0.5 pt horizontal gridlines (4–6 ticks) and a #B3B3B3 0.75 pt zero line. Category axis gets a #BFBFBF 0.5 pt baseline with no ticks.
- Label text 7–7.5 pt #595959 (PDF) or 10–12 pt (slide). Number format on the axis (e.g., "0%" or "$#,##0").
- Lines 1.25–1.5 pt (PDF) or 2–2.25 pt (slide), no markers except at the last point; end-of-line direct labels in the series colour.
- Bars: gap width about 50–80%, no outlines, data labels at the bar end for ≤ 12 bars, otherwise gridlines.
- Actual vs estimate: draw estimate periods with lighter fill or hatched bars, or a dashed line segment, plus "E" suffixes on labels. This follows the IBCS idea that forecasts are visually distinct from actuals; the exact IBCS notation was not verified, see Gaps.
- Source line under each chart and table: 6.5–7 pt #595959, "Source: Company filings, FactSet, Tearsheet estimates." Notes go above the source line.
- Never use 3D, gradients, shadows, pie charts with more than 4 slices, or dual axes without clear labelling.
- **Tables (recommendation):** no vertical rules, no full grid. Use a 1 pt navy rule above the header and under the header, 0.5 pt #BFBFBF hairlines between groups (not every row), and a 1 pt navy rule at the bottom. Zebra stripes: optional #F2F2F2 every other row in long tables (>12 rows) only. Rules-only reads more "bank" and survives greyscale printing.
- Subtotals/totals in bold with a 0.5 pt rule above. Margins and ratio rows in italic grey.
- Numbers: right-aligned; the same decimal places within a column; negatives in parentheses "(12.3)"; units in the column or row header ("US$m", "%", "x"); thousands separators; "n.m." or "–" for not meaningful; estimate columns headed "2026E" with a light #F2F2F2 fill or a left #BFBFBF hairline.
- CSS: `font-variant-numeric: tabular-nums lining-nums;` on all table and number cells (background knowledge: standard CSS Fonts Level 4 property; with OFL fonts that have a `tnum` feature, i.e., Source Sans 3, IBM Plex and Inter). For decimal alignment, right-align with a fixed decimal count; CSS `text-align: "." ` is not supported in Chromium (background knowledge).
- In PowerPoint, tabular figures are the default for Arial and Georgia's figures are old-style proportional by default. **Background knowledge, not verified.** So use Arial for numeric tables in the deck.

### Gaps
- IBCS's own pages (ibcs.com) did not return content (the site showed a placeholder). The exact UNIFY notation (AC solid dark grey, PY light grey, PL outlined, FC hatched) and variance colour rules are background knowledge and were **not verified** this session.
- The FT Visual Vocabulary and the FT and Economist internal chart style guides were not retrieved. Economist values found are unofficial.

---

## Page layout for print: Letter vs A4, margins, two-column with sidebar, running headers/footers, keeping tables whole

### Takeaway
Pick a page size per audience (US Letter for US-style research, A4 for European) and declare it in CSS `@page` with `preferCSSPageSize: true`. Use a cover page with a key-data sidebar, two-column or full-width interior pages, and running header and footer content. In the current Electron 33 build, the header and footer must come from `headerTemplate`/`footerTemplate`. Keep tables, figures and their source lines whole with `break-inside: avoid`. Chromium repeats `thead` on each page.

### Cited Findings
- Electron `printToPDF` defaults: `pageSize` "Letter", margins 1 cm (~0.4 in) per side, `landscape` ignored if the page uses the `@page` CSS at-rule, and with `preferCSSPageSize: false` content is "scaled to fit the paper size" — [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents)
- Chromium supports `@page` size and margins; `@page :right` / `:left` selectors appear in Chrome's examples — [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins)
- Blink repeats table header groups on each printed page, and makes `thead { break-inside: avoid }` the default print style so headers repeat — [Chromium code review 2021703002](https://codereview.chromium.org/2021703002); [Chromium layout test](https://chromium.googlesource.com/chromium/src/+/81c0fc6d4e08e4e2bb4eb8a42747f21b13303616/third_party/WebKit/LayoutTests/fragmentation/single-line-cells-repeating-thead-break-inside-on-thead-only.html)
- `break-inside: avoid` on `tr`/`td` keeps rows intact (older thread notes possible cell misalignment) — [chromium-discuss](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/cHcwlrHwF1A)

### Inferences
**Page spec (recommendation):**
- Size: `@page { size: letter; }` (8.5 × 11 in) by default, with an A4 option (`size: A4`, 210 × 297 mm), selectable per region. Do not mix sizes within one document.
- Margins: top 0.75 in (room for the running header), bottom 0.7 in (footer plus page number), left and right 0.6 in. The cover page can use `@page :first { margin-top: 0.5in }` and draw its own masthead in-flow.
- **Cover page grid (Letter):** a masthead band at the top (company name 18–20 pt, ticker/exchange, date, report type, e.g., "Initiation" / "Earnings review"). Below it, a left main column of about 4.9 in (headline, 3–5 key-point bullets, thesis text) and a right sidebar of about 2.2 in plus a 0.2 in gutter. The sidebar holds a rating box (Buy/Hold/Sell badge, price target, current price, upside %), key data (market cap, EV, 52-week range, free float, avg daily volume, shares out), a small price chart (12M, vs index), and a key financials mini-table (FY-1A, FYE, FY+1E: revenue, EBITDA, EPS, P/E, EV/EBITDA, div yield). The analyst name and contact go at the sidebar bottom, and the disclosure pointer goes in the footer ("See important disclosures on page N").
- Interior pages: full-width text with exhibits spanning full width, or two exhibits side by side (each about 3.55 in wide). CSS grid: `grid-template-columns: 1fr 1fr; column-gap: 0.25in`.
- Keep together: `figure, .exhibit, table.small, .source { break-inside: avoid; }`; `h2, h3 { break-after: avoid; }`; `p { orphans: 2; widows: 2; }`; long tables split by row with `tr { break-inside: avoid; }` and a repeating `thead`.
- Disclosures and appendix pages start fresh with `break-before: page`.
- Running header (from page 2): left "Company name (TICKER)", right "Equity Research | date". Footer: left "Tearsheet Research", centre disclosure pointer, right "Page X of Y". Uses `<span class="pageNumber">` / `<span class="totalPages">` in `footerTemplate` (current Electron 33). To suppress the header on page 1 there, either generate page 1 separately and merge, or accept the header everywhere. On Electron 34+, `@page :first { @top-left { content: none } }` handles it.

### Gaps
- No primary source on what share of banks use Letter vs A4. The common convention (US Letter for US houses, A4 for European and Asian) is background knowledge.
- Whether `headerTemplate` can be suppressed on the first page natively was not found. No such option is documented in the Electron options list.

---

## Tooling: Chromium / Electron `printToPDF` capabilities and limits

### Takeaway
`printToPDF` gives full control of page size (via CSS with `preferCSSPageSize`), backgrounds, margins, and HTML header/footer templates with page X of Y. It also has experimental tagged-PDF and outline (bookmark) generation. CSS margin boxes for running headers exist only from Chromium 131, so Tearsheet's Electron 33 (Chromium 130) lacks them. Header and footer templates are a separate, restricted rendering context: inline styles only, explicit font sizes, base64 images, no JavaScript. `string-set`, `target-counter` and CSS footnotes are not supported even in current Chrome.

### Cited Findings
- `printToPDF(options)` returns `Promise<Buffer>`. Options: `landscape` (default false), `displayHeaderFooter` (false), `printBackground` (false), `scale` (1), `pageSize` (default Letter; A0–A6, Legal, Letter, Tabloid, Ledger, or `{width,height}` in inches), `margins` (inches; default 1 cm), `pageRanges` (e.g., '1-5, 8, 11-13'), `headerTemplate`/`footerTemplate` (HTML, classes `date`, `title`, `url`, `pageNumber`, `totalPages`), `preferCSSPageSize` (false), `generateTaggedPDF` (false, **experimental**, "may not fully adhere to PDF/UA and WCAG"), `generateDocumentOutline` (false, **experimental**, builds a PDF outline from headers) — [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents)
- Chrome 131 added `@page` margin boxes: 16 boxes (`@top-left-corner`, `@top-left`, `@top-center`, `@top-right`, `@top-right-corner`, `@left-top/middle/bottom`, `@right-top/middle/bottom`, `@bottom-left-corner`, `@bottom-left`, `@bottom-center`, `@bottom-right`, `@bottom-right-corner`). Content goes in via `content:`, with `counter(page)` and `counter(pages)` — [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins); [Chrome 131 release notes](https://developer.chrome.com/release-notes/131)
- When author-defined margin boxes are on the same edge as the browser's generated header or footer, the author's boxes take precedence and the browser default is suppressed on that edge — [blink-dev Intent to Ship: @page margin boxes](https://groups.google.com/a/chromium.org/g/blink-dev/c/XKb6IQZXNks)
- Firefox and Safari do not support margin boxes (irrelevant for Electron, but relevant if HTML is ever printed in other browsers) — [caniuse: @top-left](https://caniuse.com/mdn-css_at-rules_page_top-left)
- Not yet supported in Chrome: `string-set`/`string()` (running chapter titles), `target-counter` (cross-references like "see page 7"), `float: footnote`. Each is listed as a future possibility with a Chromium bug — [Chrome for Developers: print margins](https://developer.chrome.com/blog/print-margins)
- Electron 33.0.0 = Chromium 130.0.6723.44; Electron 34.0.0 = Chromium 132.0.6834.83 — [Electron 33.0.0 blog](https://electronjs.org/zh/blog/electron-33-0); [Electron 34.0 blog](https://electronjs.org/zh/blog/electron-34-0); [endoflife.date: Electron](https://endoflife.date/electron)
- Header and footer templates: images work only as base64 data URIs, remote resources are blocked, JavaScript is not evaluated, and top and bottom margins must be large enough for the header and footer — [Gotenberg wiki](https://github.com/sanzstez/gotenberg-ruby/wiki); [jsreport](https://jsreport.net/learn/chrome-pdf); [html-pdf-chrome README](https://npmjs.com/package/html-pdf-chrome); [PDFTron community](https://community.pdftron.com/t/images-do-not-appear-in-header-and-footer-of-html2pdf-output/6121)
- Background colours or images in header/footer need print-colour-adjust handling — [chromium-dev](https://groups.google.com/a/chromium.org/g/chromium-dev/c/xHMM2mVrm1w)
- Tearsheet's installed Electron is 33.4.11, from `app/package.json` `"electron": "^33.2.1"` (local inspection of the repo, this session).

### Inferences
**Recommended `printToPDF` call for the current Electron 33 build (recommendation):**
```js
const pdf = await win.webContents.printToPDF({
  preferCSSPageSize: true,          // honour @page { size; margin }
  printBackground: true,            // tints, rating badges, zebra rows
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7.5pt;color:#595959;width:100%;padding:0 0.6in;display:flex;justify-content:space-between;">
      <span>Company Name (TICK)</span><span>Equity Research &middot; 8 Nov 2026</span></div>`,
  footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7pt;color:#595959;width:100%;padding:0 0.6in;display:flex;justify-content:space-between;">
      <span>Tearsheet Research</span><span>See important disclosures at the end of this report</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  generateDocumentOutline: true,    // experimental: bookmarks from h1–h6
  // generateTaggedPDF: true,       // experimental; test before enabling
});
```
- With `preferCSSPageSize: true`, the `@page` margins (not the `margins` option) define the space that the header and footer templates draw into. Keep top and bottom margins ≥ 0.6 in. This is an inference from the Electron docs plus the Gotenberg note; verify in a build.
- The header and footer render in their own document: use inline styles, set an explicit `font-size` in pt, and use fonts installed on the system (Arial or Helvetica). Background knowledge, not verified: `@font-face` URLs from the main page do not carry over, and a base64 `@font-face` inside the template may work but should be tested.
- The page body must set `html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` so fills print, in addition to `printBackground: true`.
- **Upgrade path:** move to Electron ≥ 34 (Chromium 132) to use CSS margin boxes, which allow per-page control (`@page :first` without header, left and right pages) with the same fonts as the body:
  ```css
  @page { size: letter; margin: 0.75in 0.6in 0.7in;
    @top-left { content: "Company Name (TICK)"; font: 7.5pt "Source Sans 3"; color:#595959; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt "Source Sans 3"; color:#595959; }
  }
  @page :first { @top-left { content: none; } }
  ```
  With margin boxes, set `displayHeaderFooter: false` to avoid duplicate headers. Author boxes win on the same edge regardless.
- Running section titles (`string-set`) and "see page N" cross-references (`target-counter`) are not available. Instead, render a static table of contents without page numbers, or do a two-pass print: print, read page positions, then reprint. That is an engineering inference.
- Background knowledge, not verified this session: Chromium's PDF backend (Skia) embeds subsets of the fonts used, keeps text selectable and searchable, and turns `<a href>` links into clickable PDF link annotations. Internal `#anchor` links to headings also usually work. **Test this** by opening the generated PDF in Preview and Acrobat.
- Charts in the PDF should be inline SVG, which stays vector in the PDF and sharp at any zoom, rather than canvas or PNG.

### Gaps
- No primary Chromium documentation was fetched on font embedding (subsetting), hyperlink preservation, or `headerTemplate` font loading. Those points are background knowledge or community reports.
- Whether `generateTaggedPDF` output is good enough for PDF/UA was not tested; Electron itself says it may not comply.
- Current (2026) Chromium status of `string-set` / `target-counter` beyond the Chrome blog's "future possibility" was not re-checked.

---

## Tooling: python-pptx capabilities and keeping a .pptx right in PowerPoint, Keynote and Google Slides

### Takeaway
python-pptx can build everything a bank deck needs: layouts, text, tables, and native, editable charts for most non-3D types. It cannot create combo (multi-plot) charts, and it does not embed fonts. Its `fit_text()` is a one-off font shrink with hard-coded quirks, and the auto-fit settings are not re-applied until a user edits the text. Robust output therefore means: theme fonts that exist everywhere (Arial/Georgia), text boxes sized deterministically in code, native charts for PowerPoint users, and a PDF export or image fallbacks for Google Slides and Keynote.

### Cited Findings
- `TextFrame.fit_text()` "sets the font size of all text in the shape to the maximum size that will fit entirely within the shape"; default `max_size` 18 pt. It sets auto-size to NONE and word wrap on, and writes the size onto each run. "the 'auto-size' behavior does not persist to later changes to the text or shape" — [python-pptx analysis: fit text](https://python-pptx.readthedocs.io/en/latest/dev/analysis/txt-fit-text.html)
- `fit_text()` limitations: the font file path must be supplied manually; bold/italic variant "is selected unconditionally"; Calibri typeface name "is selected unconditionally"; font size made uniform; line breaks replaced with a single space — [python-pptx analysis: fit text](https://python-pptx.readthedocs.io/en/latest/dev/analysis/txt-fit-text.html)
- Native charts: `slide.shapes.add_chart(XL_CHART_TYPE…, x, y, cx, cy, chart_data)` with `CategoryChartData`, `XyChartData`, `BubbleChartData`; "Most chart types other than 3D types are supported"; data labels (`plot.has_data_labels`, `data_labels.number_format`, `.position`, `.font`); axes (`has_major_gridlines`, `tick_labels.font`, `tick_labels.number_format`, `maximum_scale`); legend (`has_legend`, `legend.position`, `include_in_layout`); default series colours come from theme Accent 1–6 — [python-pptx charts](https://python-pptx.readthedocs.io/en/latest/user/charts.html)
- "python-pptx doesn't yet support creating multi-plot charts", so no bar-plus-line combos — [python-pptx charts](https://python-pptx.readthedocs.io/en/latest/user/charts.html)
- Google Slides converts all PowerPoint charts into static images on import (citing Google's "features not supported" list) — [think-cell KB0224](https://www.thinkcell.com/en/resources/kb/0224) (via search summary; page redirected and was not fully read); [SlideModel](https://slidemodel.com/fix-compatibility-powerpoint-google-slides/)
- Google Slides replaces fonts embedded in a .pptx — [SlideModel](https://slidemodel.com/fix-compatibility-powerpoint-google-slides/); [Moda](https://moda.app/blog/convert-powerpoint-to-google-slides-without-losing-formatting)
- PowerPoint font embedding is available on Windows (M365) and Mac 16.17+, and reported as flaky on Mac — [Microsoft KB 826832](https://support.microsoft.com/kb/826832); [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5653309/powerpoint-for-mac-keeps-losing-embedded-fonts-aft)
- When Aptos is absent, Office substitutes Calibri — [Office Watch](https://office-watch.com/2023/microsofts-font-substitution-for-aptos-really-sucks/)

### Inferences
**Deck build recipe (recommendation):**
- Background knowledge, not verified: python-pptx's default template is 4:3 (10 × 7.5 in). Set `prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)` (12,192,000 × 6,858,000 EMU). Better: start from a hand-made 16:9 template .pptx (`Presentation("tearsheet_template.pptx")`) whose slide master defines the theme fonts (Arial/Georgia), theme colours (Accent1 #0B2D5B, Accent2 #0072B2, Accent3 #7F7F7F, Accent4 #8FA9CF, Accent5 #E69F00, Accent6 #D55E00) and layouts (Title, Title-only, Two-content, Chart+commentary, Table, Section divider, Disclosures). Native charts then pick up the palette from Accent 1–6 automatically.
- **Slide grid (estimate):** outer margins 0.5 in left and right, 0.4 in top. Action title box at top-left (0.5, 0.35) × 12.3 × 0.9 in, 24–28 pt bold navy, two lines max. A 1 pt navy rule under the title at y ≈ 1.3 in. Content area 12.3 × 5.3 in. Footer at y ≈ 7.05 in: source line 8–9 pt grey at left, "Tearsheet Research" plus page number 8 pt at right. Use a 12-column grid with 0.25 in gutters.
- **Text fitting:** do not rely on `MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE`. Background knowledge: it only sets the `normAutofit` flag, and PowerPoint recalculates the shrink only when the text is edited, so text may overflow on first open. Instead, measure text in code (e.g., Pillow `ImageFont.truncate`/`getlength` with the bundled Arial metrics, or a characters-per-line estimate), pick sizes from a fixed ladder (28/24/20 title; 16/14/12 body), and truncate or split to the next slide. Use `fit_text()` only with an explicit `font_file`, and note its forced Calibri and bold quirks.
- **Charts:** use native charts (editable in PowerPoint; background knowledge: python-pptx embeds the chart data as an Excel workbook) for PowerPoint users. Style each one: `value_axis.has_major_gridlines=True` with a grey #D9D9D9 line format, `category_axis.format.line` #BFBFBF, no legend when series can be directly labelled, `data_labels.number_format='0.0%'` with `number_format_is_linked=False`, and 10–12 pt tick labels. For combo charts (bar plus line, e.g., revenue plus margin) and football-field valuation charts, render an SVG or PNG at 2–3× resolution with matplotlib/SVG using the same palette and insert it as a picture. Alternatively, post-process the chart XML, which is advanced.
- **Tables:** `shapes.add_table()` creates a table with a default style. Override per cell: fill none or #DCE6F2 for the header, 10–12 pt Arial, right-aligned numbers (`PP_ALIGN.RIGHT`), cell margins of about 0.05 in. Background knowledge: python-pptx has no API for border lines, so set them by editing the cell's `a:tcPr` XML (`a:lnB` etc.) or choose a built-in table style ID with minimal borders.
- **Cross-app robustness:** (1) theme fonts Arial/Georgia only, never Aptos/Calibri as the sole font, no embedding. (2) Ship a PDF of the deck alongside the .pptx; the PDF is the "looks right everywhere" artefact. (3) Expect Google Slides to turn native charts into images and to swap fonts. (4) Keynote converts .pptx charts to Keynote charts and may alter styling; testing is needed (gap). (5) Avoid SmartArt, gradient fills, custom bullets from symbol fonts, and text effects, which degrade across apps (background knowledge).

### Gaps
- Keynote's handling of python-pptx native charts and of embedded fonts was not found in sources. It needs a hands-on test.
- The exact Google "features not supported in Slides" support page was not fetched directly; the chart-to-image claim rests on think-cell's citation and secondary blogs.
- The `MSO_AUTO_SIZE` enum values and PowerPoint's re-fit-on-edit behaviour, python-pptx's 4:3 default slide size, its embedded-xlsx chart data, and the lack of a table-border API are background knowledge, not re-checked against the docs this session.
- No 2025–2026 python-pptx changelog was checked for new features (e.g., combo-chart creation).
