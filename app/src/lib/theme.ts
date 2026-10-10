// Design tokens. Contrast ratios (WCAG 2.2) are against `surface` unless noted; see DESIGN.md.
export const color = {
  brand: '#E30613', // Crous red, from the official logo files. 4.88:1, white on it 4.88:1
  brandPressed: '#B8000F',
  brandTint: '#FDECEC', // notes, selected states; brandPressed text on it 6.04:1
  bg: '#FAF6F5', // warm off-white page
  surface: '#FFFFFF', // cards
  ink: '#1C1517', // primary text 16.7:1
  ink2: '#5E5456', // secondary text 6.8:1
  ink3: '#776C6E', // tertiary text / captions 4.7:1 on bg
  line: '#E9DFDE', // dividers (decorative only)
  inputBorder: '#8E8385', // 3.66:1, form-field boundary (1.4.11)
  star: '#C77700', // 3.46:1, rating stars (1.4.11)
  // Errors get their own hue + an icon so they never read as "brand red".
  danger: '#A3123A',
  dangerTint: '#FCE8EE',
  success: '#1E7B45',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }; // 4-pt grid

export const radius = { sm: 8, md: 14, pill: 999 };

// ~1.2 scale. Body 16 for legibility on phones and the web.
export const font = {
  caption: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  title: { fontSize: 19, lineHeight: 24, fontWeight: '700' as const },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '800' as const },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
};

export const MAX_WIDTH = 640; // keeps lines near 70 characters on desktop browsers
export const shadow = {
  shadowColor: '#5E1A1F',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};
