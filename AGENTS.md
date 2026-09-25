## graphify

This project has a Graphify knowledge graph.

Do NOT use Graphify automatically for normal code changes, bug fixes,
small features, or focused codebase questions.

Use Graphify only when:
- the user explicitly requests Graphify with `$graphify`, or
- the task requires broad cross-module architecture/dependency analysis,
  large refactoring, or impact analysis.

For ordinary tasks, use normal targeted repository search and file reads.

When Graphify is explicitly requested:
- use `graphify query "<question>"` first,
- use `graphify path` or `graphify explain` only when useful,
- avoid broad GRAPH_REPORT.md reads unless necessary.

Do NOT run `graphify update .` after every code change unless Graphify
was used for that task or the user explicitly requests the graph to be updated.

