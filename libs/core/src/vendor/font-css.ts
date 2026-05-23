// All font faces are sourced from Google Fonts under the SIL Open Font
// License (free for personal and commercial use, including embedding and
// redistribution). Replaces the previous mix of paid Adobe Typekit fonts
// (Sabon, FF Good, Gin) and a personal-use-only embedded Taroca binary.
//
// Family mapping (original → free OFL alternative):
//   Sabon         → EB Garamond
//   FF Good       → Barlow
//   FF Good Cond. → Barlow Condensed
//   Gin           → Cinzel
//   Taroca        → Ultra (a heavy slab-serif display face: uniformly
//                   thick strokes with chunky serifs, matching Taroca's
//                   billboard/poster look)

// Family name strings used in `fontFamily:` rules across components.
// Components MUST import these instead of hard-coding family names, so the
// component layer never references a face that has no matching @font-face.
export const SERIF = "'EB Garamond', serif";
export const SANS = "'Barlow', sans-serif";
export const SANS_CONDENSED = "'Barlow Condensed', sans-serif";
export const DISPLAY_CAPS = "'Cinzel', serif";
export const DISPLAY_TITLE = "'Ultra', serif";

export const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&family=Barlow:ital,wght@0,400;0,700;1,400;1,700&family=Barlow+Condensed:ital,wght@0,400;0,700;1,400;1,700&family=Cinzel:wght@400&family=Ultra&display=swap');
`;
