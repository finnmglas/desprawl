// owner: finn
// goal: the lookup tables saying what a dependency or a marker file means

import type { Stack } from "../read/model.ts"

/** A dependency name, or a prefix ending in /, mapped to the label it implies. */
export type Table = Record<string, string>

// prettier-ignore
export const FRAMEWORKS: Table = {
  react: "React", "react-dom": "React", next: "Next.js", nuxt: "Nuxt", vue: "Vue",
  svelte: "Svelte", "@sveltejs/kit": "SvelteKit", "@angular/core": "Angular", "solid-js": "Solid",
  astro: "Astro", "@remix-run/react": "Remix", preact: "Preact", "react-native": "React Native",
  expo: "Expo", electron: "Electron", "@tauri-apps/api": "Tauri", gatsby: "Gatsby",
  express: "Express", fastify: "Fastify", "@nestjs/core": "NestJS", koa: "Koa", hono: "Hono",
  "@hapi/hapi": "hapi", "aws-lambda": "Lambda",
  "@builder.io/qwik": "Qwik", "@redwoodjs/core": "RedwoodJS", "@adonisjs/core": "AdonisJS",
  "@strapi/strapi": "Strapi", "@medusajs/medusa": "Medusa", "@keystone-6/core": "Keystone",
  elysia: "Elysia", h3: "h3", nitropack: "Nitro", "@capacitor/core": "Capacitor",
  quasar: "Quasar", vike: "Vike", "@tanstack/react-start": "TanStack Start",
  "@feathersjs/feathers": "Feathers", restify: "restify", polka: "polka",
}

// prettier-ignore
export const STATE: Table = {
  zustand: "Zustand", redux: "Redux", "@reduxjs/toolkit": "Redux Toolkit", mobx: "MobX",
  jotai: "Jotai", recoil: "Recoil", valtio: "Valtio", xstate: "XState", pinia: "Pinia",
  "@tanstack/react-query": "TanStack Query", "@tanstack/query-core": "TanStack Query",
  swr: "SWR", "apollo-client": "Apollo", "@apollo/client": "Apollo", effector: "Effector",
  "@ngrx/store": "NgRx", vuex: "Vuex", nanostores: "Nano Stores",
  immer: "Immer", "redux-saga": "Redux Saga", rxjs: "RxJS", "@preact/signals": "Signals",
  "@legendapp/state": "Legend State", "@tanstack/store": "TanStack Store",
  "react-hook-form": "React Hook Form", "@hookform/": "React Hook Form",
  "@tanstack/react-form": "TanStack Form",
}

// prettier-ignore
export const UI: Table = {
  tailwindcss: "Tailwind", "@mui/material": "MUI", antd: "Ant Design", "@chakra-ui/react": "Chakra",
  bootstrap: "Bootstrap", "react-bootstrap": "Bootstrap", "@radix-ui/": "Radix",
  "@base-ui/react": "Base UI", "@headlessui/react": "Headless UI", daisyui: "daisyUI",
  "@mantine/core": "Mantine", "styled-components": "styled-components", "@emotion/react": "Emotion",
  bulma: "Bulma", primereact: "PrimeReact", "@diceui/": "DiceUI", "class-variance-authority": "cva",
  "@nextui-org/react": "NextUI", vuetify: "Vuetify", "@ionic/react": "Ionic",
  "@heroui/react": "HeroUI", "@ariakit/react": "Ariakit", "@base-ui-components/react": "Base UI",
  "@fluentui/react-components": "Fluent", "@carbon/react": "Carbon", "@blueprintjs/core": "Blueprint",
  "react-aria-components": "React Aria", "lucide-react": "Lucide", "react-icons": "React Icons",
  "@tabler/icons-react": "Tabler", "@phosphor-icons/react": "Phosphor", "framer-motion": "Motion",
  motion: "Motion", "@react-spring/web": "React Spring", gsap: "GSAP", cmdk: "cmdk",
  sonner: "Sonner", vaul: "Vaul", "@dnd-kit/core": "dnd kit", "@tanstack/react-table": "TanStack Table",
  "ag-grid-react": "AG Grid", "embla-carousel-react": "Embla",
  "radix-ui": "Radix", shadcn: "shadcn", "@dnd-kit/": "dnd kit", "@floating-ui/": "Floating UI",
  "@tiptap/": "Tiptap", "@codemirror/": "CodeMirror", "@lexical/": "Lexical",
  "@monaco-editor/react": "Monaco", "@tanstack/react-virtual": "TanStack Virtual",
  "next-themes": "next-themes", "@fontsource": "Fontsource",
}

