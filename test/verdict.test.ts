// owner: finn
// goal: a licence lands in the family it asks for

import assert from "node:assert/strict"
import test from "node:test"
import { familyOf } from "../src/facts/licence.ts"

test("the families every licence sorts into", () => {
  for (const [said, want] of [
    ["MIT", "permissive"],
    ["The MIT License", "permissive"],
    ["Apache-2.0", "permissive"],
    ["BSD 3-Clause", "permissive"],
    ["CC-BY-4.0", "permissive"],
    ["OFL-1.1", "permissive"],
    ["BSL-1.0", "permissive"],
    ["LGPL-3.0", "weak"],
    ["MPL-2.0", "weak"],
    ["CC-BY-SA-4.0", "weak"],
    ["MS-PL", "weak"],
    ["GPL-3.0-only", "strong"],
    ["AGPL-3.0", "strong"],
    ["CC-BY-NC-4.0", "strong"],
    ["BUSL-1.1", "strong"],
    ["Elastic-2.0", "strong"],
    ["FSL-1.1-MIT", "strong"],
    // npm's word for a package nobody licensed, one letter away from the opposite
    ["UNLICENSED", "closed"],
    ["Unlicense", "permissive"],
    ["Proprietary", "closed"],
    ["SEE LICENSE IN LICENSE.md", "unknown"],
    ["", "unknown"],
    ["()", "unknown"],
    // an either takes the gentler, a both takes the stricter
    ["(MIT OR Apache-2.0)", "permissive"],
    ["MIT OR GPL-3.0", "permissive"],
    ["MIT AND CC-BY-NC-4.0", "strong"],
    ["Apache-2.0 AND MIT", "permissive"],
  ] as const)
    assert.equal(familyOf(said), want, said || "an empty licence")
})
