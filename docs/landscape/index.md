# Knowledge Graph Learning Landscape

This landscape compares adjacent open-source systems for source-backed
knowledge management, graph retrieval, adaptive learning, and agent memory.
It was created to test the learning graph direction against working systems.

Local reference clones live under `.originium/landscape/repos`. That directory
is intentionally ignored by git so the repositories can be inspected without
vendoring them into Originium.

## Documents

- [Project Notes](project-notes.md) summarizes the inspected systems and their
  product and technical approach.
- [Implications For Originium](implications-for-originium.md) distills the
  approaches that should influence Originium and the traps to avoid.

## Main Conclusion

The learning use case does not require a separate subject-matter graph from the
question-answering system. It does require separate query policies and separate
learner state.

The strongest pattern across the landscape is:

- Keep the source-backed Domain Graph canonical for retrieval and truth.
- Treat embeddings, indexes, wiki projections, graph neighborhoods, learning
  plans, and mastery estimates as derived state.
- Store learner observations as append-only events aligned to Domain Graph
  concepts, Citation locators, examples, and assessment items.
- Recompute learner mastery and scheduling projections from those observations
  when the graph or learning model changes.
- Keep generated or inferred edges visibly distinct from reviewed graph facts.

Answer retrieval and learning planning are therefore not fundamentally at odds.
They are beneficially adversarial: retrieval pressure keeps the graph cited,
global, and evidence-first; learning pressure keeps it granular, ordered, and
role-aware. The harmful failure modes are shared: unsupported dependencies,
opaque embeddings, over-broad concepts, hidden pipeline failure, and treating
generated structure as reviewed truth.

## Projects Inspected

Core LLM/wiki compilers:

- [Kompl](https://github.com/tuirk/Kompl)
- [OmegaWiki](https://github.com/skyllwt/OmegaWiki)
- [Atomic](https://github.com/kenforthewin/atomic)

Personal knowledge management and graph notebooks:

- [Logseq](https://github.com/logseq/logseq)
- [Trilium](https://github.com/TriliumNext/Trilium)
- [Tesseract](https://github.com/geckse/tesseract-md-app)

Adaptive learning and memory scheduling:

- [OATutor](https://github.com/CAHLR/OATutor)
- [Anki](https://github.com/ankitects/anki)
- [pyBKT](https://github.com/CAHLR/pyBKT)

Agent memory and retrieval knowledge bases:

- [Basic Memory](https://github.com/basicmachines-co/basic-memory)
- [Engram](https://github.com/cylian-org/engram)
- [Textrawl](https://github.com/jeffgreendesign/textrawl)

Formal knowledge graph references:

- [NeuralKG](https://github.com/zjukg/NeuralKG)
- [ORKG](https://www.orkg.org/)
- [SemTK](https://github.com/ge-semtk/semtk)
- [Semantic MediaWiki](https://www.semantic-mediawiki.org/)

## Local Clone Inventory

The local research clones were captured at these revisions:

| Project      | Local path                                    | Revision  |
| ------------ | --------------------------------------------- | --------- |
| Kompl        | `.originium/landscape/repos/Kompl`            | `ecf88a8` |
| OmegaWiki    | `.originium/landscape/repos/OmegaWiki`        | `69dfe80` |
| Atomic       | `.originium/landscape/repos/atomic`           | `6c81081` |
| OATutor      | `.originium/landscape/repos/OATutor`          | `f44029a` |
| Anki         | `.originium/landscape/repos/anki`             | `4b01f78` |
| Logseq       | `.originium/landscape/repos/logseq`           | `9ac459c` |
| Trilium      | `.originium/landscape/repos/Trilium`          | `aa2f3ad` |
| Basic Memory | `.originium/landscape/repos/basic-memory`     | `60ec672` |
| Engram       | `.originium/landscape/repos/engram`           | `84f340d` |
| Tesseract    | `.originium/landscape/repos/tesseract-md-app` | `30011d6` |
| Textrawl     | `.originium/landscape/repos/textrawl`         | `109580c` |
| NeuralKG     | `.originium/landscape/repos/NeuralKG`         | `541df91` |
| pyBKT        | `.originium/landscape/repos/pyBKT`            | `dd81770` |

## Reading The Landscape

Use this landscape as design pressure, not as an implementation blueprint.
Most systems optimize for a different center of gravity:

- PKM systems optimize for user-authored notes and navigable backlinks.
- LLM wiki compilers optimize for persistent synthesis and provenance.
- Adaptive tutors optimize for item selection from a known skill model.
- Formal KG systems optimize for structured triples and ontology validation.
- Agent memory systems optimize for durable, searchable operational memory.

Originium sits between these: source-backed graph truth, CLI-first graph
maintenance, answer retrieval, and optional learning workflows over the same
curated material.
