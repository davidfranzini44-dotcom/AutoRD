# AutoRD Customer Homepage QA

Source visual reference:
- `C:\Users\Lissa\AppData\Local\Temp\codex-clipboard-6af58fbd-94fd-4e6c-b349-0dabbf0150e5.png`

Implementation scope:
- Recreated the attached discovery/financing module, not a redesigned variant.
- Body-type module uses six tiles in one horizontal row with price captions.
- Finance card is compact and has no salary input, matching the reference.
- `Calculadora` button expands an inline quote calculator on the homepage instead of navigating away.
- KYC / credit authorization / bank response trust strip sits directly below the module.
- Removed the homepage count/sort row between the trust strip and featured vehicles to match the reference flow.

Viewport checks:
- Desktop: in-app Browser default viewport, `1280 x 720`.
- Mobile: fresh in-app Browser controlled tab at `390 x 844`, then reset.

Design QA:
- Desktop layout: passed. Discovery card and financing card share the same top and bottom edge.
- Finance card: passed. Three confidence items fit inside the pill rail with no clipping.
- Inline calculator: passed. One `Calculadora` button opens the calculator in place and renders the estimated monthly quote.
- Trust strip: passed. Three trust items render in one horizontal strip under the module.
- Featured section flow: passed. `Vehículos destacados` follows the trust strip without the extra sort/count row.
- Mobile layout: passed. No horizontal overflow at `390px`; mobile search tabs and expanded calculator fit.
- Console errors: none.

Checks:
- `npm.cmd run build` passed.
- `git diff --check` passed.

Known note:
- The mockup uses darker generated vehicle cutouts. The implementation uses the repo's existing body-type image assets, styled darker to better match the reference while keeping real project assets.
- Vite still reports the existing large JS chunk warning. This is not caused by this homepage section update.

Final result: passed
