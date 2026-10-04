# SRS ontology

What each Annotate type means, extracted from `srs-template.html` (the
IEEE 29148-tailored SRS template, 2026 edition) including its `AUTHORING`
comments. This is the source for Annotate's per-type guidelines.

Each type lists the template section it feeds, its definition, when to label
it, what it is not, and the examples the template gives. Text in quotes is
copied from the template. Lines marked _(reading)_ are an interpretation the
template does not state.

## What the template does and does not give us

- **Definitions and boundary tests: strong.** Most sections state an inclusion
  test ("litmus") and say where near-misses belong.
- **Examples: target-side only.** The template shows how an item reads once
  written into an SRS ("e.g. PostgreSQL, Azure, Entra ID"). It has no examples
  of how an RFP phrases the same thing. Source-side examples have to come from
  labeled real documents, and not from the document the eval scores.
- **All 19 types in `TYPES` map to a template section.** No type is orphaned.

## Types

### business-goal

- **Feeds:** §1 Product Mission (29148 §9.6.2 "Purpose").
- **Definition:** why the software exists: "the business problem and who
  suffers it", "the outcome this product must cause, and how success will be
  recognized".
- **Label when:** the statement "name[s] a business problem, outcome, or
  measurable goal". Usually found in the source's background or objectives
  section.
- **Not this:** what the system does (`product`); a capability (`feature`).
- **Examples:** none in the template.

### product

- **Feeds:** title line and §2 Product Definition (29148 §9.6.3 "Scope").
- **Definition:** what the product is: "what kind of system this is (web app,
  API platform, batch pipeline…), its primary object of work, and its place in
  the business process". The title line adds "What it is, for whom."
- **Label when:** the statement names the product or says what kind of system
  it is. _(reading)_ §4's narrative, "a new standalone system, a replacement,
  or a component of a larger platform", is the same kind of statement.
- **Not this:** why it exists (`business-goal`); what it can do (`feature`).
- **Examples:** "web app, API platform, batch pipeline".

### out-of-scope

- **Feeds:** §2 Out of scope.
- **Definition:** "What is NOT built, or which aspect was reduced". The
  template calls this list "a hard DO-NOT-BUILD boundary".
- **Label when:** the source excludes or defers something: "everything a reader
  might assume is included but is not (adjacent systems, migrations, phase-2
  items, excluded user groups)".
- **Not this:** an unstated omission. The exclusion has to be in the text.
- **Examples:** "deferred to phase 2", "explicitly excluded".

### user-class

- **Feeds:** §3 User Profiles (29148 §9.6.6 "User characteristics").
- **Definition:** a kind of user, with "engineering-relevant facts about each
  user class — NOT marketing personas".
- **Label when:** the source introduces a user class or states a relevant fact
  about it: "volume of users, frequency of use, domain expertise, technical
  skill, environment (device, network, locale), accessibility needs,
  permissions level".
- **Not this:** the actor inside a user story; that statement is a
  `functional-requirement`. An excluded user group is `out-of-scope`.
- **Examples:** "non-technical, uses the system daily on mobile, low-bandwidth
  field conditions, needs WCAG AA"; "~500 daily".

### integration

- **Feeds:** §4.1 System Integrations and §8 Integration Contracts.
- **Definition:** "EVERYTHING this system talks to — internal sister systems,
  external SaaS, third-party APIs".
- **Label when:** the source names a system the product exchanges data with,
  or states a fact about that exchange: direction, protocol, auth, key
  operations, payload, "failure semantics (timeouts, retries, idempotency…)",
  rate limits, environments.
- **Not this:** access or credentials someone else must supply (`dependency`).
  A cross-cutting protocol policy such as "all internal traffic mTLS" is a
  `non-functional-requirement` (SEC).
- **Examples:** "outbound REST", "inbound webhook", "pub/sub", "batch file";
  "OAuth2 client-credentials", "SFTP + CSV".

### imposed-technology

- **Feeds:** §4.2 Technology Stack (imposed).
- **Definition:** "ONLY platform elements that are IMPOSED on the project — by
  the customer, a source document, or the org's platform strategy".
- **Label when:** the inclusion test passes: "would the deployer or customer
  reject a delivery that used something else?" Layers: "Runtime / DB / Cloud /
  Identity". Device targets and resource ceilings count for "embedded/POS/
  mobile-offline products".
- **Not this:** application libraries; a technology mentioned as an option or
  as the current state.
- **Examples:** "PostgreSQL, Azure, Entra ID"; version "≥15".

### configurable-item

- **Feeds:** §4.3 Deployment & Tenant Configuration.
- **Definition:** "What must be CONFIGURABLE per deployment, environment,
  tenant, or customer — without code changes."
- **Label when:** the source says a value or behavior varies by tenant,
  environment or customer, or that an admin can change it.
- **Not this:** a fixed business rule (`functional-requirement`).
- **Examples:** "branding, locale/timezone, business rules, feature flags,
  integration endpoints, retention periods"; "Approval thresholds" "per
  tenant" changed in the "tenant admin UI".

### feature

