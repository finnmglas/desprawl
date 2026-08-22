# Rewrites

You can use desprawl to do agentic software rewrites.

There are 2 variants of rewrites on the opposite sides of information flow allowed from the original to the rewrite. Variant A, the clean room rewrite maximally limits information flow beween the original repository and the new repository. This happens for legal reasons usually, if a rewriter is not allowed to have seen the original code. For that reason there is an Agent 1 that distills specification and an Agent 2 that implements from the specification but doesnt know the detailed code at all. Variant B, the mandated rewrite lives on the opposite side. It is a rewrite by one single party, that has maxium context 

## manual agentic rewrite

### Variant A) clean room rewrite

Agent 1:

```sh
You are Agent 1. Your goal is a complete conformance specification of this repository. The reason for that is a purely educational and agent performance benchmarking one, so you are being evaluated on how well this goes.

Create a folder in the same folder as the original `[original]-cleanroom-rewrite-spec`, and in there you distill the artifacts from the original repository that are needed for a fully featured fully spec compliant rewrite. that are two artifacts specifically, more if more is required or helpful. The suggestion is to have a conformance test suite in there that is independend of the original code but tests positively on the original code, very rigurously its shape that it basically fixes each functionality the original provides that is necessary for the new one to pass later on. The second artifact in there suggested is a CONFORMANCE-SPEC.md file that is quite really large. it could have an outline as this fable-generated one, but must also carry huge amoutns of detail required:
"""
CONFORMANCE SPECIFICATION - <System Name> v<X.Y>

0. Front matter
   0.1 Title, version, status (draft/final), date
   0.2 Authors, maintainers, change log
   0.3 Intended audience and how to read this doc

1. Scope
   1.1 What system/behavior this spec covers
   1.2 Explicit non-goals (what a conforming impl need NOT do)
   1.3 Conformance levels, if any (core vs optional features)

2. Terms and conventions
   2.1 Glossary
   2.2 Requirement language (MUST / SHOULD / MAY, per RFC 2119)
   2.3 Requirement numbering scheme (e.g. REQ-SQL-042)
   2.4 Notation used (grammars, byte diagrams, pseudocode rules)

3. System model
   3.1 Core concepts and objects (e.g. connection, collection, page)
   3.2 Lifecycles and state machines for each object
   3.3 Invariants that must always hold

4. External interfaces
   4.1 API surface: every function/endpoint
       - signature, parameters, types
       - preconditions, postconditions
       - return values, all error conditions
       - ordering/threading rules
   4.2 Wire protocols (message framing, byte layout, versioning)
   4.3 File/storage formats (byte-level layout, endianness, magic numbers)
   4.4 Configuration surface and defaults
   4.5 CLI / query language grammar (formal grammar, e.g. EBNF)

5. Behavioral requirements (the bulk, per feature area)
   For each area:
   - numbered normative requirements
   - defined behavior for every input class, incl. invalid input
   - edge cases and boundary values
   - examples (marked non-normative)

6. Cross-cutting guarantees
   6.1 Concurrency: isolation, locking, visibility rules
   6.2 Atomicity and durability (crash behavior, recovery)
   6.3 Resource limits (max sizes, depths, counts) and behavior at limit
   6.4 Performance/statistical guarantees where exactness is impossible
       (e.g. "recall >= X on dataset Y", complexity bounds)
   6.5 Security-relevant behavior (authz rules, input validation duties)

7. Error catalog
   7.1 Every error code/class, its meaning, when it MUST be raised
   7.2 Error precedence when multiple apply

8. Unspecified and implementation-defined behavior
   8.1 Explicitly unspecified (any behavior allowed)
   8.2 Implementation-defined (impl must document its choice)
   8.3 Undefined (conforming programs must not trigger)

9. Conformance test suite
   9.1 How to run it, environment requirements
   9.2 Test categories mapped to spec sections
   9.3 Pass criteria (what % / which tests define "conforming")
   9.4 Traceability matrix: REQ-id -> test-id(s), no orphan reqs

10. Versioning and compatibility
    10.1 Spec versioning rules
    10.2 Backward/forward compatibility requirements
    10.3 Deprecation policy

Appendices
    A. Full grammars
    B. Byte-layout diagrams
    C. Reserved identifiers/keywords
    D. Non-normative rationale notes
"""

You want to do this very smartly, you may use as many subagents as you need to be efficient here. The specification and test suite you produce should not have anything to do with the verbatim source of the original source, but it should be purely specification / abstract definition, only concrete on the interfaces if any eg cli or apis, the code modules etc you should not spec too detailedly as we dont want to spec pattersn that could be IP of the original. Something built based on the specification you create should not be a derived work of the original, but instead able to be a full new implementation of the same interface and same featureset exact, but nothing impersonating or using anything of the old exact code being copied verbatim.

/goal a full specification, and then you re-verify it in two passes afterwards that it does not copy or relay exact IP information, but pure functional conformance specification. do this very well and very smartly.
```

Agent 2:

```sh
You are Agent 2.
```

