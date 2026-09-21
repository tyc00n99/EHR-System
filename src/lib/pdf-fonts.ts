import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The app's own faces for printed documents: Geist (the screen face) for the Daily Service Note,
 * Public Sans / Fraunces / Inconsolata / EB Garamond for the other reports, Great Vibes for signatures. Files live in src/fonts and are traced into the serverless
 * bundle by next.config (outputFileTracingIncludes). Registration is idempotent.
 */
const dir = path.join(process.cwd(), "src", "fonts");
let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Public Sans",
    fonts: [
      { src: path.join(dir, "PublicSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "PublicSans-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "PublicSans-Medium.ttf"), fontWeight: 500 },
      { src: path.join(dir, "PublicSans-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(dir, "PublicSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: path.join(dir, "Fraunces9pt-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Fraunces9pt-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "Fraunces9pt-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Inconsolata",
    fonts: [
      { src: path.join(dir, "Inconsolata-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Inconsolata-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "EB Garamond",
    fonts: [
      { src: path.join(dir, "EBGaramond-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "EBGaramond-400i.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "EBGaramond-500.ttf"), fontWeight: 500 },
      { src: path.join(dir, "EBGaramond-600.ttf"), fontWeight: 600 },
      { src: path.join(dir, "EBGaramond-700.ttf"), fontWeight: 700 },
    ],
  });
  // Geist, the app's screen face, for the Daily Service Note (user, Sept 21: "same font as the
  // website"). Static WOFF cuts: the renderer cannot read the variable WOFF2 the site uses.
  Font.register({
    family: "Geist",
    fonts: [
      { src: path.join(dir, "Geist-400.woff"), fontWeight: 400 },
      { src: path.join(dir, "Geist-500.woff"), fontWeight: 500 },
      { src: path.join(dir, "Geist-600.woff"), fontWeight: 600 },
      { src: path.join(dir, "Geist-700.woff"), fontWeight: 700 },
    ],
  });
  Font.register({ family: "Great Vibes", src: path.join(dir, "GreatVibes-Regular.ttf") });
  // Keep words whole; the defaults hyphenate aggressively in narrow cells.
  Font.registerHyphenationCallback((word) => [word]);
}
