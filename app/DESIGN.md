# Design system

Tokens live in `src/lib/theme.ts`. This file says why they are what they are.

## Process
Double Diamond (UK Design Council): Discover → Define → Develop → Deliver.
- **Discover**: heuristic evaluation of the old UI against Nielsen's 10 heuristics.
  Main findings: no identity (default Expo icon, iOS-blue links); flat text menu with no hierarchy;
  "Log out" and "Delete my account" stacked right under "Post review" as equal-weight buttons
  (error prevention); full-width text on desktop (100+ character lines).
- **Define**: one brand color, legible menus, destructive actions out of the way, WCAG 2.2 AA.
- **Develop / Deliver**: logo, tokens, then screens (Atomic Design order: tokens → buttons/pills → cards → screens).

## Color
- **Brand `#E30613`** — sampled from the official Crous logo files (crous-bordeaux.fr logo + favicon,
  etudiant.gouv.fr); equals CMYK 0/100/100/0. 4.88:1 on white, so it is used as-is for filled buttons
  (white text) and accents. Not used for body text.
- **Errors are not brand red.** A red brand makes red errors ambiguous, so errors use `danger #A3123A`
  on a tinted box and always carry a ⚠︎ glyph (color is never the only cue, WCAG 1.4.1).
- Warm neutrals (`ink`, `ink2`, `ink3`) instead of pure greys, so the red doesn't look clinical.
- Every text pair ≥ 4.5:1 (1.4.3); input borders and rating stars ≥ 3:1 (1.4.11). Ratios are in `theme.ts`.
- Not used: DSFR / Marianne / bleu France. They are reserved for State services, and this app is not one.

## Type, space, shape
- System fonts (SF / Roboto / Segoe): what each platform's guidelines recommend, zero download.
- Scale ≈ 1.2: 13 / 16 / 19 / 24. Body 16 with ~1.45 line height (Butterick: 120–145%).
- Content column max 640 px → ~70 characters per line (Butterick: 45–90).
- 4-pt spacing grid; radius 8 / 14 / pill. Rounded shapes echo the Crous circle.
- Touch targets ≥ 44 px (Apple HIG; WCAG 2.5.8 minimum is 24).

## Logo
A speech bubble holding a fork: the menu, in your language. The red circle nods to Crous
without copying its mark (no text, added tail and fork), since this is an unofficial app.
Checked against the classic criteria — simple, memorable, versatile, appropriate — by rendering it
at 16–256 px, blurred, greyscale and on dark backgrounds.
- `assets/brand/mark.svg` is the master; PNGs are rendered from it.
- iOS icon: full-bleed red square, no alpha (iOS masks the corners).
- Android adaptive: foreground stays inside the 66 dp safe zone of the 108 dp canvas; background is the
  brand color in `app.json`; monochrome layer for themed icons.
