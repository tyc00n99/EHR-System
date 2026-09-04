import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The app's own faces for printed documents: Public Sans for text, Fraunces for signatures and
 * display, Inconsolata for numbers, Great Vibes for signatures. Files live in src/fonts and are traced into the serverless
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
  Font.register({ family: "Great Vibes", src: path.join(dir, "GreatVibes-Regular.ttf") });
  // Keep words whole; the defaults hyphenate aggressively in narrow cells.
  Font.registerHyphenationCallback((word) => [word]);
}
