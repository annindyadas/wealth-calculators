# Finance site shell and design system

LWC bundles for the **Finance** Experience Cloud site (LWR). This layer is the
page chrome and design system around the calculators; it does not contain any
calculation logic.

## Bundles

| Bundle | Exposed to Experience Builder | Purpose |
| --- | --- | --- |
| `financeDesignTokens` | No (CSS module) | Single source of colour, radius, spacing and type tokens. |
| `siteHeader` | Yes | Sticky masthead: wordmark, up to 3 nav links, search, one CTA. Hamburger below 768px. |
| `siteHero` | Yes | Flat accent-tinted band. Owns the page `h1`. Optional featured-calculator card. |
| `calculatorHub` | Yes | Search + category filter + responsive card grid. **The scalability layer.** |
| `calculatorSearchBar` | No | Search input. Fires `search`. No filtering logic. |
| `categoryFilterBar` | No | Category chips. Fires `categoryselect`. Holds no state. |
| `calculatorCard` | No | One reusable calculator tile. Navigates via `NavigationMixin`. |
| `calculatorPageLayout` | Yes | Breadcrumb, `h1`, slot for a calculator, related-calculators strip. |
| `siteFooter` | Yes | Four-column footer on the deep neutral surface + disclaimer bar. |

Existing calculator bundles (`sipLumpsumCalculator`, `sipGrowthChart`,
`sipYearlyBreakdown`, `sipScenarioCards`, `sipDatatable`, `sipMath`,
`sipFormat`) were **not modified**.

## Why tokens are a CSS module, not a static resource

`financeDesignTokens` is a bundle containing only `financeDesignTokens.css`,
which each component imports as the first line of its own CSS:

```css
@import 'c/financeDesignTokens';
```

Chosen over a static resource because:

- **Zero duplication and zero runtime cost.** The import is resolved at compile
  time. A static resource would need `loadStyle` in every component's
  `renderedCallback`, which is async and causes a flash of unstyled content.
- **Shadow DOM works with it.** Tokens are declared on `:host`, so each component
  gets them on its own root and every element inside inherits them. A `:root`
  declaration from a static resource does reach shadow trees, but only once the
  file has loaded - hence the FOUC.
- **One edit, whole site.** Change a hex here and every component follows; nothing
  hardcodes a colour.

Trade-off: components each carry a copy of the token block in their compiled CSS
(a few hundred bytes), which is cheaper than the alternative's complexity.

## How it composes

```
Site header region ──── siteHeader

Home page ───────────── siteHero            (h1 lives here)
                        calculatorHub
                          ├── calculatorSearchBar
                          ├── categoryFilterBar
                          └── calculatorCard × N   (from calculatorCatalog.js)

Calculator page ─────── calculatorPageLayout (h1 lives here)
                          └── slot: sipLumpsumCalculator  ← your existing master LWC
                          └── related strip (chips)

Site footer region ──── siteFooter
```

### Adding a calculator

Append one entry to `calculatorHub/calculatorCatalog.js`:

```js
{
    id: 'my-calculator',
    name: 'My Calculator',
    description: 'One sentence on what it models.',
    category: 'Investing',
    iconName: 'utility:trending',
    targetUrl: '/calculators/my-calculator'
}
```

That is the only code change. The hub grid, the category chips and the related
strip all derive from this list. `siteHeader` is never touched.

### Moving the catalog to Custom Metadata later

Keep each entry's shape identical and replace the body of `getCalculators()`
with a wire/Apex call that maps rows onto it. `calculatorCard`,
`categoryFilterBar` and `calculatorSearchBar` take plain properties and events,
so none of their APIs change.

## Design decisions

- **Flat only.** Separation is done with `1px` borders and `--fx-surface-alt`
  tinting. No gradients, no `box-shadow` for depth (shadows appear only as focus
  rings).
- **Accent:** deep teal `#0F766E`, on a near-white / near-black neutral base.
  4.86:1 against white both ways, so it is AA for text, icons and on-accent
  labels.
- **Mobile first.** Every stylesheet starts at the narrow layout; `min-width`
  media queries at `48em` (768px), `64em` and `80em` widen it. Card grid goes
  1 → 2 → 3 → 4 columns.
- **Accessibility.** One `h1` per page (hero *or* page layout, never both);
  chips and cards are real `button`/`a` elements so keyboard support is native;
  visible focus rings via `--fx-focus-ring`; `aria-pressed` on chips,
  `aria-expanded` on the hamburger, `aria-live` on the result count; Escape
  closes the mobile panel and clears the search box.

## Manual configuration steps (not done in metadata)

These were deliberately **not** guessed at. Do them in Setup / Experience
Builder:

1. **Deploy the metadata:** `sf project deploy start -d force-app -o <alias>`.
2. **Header and footer regions:** in Experience Builder, add **Site Header** to
   the header region and **Site Footer** to the footer region of the site's
   template.
3. **Pages:** create the pages the catalog points at - `/calculators` (place
   **Calculator Hub**) and one page per calculator, e.g.
   `/calculators/sip-lumpsum`. Update `targetUrl` values in
   `calculatorCatalog.js` if your routes differ.
4. **Calculator page:** drop **Finance - Calculator Page Layout** on the page and
   you are done - the SIP & Lumpsum calculator renders inside its card shell as
   the slot's default content, because Experience Builder cannot drag a component
   into a `<slot>`. For a page hosting a different calculator, tick **Hide
   Default Calculator** and place that calculator below the layout, or compose
   them in markup:
   `<c-calculator-page-layout><c-my-calculator/></c-calculator-page-layout>`
   (slotted content always wins over the default).
5. **Navigation menu:** build the site's navigation menu; `siteHeader` links are
   independent `@api` strings and do not read from it.
6. **Branding set:** the components ignore the site branding set by design. If
   you want Experience Builder's theme panel to drive colours, map the branding
   variables onto the tokens in `financeDesignTokens.css`.
7. **Replace placeholders:** search for `REPLACE_ME` - currently the social URLs
   in `siteFooter`. Also review every `targetUrl` in `calculatorCatalog.js`.
8. **Wire header search to the hub (optional):** `siteHeader` fires a `search`
   event today. Cross-page search needs either a query parameter the hub reads on
   load, or Lightning Message Service. Not built, since it depends on your
   routing.
9. **Publish** the site after each Experience Builder change.

## Known gaps

- `financeDesignTokens` is a CSS-only bundle with a `.js-meta.xml` alongside it.
  If your org's Metadata API rejects the bundle for having no `.js` entry file,
  add an empty `financeDesignTokens.js` (`export default {};`) - the `@import`
  resolves to the `.css` either way. Nothing else changes.
- The existing calculator bundles still use their own literal colours rather than
  the tokens. Left alone deliberately (they were out of scope). Swapping their
  hexes for `var(--fx-*)` is a small, safe follow-up if you want the calculator
  to match the shell exactly.

- `calculatorPageLayout` renders `sipLumpsumCalculator` as its slot fallback, so
  the layout is not fully calculator-agnostic in Experience Builder. Slotted
  content overrides it, and **Hide Default Calculator** switches it off, but a
  page for a second calculator still needs one of those two moves.
- The header search box filters nothing yet (manual step 8).
- No Jest tests in this layer, per project direction.