// prettier-ignore
export const CONNECTS: Table = {
  axios: "axios", ky: "ky", got: "got", "node-fetch": "node-fetch", ofetch: "ofetch",
  convex: "Convex", "@prisma/client": "Prisma", "drizzle-orm": "Drizzle", mongoose: "Mongoose",
  pg: "Postgres", mysql2: "MySQL", "better-sqlite3": "SQLite", redis: "Redis", ioredis: "Redis",
  "@supabase/supabase-js": "Supabase", firebase: "Firebase", "firebase-admin": "Firebase",
  "@directus/sdk": "Directus", "@trpc/client": "tRPC", "@trpc/server": "tRPC", graphql: "GraphQL",
  socket: "sockets", "socket.io": "Socket.IO", ws: "WebSocket", "@aws-sdk/client-s3": "S3",
  stripe: "Stripe", "@sentry/node": "Sentry", "@sentry/react": "Sentry", openai: "OpenAI",
  "@anthropic-ai/sdk": "Anthropic",
  kysely: "Kysely", typeorm: "TypeORM", sequelize: "Sequelize", knex: "Knex",
  "@libsql/client": "libSQL", "@neondatabase/serverless": "Neon", "@planetscale/database": "PlanetScale",
  "@vercel/postgres": "Vercel Postgres", "@upstash/redis": "Upstash", mongodb: "MongoDB",
  "@elastic/elasticsearch": "Elasticsearch", meilisearch: "Meilisearch", algoliasearch: "Algolia",
  nodemailer: "Nodemailer", resend: "Resend", "@sendgrid/mail": "SendGrid", twilio: "Twilio",
  "@slack/web-api": "Slack", "discord.js": "Discord", ai: "AI SDK", "@ai-sdk/openai": "AI SDK",
  langchain: "LangChain", "@langchain/core": "LangChain", llamaindex: "LlamaIndex",
  ollama: "Ollama", "@google/generative-ai": "Gemini", "@mistralai/mistralai": "Mistral",
  replicate: "Replicate", "@huggingface/inference": "Hugging Face", "@lemonsqueezy/lemonsqueezy.js": "Lemon Squeezy",
  "launchdarkly-js-client-sdk": "LaunchDarkly", "@unleash/proxy-client-react": "Unleash",
  "@growthbook/growthbook": "GrowthBook", "@statsig/js-client": "Statsig",
  "@ai-sdk/": "AI SDK", "@convex-dev/": "Convex", "@clerk/": "Clerk", "@google-cloud/": "Google Cloud",
  "@aws-sdk/": "AWS", "@azure/": "Azure", "@crowdin/cli": "Crowdin", "@hcaptcha/react-hcaptcha": "hCaptcha",
}

// prettier-ignore
export const TESTING: Table = {
  vitest: "Vitest", jest: "Jest", mocha: "Mocha", "@playwright/test": "Playwright",
  cypress: "Cypress", "@testing-library/react": "Testing Library", ava: "AVA",
  jasmine: "Jasmine", karma: "Karma", supertest: "supertest", pytest: "pytest",
  msw: "MSW", nock: "nock", sinon: "Sinon", chai: "Chai", puppeteer: "Puppeteer",
  webdriverio: "WebdriverIO", "selenium-webdriver": "Selenium", testcafe: "TestCafe",
  "@stryker-mutator/core": "Stryker", "fast-check": "fast-check", "@faker-js/faker": "Faker",
  k6: "k6", artillery: "Artillery", autocannon: "autocannon", c8: "c8", nyc: "nyc",
}

