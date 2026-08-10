// owner: finn
// goal: self contained html, no server

import { readFileSync } from "node:fs"
import { join } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// viteSingleFile inlines js and css and leaves a linked icon as a sibling file,
// but view.ts copies index.html alone into a temp dir, so a sibling never
// follows it. Fold the icon into the html and drop the emitted copy. Runs after
// viteSingleFile, which is why it is enforce post and last in the list: before
// that, the href is still an unresolved asset placeholder. Dev is untouched,
// there the plain href resolves off disk.
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
