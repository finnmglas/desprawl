// owner: finn
// goal: the thing a repo is built on comes before the thing it sprinkles on top

/** lower is more structural. Anything unlisted sits in the middle */
// prettier-ignore
const RANK: Record<string, number> = {
  // what the app is: a meta framework, then the library under it, then the server
  "Next.js": 0, Nuxt: 0, SvelteKit: 0, Remix: 0, Astro: 0, RedwoodJS: 0, "TanStack Start": 0,
  Angular: 0, Gatsby: 0, Vike: 0, Quasar: 0, Expo: 0, "React Native": 0, Electron: 0, Tauri: 0,
  React: 1, Vue: 1, Svelte: 1, Solid: 1, Preact: 1, Qwik: 1,
  Express: 2, Fastify: 2, NestJS: 2, Hono: 2, Koa: 2, Elysia: 2, hapi: 2, AdonisJS: 2,
  Nitro: 2, h3: 2, Feathers: 2, restify: 2, polka: 2, Strapi: 2, Medusa: 2, Keystone: 2,

  // ui: a design system, then primitives, then the styling engine, then helpers and widgets
  shadcn: 0, MUI: 0, "Ant Design": 0, Chakra: 0, Mantine: 0, HeroUI: 0, NextUI: 0, Fluent: 0,
  Carbon: 0, Blueprint: 0, Bootstrap: 0, Vuetify: 0, Ionic: 0, daisyUI: 0, PrimeReact: 0,
  "Base UI": 1, Radix: 1, "Headless UI": 1, "React Aria": 1, Ariakit: 1, DiceUI: 1,
  Tailwind: 1.5, Panda: 1.5, "styled-components": 1.5, Emotion: 1.5, Sass: 1.5, Less: 1.5,
  Stylus: 1.5, UnoCSS: 1.5, "vanilla-extract": 1.5, Stitches: 1.5, Linaria: 1.5, "styled-jsx": 1.5,
  PostCSS: 3, cva: 3, clsx: 3, classnames: 3, "tailwind-variants": 3,
  cmdk: 4, Sonner: 4, Vaul: 4, Embla: 4, "dnd kit": 4, "TanStack Table": 4, "AG Grid": 4,
  Motion: 5, GSAP: 5, "React Spring": 5,
  "Floating UI": 2.5, Monaco: 2, Tiptap: 2, CodeMirror: 2, Lexical: 2,
  "React Hook Form": 2, "TanStack Form": 2, "TanStack Virtual": 4, "next-themes": 5, Fontsource: 6,
  Lucide: 6, Tabler: 6, Phosphor: 6, "React Icons": 6,

  // visuals: the engine, then what is drawn with it
  "three.js": 0, "React Three Fiber": 0, PixiJS: 0, Konva: 0, D3: 1, "deck.gl": 1,
  Mapbox: 1, MapLibre: 1, Leaflet: 1, Recharts: 2, "Chart.js": 2, ECharts: 2, Plotly: 2,
  nivo: 2, visx: 2, Victory: 2, Cytoscape: 2, dagre: 3, Turf: 3,

  // content: the pipeline before the pieces that decorate it
  Fumadocs: 0, Nextra: 0, Docusaurus: 0, VitePress: 0, Velite: 0, Contentlayer: 0,
  Sanity: 1, Contentful: 1, Storyblok: 1, Payload: 1, Prismic: 1, Keystatic: 1, TinaCMS: 1,
  MDX: 2, i18n: 2, Storybook: 2, remark: 3, rehype: 3, "gray-matter": 3,
  Shiki: 4, Prism: 4, "highlight.js": 4, marked: 4,

  // data: the store first, then the client, then the odd service
  Postgres: 0, MySQL: 0, SQLite: 0, MongoDB: 0, Redis: 0, Convex: 0, Supabase: 0, Firebase: 0,
  Neon: 0, PlanetScale: 0, "Vercel Postgres": 0, Upstash: 0, libSQL: 0,
  Prisma: 1, Drizzle: 1, Kysely: 1, TypeORM: 1, Sequelize: 1, Knex: 1, Mongoose: 1,
  GraphQL: 2, tRPC: 2, Apollo: 2, "Socket.IO": 2, WebSocket: 2,
  axios: 3, ky: 3, got: 3, "node-fetch": 3, ofetch: 3,

  // build: the bundler, then the monorepo tool, then the release and hook plumbing
  Vite: 0, webpack: 0, Turbopack: 0, Rspack: 0, Rolldown: 0, esbuild: 0, Rollup: 0, Parcel: 0,
  Turborepo: 1, Nx: 1, Lerna: 1, Make: 1, just: 1, Task: 1,
  tsup: 2, unbuild: 2, tsdown: 2, bunchee: 2, microbundle: 2, SWC: 2, Babel: 2,
  Changesets: 3, "semantic-release": 3, "release-it": 3, Husky: 4, "lint-staged": 4,
  commitlint: 4, "simple-git-hooks": 4, TypeDoc: 4,

  // hosting: the platform it deploys to, then the cluster it lands in
  Vercel: 0, Netlify: 0, Cloudflare: 0, "Fly.io": 0, Railway: 0, Render: 0, Heroku: 0,
  AWS: 1, "Google Cloud": 1, Azure: 1, Hetzner: 1, DigitalOcean: 1, Scaleway: 1,
  Kubernetes: 2, CapRover: 2, "Platform.sh": 2, "GitHub Pages": 2,
}

/** stable: equal ranks keep the order they were detected in */
export const byWeight = (items: string[]): string[] =>
  items
    .map((label, i) => ({
      label,
      i,
      rank: RANK[label.replace(/\s+\S+$/, "")] ?? RANK[label] ?? 3.5,
    }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((entry) => entry.label)
