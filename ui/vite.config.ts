// owner: finn
// goal: self contained html, no server

import { readFileSync } from "node:fs"
import { join } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// fold the icon in after viteSingleFile, or the href is a placeholder
function inlineFavicon(): Plugin {
  return {
    name: "desprawl:inline-favicon",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const svg = readFileSync(join(import.meta.dirname, "brand/favicon.svg"), "utf8")
      const uri = `data:image/svg+xml;base64,${Buffer.from(
        svg.replace(/<!--[\s\S]*?-->/g, ""),
      ).toString("base64")}`

      for (const [name, out] of Object.entries(bundle)) {
        if (out.type !== "asset") continue
        if (/favicon.*\.svg$/.test(name)) delete bundle[name]
        else if (name.endsWith(".html"))
          out.source = String(out.source).replace(/href="[^"]*favicon[^"]*"/, `href="${uri}"`)
      }
    },
  }
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), viteSingleFile(), inlineFavicon()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
})