// prettier-ignore
export const BUILDERS: Table = {
  vite: "Vite", webpack: "webpack", rollup: "Rollup", esbuild: "esbuild", parcel: "Parcel",
  turbo: "Turborepo", nx: "Nx", lerna: "Lerna", tsup: "tsup", rspack: "Rspack",
  "@swc/core": "SWC", babel: "Babel", "@babel/core": "Babel", gulp: "Gulp", grunt: "Grunt",
  unbuild: "unbuild", tsdown: "tsdown", bunchee: "bunchee", microbundle: "microbundle",
  rolldown: "Rolldown", "@changesets/cli": "Changesets", "semantic-release": "semantic-release",
  "release-it": "release-it", husky: "Husky", "lint-staged": "lint-staged",
  "@commitlint/cli": "commitlint", "simple-git-hooks": "simple-git-hooks", typedoc: "TypeDoc",
}

// prettier-ignore
export const LINTERS: Table = {
  eslint: "ESLint", "@biomejs/biome": "Biome", oxlint: "oxlint", tslint: "TSLint (dead)",
  standard: "standard", xo: "xo", stylelint: "Stylelint",
  knip: "Knip", depcheck: "depcheck", madge: "Madge", "dependency-cruiser": "dependency-cruiser",
  "ts-prune": "ts-prune", publint: "publint", "@arethetypeswrong/cli": "are the types wrong",
  syncpack: "syncpack", sherif: "Sherif",
  "eslint-config-next": "ESLint", "@eslint/eslintrc": "ESLint", gitleaks: "Gitleaks",
}

// prettier-ignore
export const FORMATTERS: Table = { prettier: "Prettier", "@biomejs/biome": "Biome", oxfmt: "oxfmt", dprint: "dprint" , "@ianvs/prettier-plugin-sort-imports": "Prettier" }

// prettier-ignore
export const RUNTIME: Table = {
  "@types/node": "Node", "bun-types": "Bun", "@cloudflare/workers-types": "Workers",
  "@deno/types": "Deno", "@types/aws-lambda": "Lambda", wrangler: "Workers",
  "@types/bun": "Bun", "@vercel/node": "Vercel", "@netlify/functions": "Netlify",
  "firebase-functions": "Firebase", "aws-cdk-lib": "AWS CDK", sst: "SST", serverless: "Serverless",
  "@pulumi/pulumi": "Pulumi",
}

// prettier-ignore
export const STYLING: Table = {
  sass: "Sass", less: "Less", stylus: "Stylus", postcss: "PostCSS", autoprefixer: "PostCSS",
  "@vanilla-extract/css": "vanilla-extract", "unocss": "UnoCSS", "tailwind-merge": "Tailwind",
  clsx: "clsx", classnames: "classnames",
  "@pandacss/dev": "Panda", "@stitches/react": "Stitches", "@linaria/core": "Linaria",
  "styled-jsx": "styled-jsx", "tailwind-variants": "tailwind-variants",
  "@tailwindcss/postcss": "Tailwind", "tw-animate-css": "Tailwind",
}

// prettier-ignore
export const CONTENT: Table = {
  "next-intl": "i18n", "react-i18next": "i18n", i18next: "i18n", "vue-i18n": "i18n",
  "@lingui/core": "i18n", "next-mdx-remote": "MDX", "@mdx-js/react": "MDX",
  contentlayer: "Contentlayer", "@sanity/client": "Sanity", "contentful": "Contentful",
  storyblok: "Storyblok", "@storybook/react": "Storybook", "@payloadcms/next": "Payload",
  velite: "Velite", "fumadocs-core": "Fumadocs", nextra: "Nextra", "@docusaurus/core": "Docusaurus",
  vitepress: "VitePress", "@keystatic/core": "Keystatic", tinacms: "TinaCMS",
  "@prismicio/client": "Prismic", "gray-matter": "gray-matter", remark: "remark", rehype: "rehype",
  shiki: "Shiki", prismjs: "Prism", "highlight.js": "highlight.js", marked: "marked",
}

// prettier-ignore
export const VISUALS: Table = {
  "@react-three/": "React Three Fiber", three: "three.js", "@turf/": "Turf", d3: "D3",
  "d3-force": "D3", dagre: "dagre", cytoscape: "Cytoscape", "chart.js": "Chart.js",
  echarts: "ECharts", recharts: "Recharts", "@nivo/core": "nivo", "@visx/visx": "visx",
  victory: "Victory", "plotly.js": "Plotly", konva: "Konva", "pixi.js": "PixiJS",
  "mapbox-gl": "Mapbox", "maplibre-gl": "MapLibre", leaflet: "Leaflet", "@deck.gl/core": "deck.gl",
}