- **Feeds:** §5 Product Features (29148 §9.6.5 "Product functions").
- **Definition:** an entry in "the capability MENU: 5–15 features, each 1–3
  sentences", a "capability summary in outcome terms".
- **Label when:** the source names a capability that groups several behaviors.
  Release or phase information attaches to features.
- **Not this:** a single behavior under that capability
  (`functional-requirement`). The template's own image is "Menu → recipes".
- **Examples:** none worked. §2 gives a noun-phrase scope item, "Quote
  generation and approval workflow".

### assumption

- **Feeds:** §6 Assumptions (ASM).
- **Definition:** "something believed true but NOT guaranteed".
- **Label when:** the litmus passes: "if this turned out false, would the SRS
  change?"
- **Not this:** "Imposed-and-certain mandates are NOT assumptions — they are
  requirements": a tech mandate is `imposed-technology`; regulation- or
  contract-derived behavior is a typed requirement.
- **Examples:** none in the template.

### dependency

- **Feeds:** §6 Dependencies (DEP).
- **Definition:** "an external deliverable/event this project needs and does
  not control".
- **Label when:** someone outside the project must provide something before
  work can proceed.
- **Not this:** the system on the other end (`integration`).
- **Examples:** "API access, data migration by customer, credentials";
  "Sandbox credentials for X API".

### functional-requirement

- **Feeds:** §7 Functional Requirements (FR), 29148 §9.6.12 "Functions".
- **Definition:** one behavior the system must have. "One requirement = one
  shall."
- **Label when:** the source states what the system does in response to an
  event, in a state, on an error, or always. The five EARS patterns name the
  cases: ubiquitous, event-driven, state-driven, unwanted behavior, optional
  feature.
- **Granularity:** "RFP prose usually bundles many behaviors per paragraph.
  Split until each card holds exactly ONE shall." Typical yield: "a 2-page
  feature description … becomes 8–20 FR cards". From a mockup: "every field →
  validation FR", "every button/action → event-driven FR", "every state/badge →
  state-driven FR", "every error message → unwanted-behavior FR".
- **Not this:** a quality number (`non-functional-requirement`); a constraint
  on the UI (`ux-requirement`); a rule about data at rest
  (`data-requirement`); running the system (`operational-requirement`).
- **Examples:** "When a Requester submits a Quote whose total exceeds the
  tenant's approval threshold, the system shall set the Quote status to
  PENDING_APPROVAL and place it in the Approver queue within 5 seconds."

### mockup

- **Feeds:** MCK exhibits embedded in §7.
- **Definition:** a UI mockup supplied by a source document. "The image is
  evidence; the cards are the requirement."
- **Label when:** a figure or screen description shows user interface.
- **Not this:** a statement about how binding the mockups are; that is a
  `ux-requirement` (the "Design fidelity" row). Context or architecture
  diagrams are not mockups.
- **Examples:** none in the template. Each exhibit is marked "Binding" or
  "Illustrative".

### data-entity

- **Feeds:** §9.1 Entity-relationship model and §9.2 Entity catalog (ENT).
- **Definition:** a business object in "the INFORMATION model,
  storage-agnostic": "identity, key attributes with types/units, invariants
  (business rules that must always hold)", plus relationships with
  cardinality.
- **Label when:** the source defines a business object, its key, its
  attributes, an invariant, or how it relates to another object.
- **Not this:** table names, indexes or engine features ("architecture
  decisions"). A term that is only vocabulary is a `glossary-term`; "§9 owns
  entity definitions".
- **Examples:** "Quote"; "total: decimal · USD; status: enum[DRAFT,
  PENDING_APPROVAL, APPROVED, REJECTED]"; "total = Σ line amounts".

### data-requirement

- **Feeds:** §9.3 Data policies (DR).
- **Definition:** a policy on data: "retention, sensitivity, residency,
  volume". Sensitivity classes: "Public · Internal · Confidential · PII ·
  Regulated".
- **Label when:** the source states how long data is kept, where it may live,
  how sensitive it is, or how it must be protected at rest.
- **Not this:** data-subject rights mechanics (`non-functional-requirement`,
  PRV). _(reading)_ A protection rule on a named entity or attribute is a
  `data-requirement`; a system-wide rule is `non-functional-requirement` (SEC).
  The template lists "encrypted at rest" under both.
- **Examples:** "Retained 7 years after fiscal-year close, then hard-deleted";
  "Encrypted at rest; masked in logs and non-prod environments".

### ux-requirement

- **Feeds:** §10.1 UX constraints and §10.2 Usability requirements (UX).
- **Definition:** "inputs the design must respect" and measurable usability
  targets.
- **Label when:** the source constrains "target devices & breakpoints, browser
  matrix, accessibility level, design system, languages/locales, offline
  behavior", states how binding its mockups are, or sets a usability target
  tied to a user class.
- **Not this:** "browser/OS support beyond §10.1" is
  `non-functional-requirement` (CMP). What a screen does is a
  `functional-requirement`.
- **Examples:** "Desktop-first; usable ≥768px; no native app"; "Last 2
  versions of Chrome, Edge, Safari"; "WCAG 2.2 AA"; "es-MX + en-US at launch";
  "a first-time Requester completes a quote in under 4 minutes without
  training".

