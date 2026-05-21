# Originium Frame Catalog

This catalog is the first sparse, advisory vocabulary for Originium Domain
Frames. It is not a closed ontology, a required enum, or a complete model of
Cisco industrial networking knowledge. Agents should use these frames to make
Source Document and Wiki Page metadata more legible, while leaving uncertain
records unframed or proposing a new frame when repeated examples do not fit.

Frame metadata is advisory by default. Missing recommended slots should be
visible to lint and review, but sparse imports and ordinary Wiki Page creation
should still be possible. Runtime seed data is intentionally deferred until the
schema shape exists.

The examples below come from the current Cisco industrial source corpus under
`fixtures/source-documents/cisco-industries/` and the CURWB mining fixture
`fixtures/source-documents/IA-Mining-DG.pdf`.

## Slot Guidance

Recommended metadata slots use these first-pass value kinds:

- `string`
- `string_list`
- `date`
- `boolean`
- `number`
- `controlled_string`

Slot names are stable suggestions for schema and lint design, not a guarantee
that every frame assignment must populate every slot.

## Source Document Frames

### Design Guide

**Record scope:** `source_document`

**Scope note:** A prescriptive engineering guide that explains a validated or
recommended design for an industry, architecture, product family, or deployment
scenario. Design Guides usually contain requirements, assumptions, architecture
diagrams, component choices, design considerations, and validation guidance.

**Examples:**

- `IA-Mining-DG.pdf` (`CURWB Deployment for Autonomous Operations in Open-Pit
Mining`)
- `Industrial-Automation-WirelessDG.pdf`
- `Rail_CBTC_Design_Guide.pdf`
- `Wind-Farm_1-3_Design_Guide.pdf`
- `SA-3-3-DG.pdf`

**Non-examples:**

- A short solution overview such as `IA_Networking_Solution_Brief.pdf`
- A procedure-only implementation guide such as
  `Direct-Transfer-Trip-Design-and-Implementation-Guide.pdf`

**Recommended metadata slots:**

- `corpus` (`controlled_string`): source corpus, such as
  `cisco-industries` or `curwb-mining-fixture`
- `publisher` (`string`): expected value is `Cisco`
- `document_class` (`controlled_string`): `design_guide`
- `industries` (`string_list`): mining, rail, utilities, wind, manufacturing,
  oil and gas, or roadway contexts
- `product_families` (`string_list`): Cisco product families or solution
  families covered by the guide
- `solution_area` (`string`): concise solution area, such as industrial
  wireless, substation automation, CBTC, or CURWB mining operations
- `publication_date` (`date`): source publication or revision date when known
- `source_url` (`string`): canonical upstream URL when available
- `trust_status` (`controlled_string`): trusted, superseded, draft, or unknown
- `page_count` (`number`): page count when available

### Implementation Guide

**Record scope:** `source_document`

**Scope note:** A procedural or configuration-oriented source that teaches how
to deploy, configure, integrate, or operate a solution. It may include design
context, but its primary value is executable implementation guidance.

**Examples:**

- `Direct-Transfer-Trip-Design-and-Implementation-Guide.pdf`
- `Rail-CBTC-Implementation-Guide.pdf`
- `SA-3-2-IG.pdf`
- `wind-farm-IG-1-2.pdf`

**Non-examples:**

- A general Design Guide where implementation commands are only one supporting
  section
- A product brochure or solution brief without enough procedural detail to
  execute

**Recommended metadata slots:**

- `corpus` (`controlled_string`)
- `publisher` (`string`)
- `document_class` (`controlled_string`): `implementation_guide`
- `industries` (`string_list`)
- `product_families` (`string_list`)
- `implementation_domain` (`string`): deployment, configuration, integration,
  migration, validation, or operations
- `target_operator` (`string`): likely operator role, such as network engineer
  or industrial operations engineer
- `publication_date` (`date`)
- `source_url` (`string`)
- `trust_status` (`controlled_string`)

### Solution Brief

**Record scope:** `source_document`

**Scope note:** A concise, outcome-oriented document that summarizes a Cisco
solution, market problem, capability set, and value proposition. Solution
Briefs are useful source inventory, but they should not be over-promoted into
implementation facts without supporting design or implementation evidence.

**Examples:**

- `Cisco_Catalyst_Center_for_IA_SB.pdf`
- `IA_Networking_Solution_Brief.pdf`
- `Physical-Perimeter-Security-Solution-Brief_01.pdf`
- `SA-3-2-SB.pdf`
- `connected-rail-cbtc-and-safety-solution-brief.pdf`
- `connected-roadways-intersections-solution-brief.pdf`
- `Windfarm-1-2_SB.pdf`

**Non-examples:**

- A white paper that argues a technical position in depth
- A Design Guide with validated architecture details and deployment constraints

**Recommended metadata slots:**