### Variant B) mandated rewrite

Agent prompt:

```sh
Your goal is a complete rewrite of this repository. The reason for that is a purely educational and agent performance benchmarking one, so you are being evaluated on how well this goes.

The scope is an exact feature compliant and exact rewrite of the project. It must land in the same folder as the original, but with a foldername exactly `[original]-mandated-rewrite`.

The steps of this process:
1. Create a folder in the smae folder as the original `[original]-mandated-rewrite-spec`, and in there you distill the artifacts from the original repository that are needed for a fully featured fully spec compliant rewrite. that are two artifacts specifically, more if more is required or helpful. The suggestion is to have a conformance test suite in there that is independend of the original code but tests positively on the original code, very rigurously its shape that it basically fixes each functionality the original provides that is necessary for the new one to pass later on. The second artifact in there suggested is a CONFORMANCE-SPEC.md file that is quite really large. it could have an outline as this fable-generated one, but must also carry huge amoutns of detail required:
"""
CONFORMANCE SPECIFICATION - <System Name> v<X.Y>

0. Front matter
   0.1 Title, version, status (draft/final), date
   0.2 Authors, maintainers, change log
   0.3 Intended audience and how to read this doc

1. Scope
   1.1 What system/behavior this spec covers
   1.2 Explicit non-goals (what a conforming impl need NOT do)
   1.3 Conformance levels, if any (core vs optional features)

2. Terms and conventions
   2.1 Glossary
   2.2 Requirement language (MUST / SHOULD / MAY, per RFC 2119)
   2.3 Requirement numbering scheme (e.g. REQ-SQL-042)
   2.4 Notation used (grammars, byte diagrams, pseudocode rules)

3. System model
   3.1 Core concepts and objects (e.g. connection, collection, page)
   3.2 Lifecycles and state machines for each object
   3.3 Invariants that must always hold

4. External interfaces
   4.1 API surface: every function/endpoint
       - signature, parameters, types
       - preconditions, postconditions
       - return values, all error conditions
       - ordering/threading rules
   4.2 Wire protocols (message framing, byte layout, versioning)
   4.3 File/storage formats (byte-level layout, endianness, magic numbers)
   4.4 Configuration surface and defaults
   4.5 CLI / query language grammar (formal grammar, e.g. EBNF)

5. Behavioral requirements (the bulk, per feature area)
   For each area:
   - numbered normative requirements
   - defined behavior for every input class, incl. invalid input
   - edge cases and boundary values
   - examples (marked non-normative)

6. Cross-cutting guarantees
   6.1 Concurrency: isolation, locking, visibility rules
   6.2 Atomicity and durability (crash behavior, recovery)
   6.3 Resource limits (max sizes, depths, counts) and behavior at limit
   6.4 Performance/statistical guarantees where exactness is impossible
       (e.g. "recall >= X on dataset Y", complexity bounds)
   6.5 Security-relevant behavior (authz rules, input validation duties)

7. Error catalog
   7.1 Every error code/class, its meaning, when it MUST be raised
   7.2 Error precedence when multiple apply

8. Unspecified and implementation-defined behavior
   8.1 Explicitly unspecified (any behavior allowed)
   8.2 Implementation-defined (impl must document its choice)
   8.3 Undefined (conforming programs must not trigger)

9. Conformance test suite
   9.1 How to run it, environment requirements
   9.2 Test categories mapped to spec sections
   9.3 Pass criteria (what % / which tests define "conforming")
   9.4 Traceability matrix: REQ-id -> test-id(s), no orphan reqs

10. Versioning and compatibility
    10.1 Spec versioning rules
    10.2 Backward/forward compatibility requirements
    10.3 Deprecation policy

Appendices
    A. Full grammars
    B. Byte-layout diagrams
    C. Reserved identifiers/keywords
    D. Non-normative rationale notes
"""
2. Use the specification alone in a new subagent to completely rewrite the system in the new folder `[original]-mandated-rewrite`.

General note this is a mandated rewrite type, not a clean room rewrite, so you are allowed and all subagents you use are always allowed to read comments and issues on the original repo if that exists, aswell as the entire commit history and every singel original file, there is no limitation, the CONFORMANCE-SPECIFICATION simply exists as a guidance document and the test suite as a way to be 100% sure we are conformant in the end. You are allowed to use subagents anytime to be faster or smarter, use them proactively! Also important goals of the rewrite are that the code is cleaner and possibly slimmer than the original, written in the same language if that makes sense, and just generally better, possibly less buggier, less cyclicities or weird unequally weighed module graphs - our rewrite is supposed to be superior in every way to the original, while meeting pr outperfing every single one of its functional and soft requirements.

/goal write the specification and do the full mandated rewrite the smartest and best way possible
```

## desprawl rewrite

Currently in development.

## Insights

- Tested manual on difit
- A Opus5 manual clean room rewrite took as long for writing the spec alone (ca 90min), as the mandated rewrite took to fully rewrite it AND write a spec.
- The spec of manual clean room rewrite took about half the lines of the mandated