### non-functional-requirement

- **Feeds:** §11 Non-Functional Requirements (NFR), on "an ISO 25010-informed
  taxonomy".
- **Definition:** a quality target: "a NUMBER or a falsifiable condition" with
  "measurement context (percentile, load, window)".
- **Label when:** the source sets a target in one of the seven categories.
- **Not this:** "targets/budgets live here; operational FACILITIES (dashboards,
  runbooks, deployment mechanics) live in §12" (`operational-requirement`).
- **Categories:**
  - **PER** performance and capacity: "Latency, throughput, concurrency, data
    volumes, resource budgets".
  - **REL** reliability and availability: "Availability target (e.g. 99.9%
    monthly), error budget, RTO/RPO numbers", "graceful-degradation rules".
  - **SEC** security: "AuthN/AuthZ model (RBAC roles ↔ §3 user classes),
    session policy, encryption in transit/at rest, secrets, audit trail, OWASP
    baseline, pen-test gates".
  - **PRV** privacy: "Data-subject rights mechanics (access, erasure,
    portability), consent, minimization, anonymization/pseudonymization".
  - **SCA** scalability: "Growth envelope: users/data/tenants over time;
    horizontal-scaling expectations; multi-tenancy isolation guarantees".
  - **MNT** maintainability: "Only IMPOSED engineering-quality gates: coverage
    thresholds, static-analysis gates, documentation deliverables".
  - **CMP** compatibility and portability: "Cloud-portability mandates,
    browser/OS support beyond §10.1, data-export formats, standards-based
    interop (e.g. must speak FHIR/EDI X12)".
- **Examples:** "p95 ≤ 400 ms at 100 concurrent users".

### operational-requirement

- **Feeds:** §12 Operational Requirements (OPS), 29148 §9.6.4.7 "Operations".
- **Definition:** "Requirements about RUNNING the system": "the operational
  facilities and behaviors the product must ship with".
- **Label when:** the source covers one of the five areas:
  - environments and deployment: "dev/test/stage/prod", "SaaS? customer VPC?
    on-prem?", "release cadence, zero-downtime expectations, rollback";
  - observability and alerting: "structured logging", "metrics, tracing,
    health/readiness endpoints, alert conditions";
  - scheduled and background processing: "batch jobs, schedules, timezone
    rules, missed-run and overlap behavior";
  - backup, recovery and continuity: "backup scope + frequency, restore
    procedure";
  - operational modes: "maintenance mode behavior, read-only mode, feature
    kill-switches, planned-downtime communication".
- **Not this:** the target those facilities serve, such as "99.9%" or "RPO ≤
  1h" (`non-functional-requirement`, REL).
- **Examples:** "health endpoints, structured logs, backup jobs, deployment
  mode".

### standard

- **Feeds:** no section. "Standards and regulations are NOT registered
  anywhere: cite them inline, by name + clause", in the Source field of each
  requirement they impose.
- **Definition:** a standard or regulation "the source documents declare
  binding".
- **Label when:** the source names a standard or regulation as mandatory.
  _(reading)_ The same statement usually also carries the type of the
  requirement it imposes.
- **Not this:** a standard mentioned in passing or as an example.
- **Examples:** "GDPR Art. 17", "GDPR Art. 32", "WCAG 2.2 AA", "FHIR", "EDI
  X12".

### glossary-term

- **Feeds:** §0.3 Glossary (29148 §9.2.3 "Definitions").
- **Definition:** a term "used with a non-default or narrowed meaning in this
  document".
- **Label when:** the source defines a domain term. The test: "if two readers
  could not disagree about a term, it does not belong here."
- **Not this:** "NOT acronym expansions", "NOT data entities (→ §9 owns entity
  definitions)".
- **Examples:** "'User' = authenticated paying subscriber, not any visitor".

## Open boundaries

The template leaves these to judgment. Each needs one rule so labels are
consistent between runs and between the model and the answer key.

1. **Identity provider: `integration` or `imposed-technology`?** The template
   lists Entra ID as an imposed "Identity" layer, and it is also a system the
   product talks to. The recorded fixture labels it `integration`.
2. **Encryption at rest: `data-requirement` or `non-functional-requirement`
   (SEC)?** The template gives it as an example of both.
3. **Unmeasurable UX wishes ("intuitive", "easy to learn").** The template
   says to "sharpen or drop" them when writing the SRS. It does not say whether
   the source statement is evidence worth labeling.
4. **A binding standard and the requirement it imposes.** One label or two on
   the same statement.

## Template sections with no type

`TYPES` has nothing for these. Listed so the gap is a decision, not an
accident.

- **In-scope items (§2):** "Included area of responsibility, phrased as a noun
  phrase". Closest type today is `feature`.
- **Acronyms (§0.4):** "Pure expansions".
- **Priority (§0.2):** Must, Should, Could, Wont. The current prompt
  deliberately leaves priority to a later step.
- **Release or phase (§5):** attaches to a feature.
- **Project gates (§13):** "coverage %, pen-test, UAT window".
- **Sample data (Appendix A):** payloads and representative instances.
