import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The app's own faces for printed documents: Charter for the Daily Service Note and its summary,
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
  // Bitstream Charter (permissive Bitstream licence, via charter-webfont, converted to TTF):
  // designed to print well on low-resolution printers, which is exactly what a service note meets.
  Font.register({
    family: "Charter",
    fonts: [
      { src: path.join(dir, "Charter-regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Charter-italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(dir, "Charter-bold.ttf"), fontWeight: 700 },
      { src: path.join(dir, "Charter-bold-italic.ttf"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  Font.register({ family: "Great Vibes", src: path.join(dir, "GreatVibes-Regular.ttf") });
  // Keep words whole; the defaults hyphenate aggressively in narrow cells.
  Font.registerHyphenationCallback((word) => [word]);
}
