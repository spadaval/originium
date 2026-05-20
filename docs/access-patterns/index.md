# Graph Wiki Access Patterns

These reference documents enumerate the main ways an agent is expected to use
Originium before the Domain Model, frame, citation, and schema-lint design is
finalized.

The current graph is source-heavy and synthesis-light: many Source Documents,
many Source Headings, a smaller set of Source Text Projections, and only a few
Wiki Pages, Citations, and Manual Links. The access patterns should therefore
optimize for disciplined promotion from source material into durable graph
knowledge.

## Patterns

- [Read And Index Source Material](read-and-index-source-material.md): process a
  page, section, or chapter and create or update Wiki Pages for highly relevant
  topics.
- [Answer A Question](answer-a-question.md): answer from existing graph
  knowledge, creating or updating pages when the maintained graph is missing or
  insufficient.
- [Maintain The Graph](maintain-the-graph.md): merge pages, repair citations,
  tighten links, refine the Domain Model, and keep graph state coherent.

## Cross-Cutting Rules

- Source Documents and Source Headings are evidence inventory, not compiled
  knowledge.
- Wiki Pages are the maintained synthesis layer.
- Citations are claim-to-evidence edges. Citation-local locators should carry
  page range, quote/context, projection hash, and claim metadata when available.
- The Domain Model should guide classification, linting, and extraction. It
  should not be casually changed during ordinary question answering.
- A frame assignment is a semantic claim. If uncertain, propose or flag rather
  than silently forcing a record into the nearest frame.
- Graph maintenance should make failures concrete: name the record, operation,
  input, reason, and next action.

## Current Example Shapes

The current source corpus already suggests useful first frames:

- Source-backed concept: `wiki_page:autonomous_operations`
- Requirement set: headings such as `System Requirements`, `Quality of Service
(QoS) Requirements`, and `Network Requirements`
- Use case: headings such as `Mining Use-Cases and Requirements` and `Offshore
Wind Farm Use Cases`
- Reference architecture: headings such as `Rail CBTC and Safety Reference
Architecture` and `Cisco Substation Automation Reference Architecture`
- Procedure: headings such as `Configure the FAN REP Ring Using the REP
Workflow` and `CURWB Device Initial Setup and Configuration`
- Technology component: headings such as `Cisco Ultra-Reliable Wireless Backhaul
(CURWB) Overview`, `Wireless Network Components`, and `Cisco IE3x00 Rugged
Industrial Switches`
