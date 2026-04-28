import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "O' Petit Frais",
    short_name: "O' Petit Frais",
    description: "Tableau de bord chiffre d'affaires",
    start_url: "/",
    display: "standalone",
    /** Même teinte que les icônes générées (`npm run icons:pwa`) : splash Android cohérent, pas de flash blanc */
    background_color: "#16a34a",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

