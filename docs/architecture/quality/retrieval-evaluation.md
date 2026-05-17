# Graph-Native Retrieval Evaluation

This lightweight set keeps Cisco corpus retrieval changes testable without
requiring the full corpus to be synthesized into Wiki Pages first. Each
question names expected evidence areas rather than fixed answer prose.

Run this after applying schema, importing at least the Cisco industry PDFs under
`fixtures/source-documents/cisco-industries/`, building Source Headings and
Source Text Projections, and refreshing retrieval embeddings in batches:

```bash
bun run cli db apply-schema
bun run cli source list
bun run cli source evidence "<question terms>" --limit 5
bun run cli page candidates "<concept>"
bun run cli retrieval search "<question terms>"
bun run cli graph neighborhood <wiki-page-or-source-heading-id>
```

Result classification:

- `pass`: expected Source Documents or Wiki Pages appear in retrieval, evidence
  search, or graph neighborhood output with usable IDs and page ranges.
- `tooling-fail`: command failure, missing concrete error context, missing page
  range, missing source/heading IDs, or stale POC-only ranking.
- `indexing-gap`: retrieval tooling works, but the expected Wiki Page synthesis
  has not been indexed yet.
- `not-applicable`: the source document is not imported in the local validation
  database.

## Questions

1. How do autonomous mining operations depend on CURWB mobility behavior?
   Expected evidence: `IA-Mining-DG.pdf`, autonomous or tele-remote operations,
   CURWB mobility, roam/packet-loss, vehicle network sections.

2. What Cisco industrial switching and wireless components are common across
   mining and industrial automation designs?
   Expected evidence: `IA-Mining-DG.pdf`, `Industrial-Automation-WirelessDG.pdf`,
   `IA_Networking_Solution_Brief.pdf`, Catalyst IE switches, wireless backhaul.

3. How do utility distribution automation and direct transfer trip designs treat
   latency, resiliency, and WAN transport?
   Expected evidence: `m-da-architecture-for-utilities.pdf`,
   `Direct-Transfer-Trip-Design-and-Implementation-Guide.pdf`,
   `WAN-Utility-SA.pdf`.

4. Which security controls recur across industrial security, roadways, and
   distributed energy infrastructure?
   Expected evidence: `Industrial-Security-3-1-DG.pdf`,
   `robust-cybersecurity-safeguard-roadways-infra-so.pdf`,
   `secure-distrib-energy-infra-sd-wan.pdf`.

5. How do wind farm and distributed energy documents describe segmentation,
   remote access, and high availability?
   Expected evidence: `Wind-Farm_1-3_Design_Guide.pdf`,
   `wind-farm-IG-1-2.pdf`, `secure-distrib-energy-infra-sd-wan.pdf`.

6. Where does the Cisco corpus discuss SCADA, DNP3 discovery, and utility
   operational visibility?
   Expected evidence: `SCADA-over-PW.pdf`, `DNP3-Active-Discovery-White-Paper.pdf`,
   utility architecture documents.

7. What evidence connects rail CBTC safety requirements with network
   architecture and implementation guidance?
   Expected evidence: `Rail_CBTC_Design_Guide.pdf`,
   `Rail-CBTC-Implementation-Guide.pdf`,
   `connected-rail-cbtc-and-safety-solution-brief.pdf`.

8. How do roadway/intersection solution documents treat cellular, security, and
   operational continuity?
   Expected evidence: `connected-roadways-intersections-solution-brief.pdf`,
   `Secure-Cellular-Roadways-CVD-Solution-Guide.pdf`,
   `DA-DTT-over-cellular-SB.pdf`.

9. Which documents discuss compliance, industrial operations, and network
   information security as separate but linked concerns?
   Expected evidence: `compliance-industrial-operations-so.pdf`,
   `network-info-security-wp.pdf`, industrial security documents.

10. How do machine vision, oil and gas, and mining automation documents differ
    in their stated operational requirements while reusing industrial network
    foundations?
    Expected evidence: `IA-Machine-Vision-DIG.pdf`,
    `Industrial_Automation_in_Oil_and_Gas_AAG.pdf`,
    `Industrial_Automation_in_Mining_AAG.pdf`.

11. Which documents should an indexer inspect before broadening a Wiki Page about
    Cisco Catalyst Center for industrial automation?
    Expected evidence: `Cisco_Catalyst_Center_for_IA_SB.pdf`,
    industrial networking solution briefs, related Catalyst/management sections.

12. What graph neighborhood should be visible for an indexed page about CURWB in
    autonomous mining?
    Expected evidence: outbound Citations to CURWB/autonomous mining headings,
    Manual Links to broader mining autonomy or industrial wireless pages, and
    Source Headings cited by multiple pages when indexing has run.
