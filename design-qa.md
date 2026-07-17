# AutoRD Customer Homepage QA

Source visual direction:
- Selected concept: first AutoRD homepage option from the Reparando-inspired mockup pass.
- Target: customer-facing marketplace homepage only, with dealer and bank panels kept separate.

Implementation scope:
- Hero with AutoRD search tray and visible folder-tab notch.
- Advanced vehicle search in Spanish.
- Body-type discovery shelf for vehicle categories.
- Compact financing eligibility card with KYC/credit authorization language.
- Trust strip explaining KYC, credit authorization, and bank response.
- Featured vehicle panel with five cards on desktop.

Viewport checks:
- Desktop: in-app Browser default viewport, reported as `1280 x 720`.
- Mobile: temporary in-app Browser viewport `390 x 844`, then reset.

Design QA:
- Desktop layout: passed. Hero/search/discovery/listing structure matches the selected direction and has no horizontal overflow.
- Mobile layout: passed. Search tabs fit using mobile labels (`Todos`, `Nuevos`, `Certificados`), search height reduced to `348px`, and no horizontal overflow.
- Console errors: none.
- Typography pass: removed negative letter-spacing rules and switched the font stack toward Aptos/Avenir/Segoe for a more natural product feel.
- Asset pass: replaced the sporty hero road image with the existing bundled SUV photo.
- Discovery gap pass: restored the mockup-style category grid, using all eight body types in a two-row desktop layout aligned with the financing card.

Checks:
- `npm.cmd run build` passed.
- `git diff --check` passed.
- CSS negative letter-spacing scan returned no matches.
- Discovery card bottom alignment checked: left and right cards now share the same bottom edge.

Known note:
- Vite still reports the existing large JS chunk warning. This is not caused by the homepage styling pass and does not block the mockup implementation.

Final result: passed
