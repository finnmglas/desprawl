// owner: finn
// goal: where a package lives, and what a link to it looks like there

export const REGISTRIES: Record<string, { label: string; at: (name: string) => string }> = {
  npm: { label: "npm", at: (n) => `https://www.npmjs.com/package/${n}` },
  "crates.io": { label: "crates.io", at: (n) => `https://crates.io/crates/${n}` },
  PyPI: { label: "PyPI", at: (n) => `https://pypi.org/project/${n}/` },
  Maven: {
    label: "Maven Central",
    at: (n) => `https://central.sonatype.com/artifact/${n.replace(":", "/")}`,
  },
  Go: { label: "Go modules", at: (n) => `https://pkg.go.dev/${n}` },
  NuGet: { label: "NuGet", at: (n) => `https://www.nuget.org/packages/${n}` },
  RubyGems: { label: "RubyGems", at: (n) => `https://rubygems.org/gems/${n}` },
  Packagist: { label: "Packagist", at: (n) => `https://packagist.org/packages/${n}` },
  Pub: { label: "pub.dev", at: (n) => `https://pub.dev/packages/${n}` },
}

/** the manifest kind a chip came from, said as the registry it means */
/** where a package a file of this language asks for is published */
// prettier-ignore
export const REGISTRY_BY_LANG: Record<string, string> = {
  ts: "npm", rust: "crates.io", python: "PyPI", jvm: "Maven", go: "Go",
  csharp: "NuGet", ruby: "RubyGems", php: "Packagist", dart: "Pub",
}

export const REGISTRY_OF: Record<string, string> = {
  npm: "npm",
  cargo: "crates.io",
  python: "PyPI",
  gradle: "Maven",
  go: "Go",
  pub: "Pub",
  cmake: "",
}

export const linkTo = (name: string, registry = "npm"): string =>
  REGISTRIES[registry]?.at(name) ?? ""