- `corpus` (`controlled_string`)
- `publisher` (`string`)
- `document_class` (`controlled_string`): `solution_brief`
- `industries` (`string_list`)
- `solution_area` (`string`)
- `business_outcomes` (`string_list`): stated operational or business outcomes
- `product_families` (`string_list`)
- `publication_date` (`date`)
- `source_url` (`string`)
- `trust_status` (`controlled_string`)

### White Paper

**Record scope:** `source_document`

**Scope note:** A technical or position paper that explains a protocol, security
concern, timing model, operational issue, or design rationale in more depth than
a brief, without necessarily prescribing a full validated architecture.

**Examples:**

- `DNP3-Active-Discovery-White-Paper.pdf`
- `Terrestrial-timing_WP.pdf`
- `network-info-security-wp.pdf`

**Non-examples:**

- A short solution overview
- A step-by-step implementation guide

**Recommended metadata slots:**

- `corpus` (`controlled_string`)
- `publisher` (`string`)
- `document_class` (`controlled_string`): `white_paper`
- `topics` (`string_list`): protocols, security themes, timing, discovery, or
  reliability topics
- `industries` (`string_list`)
- `product_families` (`string_list`)
- `publication_date` (`date`)
- `source_url` (`string`)
- `trust_status` (`controlled_string`)

## Wiki Page Frames

### Source-Backed Concept

**Record scope:** `wiki_page`

**Scope note:** A durable explanatory page for a concept that agents will reuse
across answers, indexing, or teaching. The page should synthesize source-backed
meaning rather than mirror a source heading.

**Examples:**

- `wiki_page:autonomous_operations`
- `Cisco Ultra-Reliable Wireless Backhaul (CURWB) Overview`
- `Spanning Tree Protocols`
- `DNP3 Active Discovery`

**Non-examples:**

- A complete deployment workflow, which should use Procedure
- A whole document summary, which should usually stay Source Document metadata

**Recommended metadata slots:**

- `aliases` (`string_list`): abbreviations and alternate names, such as CURWB
- `scope_note` (`string`): the page boundary in Originium terms
- `industries` (`string_list`)
- `product_families` (`string_list`)
- `source_confidence` (`controlled_string`): high, medium, low, or mixed
- `primary_sources` (`string_list`): Source Document identifiers or slugs
- `retrieval_terms` (`string_list`): terms that should find this page

### Requirement Set

**Record scope:** `wiki_page`

**Scope note:** A page that groups constraints, objectives, or design
requirements for a specific system, deployment, or operational context.
Requirement Sets should preserve enough scope to avoid mixing requirements from
different industries or architecture levels.

**Examples:**

- `System Requirements`
- `Quality of Service (QoS) Requirements`
- `Network Requirements`
- `Mining Use-Cases and Requirements`

**Non-examples:**

- A single product capability with no stated constraint
- A procedure step that happens to include a prerequisite

**Recommended metadata slots:**

- `requirement_domain` (`string`): network, QoS, safety, security, mobility,
  operations, or integration
- `industries` (`string_list`)
- `applicable_scenarios` (`string_list`)
- `requirement_level` (`controlled_string`): mandatory, recommended, optional,
  or informational
- `measurement_terms` (`string_list`): latency, packet loss, availability,
  throughput, or related terms
- `source_confidence` (`controlled_string`)
- `primary_sources` (`string_list`)

### Procedure

**Record scope:** `wiki_page`

**Scope note:** A task-oriented page that describes ordered actions, operator
inputs, configuration flow, validation checks, or recovery steps. Procedures
should be framed around the operation being performed, not just the product
involved.

**Examples:**

- `CURWB Device Initial Setup and Configuration`
- `Configure the FAN REP Ring Using the REP Workflow`
- Direct Transfer Trip setup or validation procedures from
  `Direct-Transfer-Trip-Design-and-Implementation-Guide.pdf`

**Non-examples:**

- A Technology Component overview
- A Reference Architecture diagram without executable steps

**Recommended metadata slots:**

- `operation` (`string`): concise operation name
- `target_operator` (`string`)
- `prerequisites` (`string_list`)
- `inputs` (`string_list`): required credentials, files, hardware, or network
  context
- `validation_steps` (`string_list`)
- `risk_notes` (`string_list`)
- `product_families` (`string_list`)
- `primary_sources` (`string_list`)

### Technology Component

**Record scope:** `wiki_page`

**Scope note:** A page about a product, protocol, hardware component, software
capability, or solution building block that appears across architectures and
procedures. The frame should capture what the component is and where it fits,
not every configuration detail.

**Examples:**

- `Cisco Ultra-Reliable Wireless Backhaul (CURWB)`
- `Wireless Network Components`
- `Cisco IE3x00 Rugged Industrial Switches`
- `Cisco Catalyst Center`
- `DNP3`

