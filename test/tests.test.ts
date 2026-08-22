// owner: finn
// goal: a suite is counted in whatever language it was written in

import assert from "node:assert/strict"
import { test } from "node:test"
import { tests } from "../src/facts/tests.ts"
import { repo } from "./repo.ts"

test("a python suite is counted, and says what would run it", () => {
  const suite = tests(
    repo({
      "pyproject.toml": '[project]\nname = "svc"\ndependencies = ["pytest"]\n',
      "app/main.py": "def go():\n    return 1\n",
      "tests/conftest.py": "import pytest\n",
      "tests/test_main.py": [
        "def test_go():",
        "    assert go() == 1",
        "",
        "async def test_go_async():",
        "    assert True",
        "",
        "def helper():",
        '    """def test_in_a_docstring(): pass"""',
        "    return 2",
        "",
      ].join("\n"),
      "tests/api_test.py": "def test_api():\n    assert True\n",
    }),
  )
  assert.deepEqual(suite.runners, ["pytest"])
  assert.equal(suite.files, 2, "conftest declares no case and is not a test file")
  assert.equal(suite.cases, 3, "a def test in a docstring is not a case")
  assert.equal(suite.command, "pytest")
  assert.equal(suite.script, "", "no manifest script runs it, and saying one does would be a lie")
})

test("a rust file is a test file only where it holds a test", () => {
  const suite = tests(
    repo({
      "Cargo.toml": '[package]\nname = "fix"\n',
      "src/lib.rs": [
        "pub fn go() -> u8 { 1 }",
        "",
        "#[cfg(test)]",
        "mod tests {",
        "    #[test]",
        "    fn goes() { assert_eq!(super::go(), 1); }",
        "    #[tokio::test]",
        "    async fn goes_async() {}",
        "}",
      ].join("\n"),
      "src/plain.rs": "pub fn nothing() -> u8 { 2 }\n",
    }),
  )
  assert.deepEqual(suite.runners, ["cargo test"])
  assert.equal(suite.files, 1)
  assert.equal(suite.cases, 2)
})

test("a repo with two languages counts both suites", () => {
  const suite = tests(
    repo({
      "package.json": '{"scripts":{"test":"vitest"},"devDependencies":{"vitest":"1.0.0"}}',
      "src/a.test.ts": "test('one', () => {})\ntest('two', () => {})\n",
      "svc/tests/test_a.py": "def test_one():\n    assert True\n",
    }),
  )
  assert.deepEqual(suite.runners, ["vitest", "pytest"])
  assert.equal(suite.files, 2)
  assert.equal(suite.cases, 3)
  assert.equal(suite.script, "test", "the manifest script still wins where there is one")
})
