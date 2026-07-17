# AutoRD Finance Calculator QA

Source visual truth path:
- `C:\Users\Lissa\.codex\generated_images\019f67c2-19c5-7762-a771-30fbeeca0fd6\call_j9KWCdX5wDw2ftPHcwYsVghE.png`

Implementation screenshot path:
- Desktop full page: `qa\finance-calculator-homepage-full.png`
- Desktop calculator crop: `qa\finance-calculator-homepage-crop.png`
- Side-by-side comparison: `qa\finance-calculator-comparison.png`
- Mobile full page: `qa\finance-calculator-mobile-full.png`

Viewport:
- Desktop verification: in-app Browser default viewport, reported as `1280 x 720`.
- Mobile verification: temporary in-app Browser viewport `390 x 844`.

State:
- Home page at `http://127.0.0.1:5174/`.
- Calculator default values: `RD$ 1,250,000`, `20%`, `60 meses`, optional income placeholder.

Full-view comparison evidence:
- Source and implementation were combined in `qa\finance-calculator-comparison.png`.
- The implemented section follows the selected mockup: two-column inputs, light payment summary, three proof items, privacy strip, and no preferred-bank chooser.

Focused region comparison evidence:
- The calculator crop was inspected directly because typography, spacing, controls, payment breakdown, and proof rail are all visible in the focused crop.

Required fidelity surfaces:
- Fonts and typography: implementation uses the existing AutoRD type scale and heavier headings; hierarchy matches the source closely enough for the real site context.
- Spacing and layout rhythm: layout matches the source structure, with slightly tighter real-page proportions caused by the existing AutoRD container width.
- Colors and visual tokens: teal, navy, pale teal, white card, and line colors use the existing site tokens and match the mockup direction.
- Image quality and asset fidelity: no new raster assets were required; existing Lucide icons remain consistent with the app.
- Copy and content: Spanish copy matches the mockup intent and removes the bank selector completely.

Findings:
- No P0, P1, or P2 issues remain.

Comparison history:
- Initial visual pass showed the proof icons were too small inside their circles.
- Fix made: increased `ProofItem` icon size from `17` to `20`.
- Post-fix evidence: recaptured desktop implementation and comparison image after rebuilding.

Checks:
- `npm.cmd run build` passed.
- Browser console errors checked: none.
- Mobile calculator check: no horizontal overflow; payment card and privacy strip visible.

Follow-up polish:
- P3: the source mockup has a slightly wider canvas than the current in-app Browser default viewport, so the real homepage version is naturally a bit denser.

Final result: passed