// prettier-ignore
export const OBSERVE: Table = {
  "@sentry/nextjs": "Sentry", posthog: "PostHog", "posthog-js": "PostHog",
  "@vercel/analytics": "Vercel Analytics", "@vercel/speed-insights": "Vercel Analytics",
  "@datadog/browser-rum": "Datadog", "@opentelemetry/api": "OpenTelemetry", mixpanel: "Mixpanel",
  "@amplitude/analytics-browser": "Amplitude", pino: "pino", winston: "winston",
  "@bugsnag/js": "Bugsnag", rollbar: "Rollbar", "logrocket": "LogRocket", newrelic: "New Relic",
  "prom-client": "Prometheus", "@axiomhq/js": "Axiom", "@grafana/faro-web-sdk": "Grafana Faro",
  consola: "consola", loglevel: "loglevel", debug: "debug",
}

// prettier-ignore
export const AUTH: Table = {
  "next-auth": "NextAuth", "@auth/core": "Auth.js", "@clerk/nextjs": "Clerk",
  "@auth0/auth0-react": "Auth0", passport: "Passport", jsonwebtoken: "JWT", jose: "JWT",
  "@supabase/auth-helpers-nextjs": "Supabase Auth", lucia: "Lucia", bcrypt: "bcrypt",
  "better-auth": "Better Auth", "@workos-inc/node": "WorkOS", "@kinde-oss/kinde-auth-nextjs": "Kinde",
  "openid-client": "OpenID", argon2: "argon2", "@node-rs/argon2": "argon2", "iron-session": "iron session",
  "@stytch/nextjs": "Stytch", "keycloak-js": "Keycloak", "@propelauth/react": "PropelAuth",
}

// every dependency table, and the field it fills
// prettier-ignore
export const TABLES: [string, Table][] = [
  ["frameworks", FRAMEWORKS], ["state", STATE], ["ui", UI], ["connects", CONNECTS],
  ["testing", TESTING], ["build", BUILDERS], ["runtimes", RUNTIME], ["styling", STYLING],
  ["content", CONTENT], ["visuals", VISUALS], ["observability", OBSERVE], ["auth", AUTH], ["linters", LINTERS],
  ["formatters", FORMATTERS],
]

