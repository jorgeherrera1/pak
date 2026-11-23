# Knowledge Graph Implementation Plan

The requirement and entity tasks this plan used to contain are gone. The
graph stores the document tree and, after check, one SRS run from
`packages/srs`. There is no classification store.

What stayed true:

- `writeDocument` replaces every node for a job, so a retried parse does not
  duplicate the document. A second write of the same run does not duplicate
  that run.
- `readDocument` returns null when the job has no document.
- Text is passed as a query parameter, never inlined into the Cypher string.
- The reading-order property is `position`. Every structure node carries
  `jobId`.
- App code does not `LOAD 'age'` and does not set `search_path`.

The check step calls `writeGraph` only after the completeness check passes.
Labels come from the vocabulary. The agent never opens Postgres.
