<!-- aidlc:ast-graph:start -->
## ast-graph (managed by AIDLC extension — do not edit by hand)

This project has a pre-built AST graph at `.ast-graph/graph.db`, exposed via the
`ast-graph` MCP server (auto-registered by the AIDLC VS Code extension). The
graph stores every function/class/method/import in the codebase plus their
caller→callee edges, so structural questions can be answered without grepping.

**Prefer ast-graph tools over grep/read when the question is structural.** A
single MCP call is typically 10–50 tokens; the equivalent grep+read sweep across
a 500-file repo is 5k–50k.

Reach for ast-graph first for:
- "where is X defined / who calls X / what does X call" → ast-graph `symbol`
- "if I change X, what breaks" → ast-graph `blast-radius`
- "what does this PR touch structurally" → ast-graph `changed-symbols`
- "find unreferenced code" → ast-graph `dead-code`
- "list HTTP endpoints" → ast-graph `routes`
- "where are the architectural hotspots" → ast-graph `hotspots`
- "fuzzy find a symbol by partial name" → ast-graph `search`

Keep using grep/read/edit for:
- reading function bodies, comments, docstrings (graph stores skeletons, not source)
- editing or refactoring code
- following intent, naming, or non-AST signals (config files, prose)

If the graph looks stale, ask the user to run `AIDLC: Rescan AST Graph`. The
extension also rescans automatically a few seconds after any source file save.
<!-- aidlc:ast-graph:end -->
