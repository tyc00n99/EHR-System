import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EVVora",
    short_name: "EVVora",
    description: "Clock in and out, record tasks and write the note.",
    start_url: "/clock",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // The user's EVVORA app icon. It carries its own padding on a light ground, so the same
    // file serves as the maskable icon without the mark being clipped by a round mask.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/evvora-icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
    ],
  };
}