**Non-examples:**

- A complete deployment pattern using the component
- A business solution brief that mentions the component only in passing

**Recommended metadata slots:**

- `component_type` (`controlled_string`): product, protocol, hardware,
  software, service, or capability
- `vendor` (`string`)
- `product_families` (`string_list`)
- `industries` (`string_list`)
- `role_in_architecture` (`string`)
- `interfaces` (`string_list`)
- `related_requirements` (`string_list`)
- `primary_sources` (`string_list`)

### Reference Architecture

**Record scope:** `wiki_page`

**Scope note:** A page that describes a named architecture pattern with
components, relationships, zones, flows, assumptions, and design rationale.
Reference Architecture pages should be stable enough to reuse across source
sections and answer contexts.

**Examples:**

- `Single-Frequency Architecture for Small Mine Deployments`
- `Rail CBTC and Safety Reference Architecture`
- `Cisco Substation Automation Reference Architecture`
- CURWB mining autonomous operations architecture from `IA-Mining-DG.pdf`

**Non-examples:**

- A one-off topology screenshot without reusable design meaning
- A procedure that configures one part of the architecture

**Recommended metadata slots:**

- `architecture_name` (`string`)
- `industries` (`string_list`)
- `deployment_scale` (`string`): site, fleet, plant, utility, rail line, or
  region
- `components` (`string_list`)
- `design_assumptions` (`string_list`)
- `supported_use_cases` (`string_list`)
- `risk_notes` (`string_list`)
- `primary_sources` (`string_list`)

### Deployment Pattern

**Record scope:** `wiki_page`

**Scope note:** A repeatable deployment shape or topology variant that explains
when and how a system is arranged. Deployment Patterns are narrower than
Reference Architectures and often name scale, frequency, redundancy, placement,
or connectivity choices.

**Examples:**

- `Single-Frequency Architecture for Small Mine Deployments`
- CURWB vehicle network deployment patterns from `IA-Mining-DG.pdf`
- Secure cellular roadway deployment patterns from
  `Secure-Cellular-Roadways-CVD-Solution-Guide.pdf`

**Non-examples:**

- A technology component that can appear in many patterns
- A broad industry solution brief with no concrete topology choice

**Recommended metadata slots:**

- `pattern_name` (`string`)
- `deployment_context` (`string`)
- `industries` (`string_list`)
- `scale_constraints` (`string_list`)
- `network_assumptions` (`string_list`)
- `components` (`string_list`)
- `tradeoffs` (`string_list`)
- `primary_sources` (`string_list`)

### Use Case

**Record scope:** `wiki_page`

**Scope note:** A page that describes a user, operator, or operational scenario
that the graph should retrieve as a reason for architecture, requirements, or
procedure choices. Use Cases should name the operational goal and context.

**Examples:**

- `Mining Use-Cases and Requirements`
- `Offshore Wind Farm Use Cases`
- Autonomous haulage or tele-remote mining operations from `IA-Mining-DG.pdf`
- Roadway intersection safety from
  `connected-roadways-intersections-solution-brief.pdf`

**Non-examples:**

- A requirement set without an actor or operational scenario
- A product capability described without the situation it supports

**Recommended metadata slots:**

- `actors` (`string_list`): operators, systems, or stakeholders
- `operational_goal` (`string`)
- `industries` (`string_list`)
- `environment` (`string`): mine, rail corridor, substation, roadway, wind
  farm, plant, or similar context
- `success_criteria` (`string_list`)
- `related_requirements` (`string_list`)
- `supporting_architectures` (`string_list`)
- `primary_sources` (`string_list`)

### Operational Risk

**Record scope:** `wiki_page`

**Scope note:** A page that captures an operational hazard, failure mode,
security concern, safety concern, compliance issue, or reliability risk that
affects design or operations. Operational Risk pages should stay evidence
backed and should avoid becoming generic warnings.

**Examples:**

- CURWB mobility or roam-related packet-loss risk in autonomous mining
  operations
- Industrial security risks from `Industrial-Security-3-1-DG.pdf`
- Roadway infrastructure cybersecurity risk from
  `robust-cybersecurity-safeguard-roadways-infra-so.pdf`
- Timing and synchronization risk from `Terrestrial-timing_WP.pdf`

**Non-examples:**

- A normal implementation prerequisite without a failure consequence
- A marketing claim about improved safety without a stated hazard or mitigation

**Recommended metadata slots:**

- `risk_domain` (`controlled_string`): safety, security, reliability,
  availability, compliance, timing, mobility, or operations
- `affected_assets` (`string_list`)
- `trigger_conditions` (`string_list`)
- `impact` (`string`)
- `mitigations` (`string_list`)
- `severity` (`controlled_string`): low, medium, high, or unknown
- `industries` (`string_list`)
- `primary_sources` (`string_list`)
