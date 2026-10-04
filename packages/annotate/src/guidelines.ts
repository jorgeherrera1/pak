import type { ClassificationType } from "./types.ts";

/**
 * One labeling guideline per type: definition, when to label, what it is not,
 * examples. Only what helps decide a label; nothing about how an SRS is laid
 * out or written. Extracted from the IEEE 29148-tailored SRS template.
 */
export const GUIDELINES: Record<ClassificationType, string> = {
  "business-goal": `- **Definition:** why the software exists: the business problem and who
  suffers it, or the outcome the product must cause and how success will be
  recognized.
- **Label when:** the statement names a business problem, an outcome, or a
  measurable goal. Usually found in a background or objectives passage.
- **Not this:** what the system is (product); what it can do (feature).`,
  product: `- **Definition:** what the product is: its name, what kind of system it is,
  what it primarily works on, who it is for, and its place in the business
  process.
- **Label when:** the statement names the product or says what kind of system
  it is, including whether it is new, a replacement, or part of a larger
  platform.
- **Not this:** why it exists (business-goal); what it can do (feature).
- **Examples:** "web app", "API platform", "batch pipeline".`,
  "out-of-scope": `- **Definition:** something that is not built, or an aspect that was reduced.
- **Label when:** the source excludes or defers something a reader might
  assume is included: adjacent systems, migrations, later-phase items,
  excluded user groups.
- **Not this:** an omission the text does not state.
- **Examples:** "deferred to phase 2", "explicitly excluded".`,
  "user-class": `- **Definition:** a kind of user of the system, with the facts about it that
  matter to engineering.
- **Label when:** the source introduces a user class or states its volume,
  frequency of use, domain expertise, technical skill, environment (device,
  network, locale), accessibility needs, or permission level.
- **Not this:** the actor inside a user story; that statement is a
  functional-requirement. A user group the source excludes is
  out-of-scope.
- **Examples:** "non-technical, uses the system daily on mobile, low-bandwidth
  field conditions"; "~500 daily".`,
  integration: `- **Definition:** anything the system talks to: internal sister systems,
  external SaaS, third-party APIs.
- **Label when:** the source names a system the product exchanges data with,
  or states a fact about that exchange: direction, protocol, authentication,
  operations, payload, behavior on failure, rate limits, environments.
- **Not this:** access or credentials someone else must supply (dependency).
  A policy across all traffic, such as "all internal traffic uses mTLS", is a
  non-functional-requirement (SEC).
- **Examples:** "outbound REST", "inbound webhook", "batch file over SFTP",
  "OAuth2 client credentials".`,
  "imposed-technology": `- **Definition:** a platform element imposed on the project by the customer,
  the source document, or the organization's platform strategy.
- **Label when:** the customer would reject a delivery that used something
  else. Covers runtime, database, cloud, identity, and, for embedded or mobile
  products, device targets and resource ceilings.
- **Not this:** application libraries; a technology mentioned as an option or
  as the current state.
- **Examples:** "PostgreSQL 15 or later", "Azure", "Entra ID".
- **Identity providers:** imposed-technology when the source mandates the provider; integration when the source describes the exchange with it. One statement can carry both labels.`,
  "configurable-item": `- **Definition:** something that must be configurable per deployment,
  environment, tenant or customer without code changes.
- **Label when:** the source says a value or behavior varies by tenant,
  environment or customer, or that an administrator can change it.
- **Not this:** a fixed business rule (functional-requirement).
- **Examples:** branding, locale and timezone, feature flags, integration
  endpoints, retention periods; "approval thresholds, per tenant, changed in
  the tenant admin UI".`,
  feature: `- **Definition:** a named product capability, described by its outcome, that
  groups several behaviors.
- **Label when:** the source names a capability or an area of responsibility.
- **Not this:** a single behavior under that capability
  (functional-requirement).
- **Examples:** "Quote generation and approval workflow".`,
  assumption: `- **Definition:** something believed true but not guaranteed.
- **Label when:** the requirements would change if the statement turned out
  false.
- **Not this:** a certain mandate. An imposed technology is
  imposed-technology; behavior a regulation or contract demands is a
  requirement of the matching type.`,
  dependency: `- **Definition:** an external deliverable or event the project needs and does
  not control.
- **Label when:** someone outside the project must provide something before
  work can proceed.
- **Not this:** the system on the other end (integration).
- **Examples:** API access, data migration by the customer, "sandbox
  credentials for the X API".`,
  "functional-requirement": `- **Definition:** one behavior the system must have.
- **Label when:** the source states what the system does: always, in response
  to an event, while in a state, or when something goes wrong.
- **Granularity:** source prose often bundles several behaviors in one
  paragraph. Each behavior is its own finding.
- **Not this:** a quality target with a number (non-functional-requirement);
  a constraint on the user interface (ux-requirement); a rule about stored
  data (data-requirement); how the system is run
  (operational-requirement).
- **Examples:** "When a Requester submits a Quote whose total exceeds the
  tenant's approval threshold, the system shall set the Quote status to
  PENDING_APPROVAL and place it in the Approver queue within 5 seconds."`,
  mockup: `- **Definition:** a user-interface mockup supplied by the source document.
- **Label when:** a figure or a screen description shows user interface.
- **Not this:** a statement about how binding the mockups are
  (ux-requirement). Context and architecture diagrams are not mockups.`,
  "data-entity": `- **Definition:** a business object the system stores or exchanges: what it
  represents, its identity, its key attributes, its invariants, and how it
  relates to other objects.
- **Label when:** the source defines a business object, its key, an attribute,
  a rule that must always hold for it, or a relationship with its cardinality.
- **Not this:** storage details such as table names or indexes. A term that is
  only vocabulary is a glossary-term.
- **Examples:** "Quote"; "total: decimal, USD"; "status: DRAFT,
  PENDING_APPROVAL, APPROVED, REJECTED"; "total equals the sum of line
  amounts".`,
  "data-requirement": `- **Definition:** a policy on data: retention, sensitivity, residency, volume,
  or protection at rest.
- **Label when:** the source states how long data is kept, where it may live,
  how sensitive it is (public, internal, confidential, PII, regulated), or how
  it must be protected.
- **Not this:** the mechanics of data-subject rights
  (non-functional-requirement, PRV).
- **Examples:** "Retained 7 years after fiscal-year close, then hard-deleted";
  "Encrypted at rest; masked in logs and non-production environments".
- **Encryption at rest:** data-requirement when stated about a named entity or attribute; non-functional-requirement (SEC) when stated for the whole system.`,
  "ux-requirement": `- **Definition:** a constraint the user interface must respect, or a usability
  target.
- **Label when:** the source constrains devices and breakpoints, browsers,
  accessibility level, design system, languages and locales, or offline
  behavior; states how binding its mockups are; or sets a usability target for
  a kind of user.
- **Not this:** what a screen does (functional-requirement).
- **Examples:** "Desktop-first; usable at 768px and wider; no native app";
  "Last 2 versions of Chrome, Edge, Safari"; "WCAG 2.2 AA"; "es-MX and en-US
  at launch"; "a first-time Requester completes a quote in under 4 minutes
  without training".
- **Vague wishes:** label usability wishes such as "intuitive" or "easy to learn" too, even without a measurable target.`,
  "non-functional-requirement": `- **Definition:** a quality target: a number or a falsifiable condition, with
  its measurement context.
- **Label when:** the source sets a target in one of the categories below.
- **Not this:** the facilities that serve the target, such as dashboards,
  backups or deployment mechanics (operational-requirement).
- **Categories:**
  - **PER** performance and capacity: latency, throughput, concurrency, data
    volumes, resource budgets.
  - **REL** reliability and availability: availability target, error budget,
    recovery time and recovery point, graceful degradation.
  - **SEC** security: authentication and authorization model, roles, session
    policy, encryption in transit and at rest, secrets, audit trail,
    penetration testing.
  - **PRV** privacy: data-subject rights (access, erasure, portability),
    consent, minimization, anonymization.
  - **SCA** scalability: growth in users, data or tenants; horizontal scaling;
    isolation between tenants.
  - **MNT** maintainability: imposed engineering gates such as coverage
    thresholds, static analysis, documentation deliverables.
  - **CMP** compatibility and portability: cloud portability, operating
    system support, data-export formats, standards-based interoperability.
- **Examples:** "p95 at or under 400 ms at 100 concurrent users"; "99.9%
  monthly availability".`,
  "operational-requirement": `- **Definition:** a requirement about running the system: the facilities and
  behaviors the product must ship with.
- **Label when:** the source covers one of these areas:
  - environments and deployment: required environments, hosting mode, release
    cadence, zero downtime, rollback;
  - observability and alerting: logging, metrics, tracing, health endpoints,
    alerts;
  - scheduled and background processing: batch jobs, schedules, timezone
    rules, missed runs;
  - backup, recovery and continuity: backup scope and frequency, restore;
  - operational modes: maintenance mode, read-only mode, kill switches,
    planned-downtime communication.
- **Not this:** the target those facilities serve, such as "99.9%" or a
  recovery point of one hour (non-functional-requirement, REL).
- **Examples:** "health endpoints", "structured logs", "nightly backup job".`,
  standard: `- **Definition:** a standard or regulation the source declares binding.
- **Label when:** the source names a standard or regulation as mandatory.
- **Not this:** a standard mentioned in passing or as an example.
- **Examples:** "GDPR Art. 17", "WCAG 2.2 AA", "FHIR", "EDI X12".
- **Also label:** the same statement with the type of the requirement the standard imposes.`,
  "glossary-term": `- **Definition:** a domain term the source uses with a specific or narrowed
  meaning.
- **Label when:** the source defines a term that two readers could otherwise
  understand differently.
- **Not this:** an acronym expansion; a business object (data-entity).
- **Examples:** "'User' means an authenticated paying subscriber, not any
  visitor".`,
};
