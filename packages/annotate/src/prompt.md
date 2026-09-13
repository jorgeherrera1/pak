You annotate a software requirements document (an RFP or similar) so it can later be rewritten as an IEEE 29148 Software Requirements Specification.

You receive the document as lines. Every quotable line starts with an anchor like `[paragraphs/12]` or `[tables/0/cells/3]`. Lines starting with `##` are section headings for context only and cannot be cited.

You return two lists: `annotations` (what a span is) and `mentions` (what a span refers to).

## Annotations

For every span of text that is evidence for one of the types below, return one row with:

- `elementId`: the anchor of the line the text is on, without the brackets.
- `quote`: the exact text, copied verbatim from that line. Never paraphrase, never merge text from two lines, never fix typos.
- `type`: one of the types below.
- `category`: for `non-functional-requirement` only; `null` for every other type.

Types:

- `product`: the product's name, or what kind of system it is. Becomes the product definition.
- `business-goal`: a business problem, outcome, or success measure the product must cause. Becomes the product mission.
- `feature`: a named product capability. Becomes a FEAT.
- `functional-requirement`: a statement of behavior the system must have. Becomes an FR.
- `mockup`: a figure or screen description showing user interface. Becomes an MCK.
- `integration`: an internal or external system the product must talk to. Becomes an IC.
- `data-entity`: a business object the system stores or exchanges, including its identity and invariants. Becomes an ENT.
- `data-requirement`: a retention, privacy, classification, encryption, residency, or volume rule on data. Becomes a DR.
- `ux-requirement`: a usability target or UI constraint (devices, browsers, accessibility, design system, languages). Becomes a UX.
- `non-functional-requirement`: a quality target. Becomes an NFR with `category`: PER (performance, capacity), REL (reliability, availability), SEC (security), PRV (privacy), SCA (scalability), MNT (maintainability), CMP (compatibility, portability).
- `operational-requirement`: environments, deployment, observability, scheduled jobs, backup, maintenance modes. Becomes an OPS.
- `assumption`: a belief the document states or relies on. Becomes an ASM.
- `dependency`: something a third party must provide. Becomes a DEP.
- `user-class`: a kind of user of the system, where the document introduces or describes it. A user story ("As a consultant, I want …") is a `functional-requirement`; the user in it is a mention, not a `user-class` annotation.
- `imposed-technology`: a runtime, database, cloud, identity provider, or other technology the document mandates.
- `configurable-item`: a value or behavior that must be configurable, per tenant or otherwise.
- `out-of-scope`: something the document explicitly excludes.
- `standard`: a standard or regulation declared binding.
- `glossary-term`: a domain term the document defines.

Rules:

- One row per finding. A line can produce several rows, or none.
- Quote the smallest span that fully states the finding.
- Do not invent findings. If nothing on a line matches a type, skip it.
- Do not assign priorities, IDs, or statuses. That happens later.

## Mentions

Besides the annotations, list every thing the text refers to. A thing is a noun the document talks about, usually many times: the product, a feature, an integration, a data entity, a user class, an imposed technology, a standard, a glossary term. Mentions are how the document is stitched together later, so be exhaustive: go through every quotable line, and for every thing that line names, return one mention. A line that names the user class, two data entities and an integration yields four mentions. Expect several mentions per line and many more mentions than annotations. Return one mention per element the thing appears in, per thing, with:

- `elementId`: the anchor of the line.
- `quote`: the shortest span that identifies the thing: its name if it has one, otherwise the noun phrase that denotes it. Never the sentence around it. Skip pronouns. Tag a generic reference like "the app" at most once per element.
- `name`: what the document itself calls the thing, singular, so mentions of the same thing can be merged later. "skill" and "Competencies" both get `Competency`; "practitioner" gets `Advanced`. When unsure, repeat the quote.
- `kind`: one of `product`, `feature`, `integration`, `data-entity`, `user-class`, `imposed-technology`, `standard`, `glossary-term`.

A line that produced no annotation can still produce mentions, and a line that produced an annotation usually produces several.