/** its presence names the host */
// prettier-ignore
export const HOSTED: [RegExp, string][] = [
  [/^(.*\/)?vercel\.json$/, "Vercel"],
  [/^(.*\/)?netlify\.toml$/, "Netlify"],
  [/^(.*\/)?wrangler\.(toml|jsonc?)$/, "Cloudflare"],
  [/^(.*\/)?fly\.toml$/, "Fly.io"],
  [/^(.*\/)?railway\.(json|toml)$/, "Railway"],
  [/^(.*\/)?render\.ya?ml$/, "Render"],
  [/^(.*\/)?Procfile$/, "Heroku"],
  [/^(.*\/)?heroku\.ya?ml$/, "Heroku"],
  [/^(.*\/)?firebase\.json$/, "Firebase"],
  [/^(.*\/)?amplify\.ya?ml$/, "AWS"],
  [/^(.*\/)?samconfig\.toml$/, "AWS"],
  [/^(.*\/)?cdk\.json$/, "AWS"],
  [/^(.*\/)?sst\.config\.[cm]?ts$/, "AWS"],
  [/^(.*\/)?\.platform\.app\.ya?ml$/, "Platform.sh"],
  [/^(.*\/)?captain-definition$/, "CapRover"],
  [/^\.do\/(app|deploy)\.ya?ml$/, "DigitalOcean"],
  [/^(.*\/)?supabase\/config\.toml$/, "Supabase"],
  [/^(.*\/)?[\w.-]*cloudbuild[\w.-]*\.ya?ml$/, "Google Cloud"],
  [/^(.*\/)?\.gcloudignore$/, "Google Cloud"],
  [/^(.*\/)?buildspec[\w.-]*\.ya?ml$/, "AWS"],
  [/^(.*\/)?appspec\.(ya?ml|json)$/, "AWS"],
  [/^\.ebextensions\//, "AWS"],
  [/^(.*\/)?staticwebapp\.config\.json$/, "Azure"],
  [/^(.*\/)?skaffold\.ya?ml$/, "Kubernetes"],
]

/** a name half the world uses, so each says what it is */
// prettier-ignore
export const AMBIGUOUS: [RegExp, RegExp, string][] = [
  [/^(.*\/)?app\.ya?ml$/, /^\s*runtime:\s*\S/m, "Google Cloud"],
  [/^(.*\/)?template\.ya?ml$/, /AWSTemplateFormatVersion|Transform:\s*(-\s*)?AWS::Serverless/, "AWS"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*aws\b/, "AWS"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*google\b/, "Google Cloud"],
  [/^(.*\/)?serverless\.ya?ml$/, /name:\s*azure\b/, "Azure"],
]

/** what a terraform provider, a workflow step or a registry says about the target */
// prettier-ignore
export const DEPLOYS: [RegExp, string][] = [
  [/provider\s+"aws"|aws-actions\/|\bamazonaws\.com|\baws\s+(s3|ecs|lambda|ecr)\b/, "AWS"],
  [/provider\s+"google"|google-github-actions\/|\bgcr\.io|-docker\.pkg\.dev|\bgcloud\s/, "Google Cloud"],
  [/provider\s+"azurerm"|azure\/login|\bazurecr\.io|\baz\s+(webapp|containerapp)\b/, "Azure"],
  [/provider\s+"hcloud"|hetznercloud\/|\bhcloud\s/, "Hetzner"],
  [/provider\s+"digitalocean"|digitalocean\/action|registry\.digitalocean\.com|\bdoctl\s/, "DigitalOcean"],
  [/provider\s+"scaleway"|\bscw\s/, "Scaleway"],
  [/cloudflare\/wrangler-action|\bwrangler\s+(deploy|publish)/, "Cloudflare"],
  [/amondnet\/vercel-action|vercel\/action|\bvercel\s+(deploy|--prod)/, "Vercel"],
  [/nwtgck\/actions-netlify|netlify\/actions|\bnetlify\s+deploy/, "Netlify"],
  [/superfly\/flyctl|\bflyctl?\s+deploy/, "Fly.io"],
  [/bervProject\/railway|\brailway\s+up/, "Railway"],
  [/johnbeynon\/render-deploy|api\.render\.com/, "Render"],
  [/akhileshns\/heroku-deploy|\bgit\s+push\s+heroku/, "Heroku"],
  [/actions\/deploy-pages|peaceiris\/actions-gh-pages/, "GitHub Pages"],
  [/firebase-tools|FirebaseExtended\/action-hosting-deploy|\bfirebase\s+deploy/, "Firebase"],
  [/\bkubectl\s+apply|azure\/k8s-deploy|helm\s+upgrade/, "Kubernetes"],
]

/** a package that only works on one platform. An ignored link folder is not evidence */
// prettier-ignore
export const PLATFORM: Table = {
  "@vercel/analytics": "Vercel", "@vercel/speed-insights": "Vercel", "@vercel/blob": "Vercel",
  "@vercel/kv": "Vercel", "@vercel/postgres": "Vercel", "@vercel/edge-config": "Vercel",
  "@vercel/og": "Vercel", "@vercel/functions": "Vercel", "@netlify/blobs": "Netlify",
  "@netlify/edge-functions": "Netlify", "@cloudflare/next-on-pages": "Cloudflare",
  "@cloudflare/workers-types": "Cloudflare", "@opennextjs/cloudflare": "Cloudflare",
  "@aws-sdk/client-lambda": "AWS", "@azure/static-web-apps-cli": "Azure",
}

/** what it is built into besides a page: the platform packages say which */
// prettier-ignore
export const BUILT_FOR: Table = {
  "@capacitor/android": "Android", "@capacitor/ios": "iOS", "@capacitor/electron": "Desktop",
  "cordova-android": "Android", "cordova-ios": "iOS",
  "react-native": "Android,iOS", "expo": "Android,iOS",
  "react-native-macos": "macOS", "react-native-windows": "Windows",
  "electron": "Desktop", "@tauri-apps/cli": "Desktop", "nw": "Desktop",
  "@lynx-js/rspeedy": "Android,iOS",
}

/** only there once a shell was really added */
// prettier-ignore
export const NATIVE: [RegExp, string][] = [
  [/(^|\/)android\/(app\/)?build\.gradle(\.kts)?$/, "Android"],
  [/(^|\/)ios\/[^/]+\.xcodeproj\//, "iOS"],
  [/(^|\/)ios\/Podfile$/, "iOS"],
  [/(^|\/)macos\/[^/]+\.xcodeproj\//, "macOS"],
  [/(^|\/)windows\/[^/]+\.sln$/, "Windows"],
  [/(^|\/)src-tauri\/tauri\.conf\.json$/, "Desktop"],
]

/** its whole job is putting this repo somewhere */
// prettier-ignore
export const SHIPS: Table = {
  vercel: "Vercel", wrangler: "Cloudflare", "netlify-cli": "Netlify",
  "@netlify/functions": "Netlify", "firebase-tools": "Firebase", sst: "AWS", serverless: "AWS",
  "aws-cdk-lib": "AWS", "@aws-amplify/backend": "AWS", "@google-cloud/functions-framework": "Google Cloud",
  "@azure/functions": "Azure", "@railway/cli": "Railway",
}

/** Marker files, matched on the full path or the basename. */
// prettier-ignore
export const FILES: [RegExp, keyof Stack | "lock" | "docker" | "compose" | "k8s" | "terraform" | "workspaces", string][] = [
  [/^(.*\/)?pnpm-lock\.yaml$/, "lock", "pnpm"],
  [/^(.*\/)?package-lock\.json$/, "lock", "npm"],
  [/^(.*\/)?yarn\.lock$/, "lock", "yarn"],
  [/^(.*\/)?bun\.lockb?$/, "lock", "bun"],
  [/^(.*\/)?shrinkwrap\.json$/, "lock", "npm shrinkwrap"],
  [/^(.*\/)?[Mm]akefile$/, "build", "Make"],
  [/^(.*\/)?[Jj]ustfile$/, "build", "just"],
  [/^(.*\/)?Taskfile\.ya?ml$/, "build", "Task"],
  [/^(.*\/)?turbo\.json$/, "build", "Turborepo"],
  [/^(.*\/)?nx\.json$/, "build", "Nx"],
  [/^(.*\/)?Rakefile$/, "build", "Rake"],
  [/^\.github\/workflows\/.+\.ya?ml$/, "ci", "GitHub Actions"],
  [/^\.gitlab-ci\.ya?ml$/, "ci", "GitLab CI"],
  [/^(.*\/)?Jenkinsfile$/, "ci", "Jenkins"],
  [/^\.circleci\/config\.ya?ml$/, "ci", "CircleCI"],
  [/^\.travis\.ya?ml$/, "ci", "Travis"],
  [/^(.*\/)?azure-pipelines\.ya?ml$/, "ci", "Azure Pipelines"],
  [/^(.*\/)?\.drone\.ya?ml$/, "ci", "Drone"],
  [/^(.*\/)?vercel\.json$/, "ci", "Vercel"],
  [/^(.*\/)?netlify\.toml$/, "ci", "Netlify"],
  [/^(.*\/)?[Dd]ockerfile(\..+)?$/, "docker", "Dockerfile"],
  [/^(.*\/)?docker-compose(\..+)?\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?compose\.ya?ml$/, "compose", "compose"],
  [/^(.*\/)?.+\.tf$/, "terraform", "terraform"],
  [/^(.*\/)?(k8s|kubernetes|manifests|helm|charts)\/.+\.ya?ml$/, "k8s", "kubernetes"],
  [/^(.*\/)?Chart\.ya?ml$/, "k8s", "helm"],
  [/^(.*\/)?.+\.bru$/, "apis", "Bruno"],
  [/^(.*\/)?.+\.postman_collection\.json$/, "apis", "Postman"],
  [/^(.*\/)?.+\.insomnia\.json$/, "apis", "Insomnia"],
  [/^(.*\/)?.+\.http$/, "apis", "REST client"],
  [/^(.*\/)?openapi\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?swagger\.(ya?ml|json)$/, "apis", "OpenAPI"],
  [/^(.*\/)?components\.json$/, "ui", "shadcn"],
  [/^(.*\/)?\.gitleaks\.toml$/, "linters", "Gitleaks"],
  [/^(.*\/)?\.pre-commit-config\.ya?ml$/, "linters", "pre-commit"],
  [/^(.*\/)?velite\.config\.[cm]?ts$/, "content", "Velite"],
  [/^pnpm-workspace\.ya?ml$/, "workspaces", "pnpm"],
  [/^(.*\/)?tsconfig(\..+)?\.json$/, "typescript", "tsconfig"],
]

/** Instruction and config files an ai coding tool leaves behind. */
// prettier-ignore
export const AGENTS: [RegExp, string][] = [
  [/^(.*\/)?CLAUDE\.(md|local\.md)$|^(.*\/)?\.claude\//, "Claude Code"],
  [/^(.*\/)?AGENTS\.md$/, "AGENTS.md"],
  [/^(.*\/)?\.cursorrules$|^(.*\/)?\.cursor(rules)?\//, "Cursor"],
  [/^\.github\/copilot-instructions\.md$|^\.github\/instructions\//, "Copilot"],
  [/^(.*\/)?\.aider(\..+)?$|^(.*\/)?CONVENTIONS\.md$/, "aider"],
  [/^(.*\/)?\.windsurfrules$|^(.*\/)?\.windsurf\//, "Windsurf"],
  [/^(.*\/)?\.clinerules(\/.*)?$/, "Cline"],
  [/^(.*\/)?\.roo(rules|modes)?(\/.*)?$/, "Roo"],
  [/^(.*\/)?\.continue\//, "Continue"],
  [/^(.*\/)?GEMINI\.md$|^(.*\/)?\.gemini\//, "Gemini CLI"],
  [/^(.*\/)?AGENT\.md$|^(.*\/)?\.amp\//, "Amp"],
  [/^(.*\/)?\.codex\/|^(.*\/)?codex\.md$/i, "Codex"],
  [/^(.*\/)?\.junie\//, "Junie"],
  [/^(.*\/)?\.kiro\//, "Kiro"],
  [/^(.*\/)?\.goosehints$|^(.*\/)?\.goose\//, "Goose"],
  [/^(.*\/)?\.devin\//, "Devin"],
  [/^(.*\/)?\.amazonq\//, "Amazon Q"],
  [/^(.*\/)?\.augment(-guidelines)?(\/.*)?$/, "Augment"],
  [/^(.*\/)?\.sourcegraph\/|^(.*\/)?\.cody\//, "Cody"],
  [/^(.*\/)?\.specstory\//, "SpecStory"],
  [/^(.*\/)?\.?mcp\.json$|^(.*\/)?\.mcp\//, "MCP"],
  [/^(.*\/)?llms(-full)?\.txt$/, "llms.txt"],
  [/^(.*\/)?\.ai-?(rules|instructions)(\..+)?$/, "house rules"],
]

/** What an ai calls itself in a trailer or an author line. */
// prettier-ignore
export const SIGNERS: [RegExp, string][] = [
  [/claude/i, "Claude Code"], [/cursor/i, "Cursor"], [/copilot/i, "Copilot"],
  [/devin/i, "Devin"], [/aider/i, "aider"], [/codex|chatgpt|openai/i, "Codex"],
  [/gemini|jules/i, "Gemini CLI"], [/windsurf|codeium/i, "Windsurf"], [/cline/i, "Cline"],
  [/openhands|opendevin/i, "OpenHands"], [/\bamp\b|sourcegraph/i, "Amp"], [/\bcody\b/i, "Cody"],
  [/coderabbit/i, "CodeRabbit"], [/sweep-ai|sweepai/i, "Sweep"], [/tabnine/i, "Tabnine"],
  [/amazon ?q|codewhisperer/i, "Amazon Q"], [/roo ?code/i, "Roo"], [/kiro/i, "Kiro"],
  [/goose/i, "Goose"], [/augment/i, "Augment"], [/factory\.ai|droid/i, "Factory"],
  [/antigravity/i, "Antigravity"], [/continue\.dev/i, "Continue"], [/junie/i, "Junie"],
]
