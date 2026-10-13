---
paths:
  - ".claude/**"
---

# Authoring `.claude/` materials

* Everything in `.claude/` is written in English.
* Placement doctrine:
  * `CLAUDE.md` — short facts valid in every session (commands, global standards, architecture core).
  * `.claude/rules/*.md` — declarative per-area invariants, auto-loaded via `paths` frontmatter when matching files are touched. One topic per file.
  * `.claude/skills/<name>/SKILL.md` — task procedures ("how to do X step by step") and on-demand orientation maps, loaded on demand; depth goes into the skill's `references/*.md`.
* Rules contain instructions, not observations of the current code state:
  * No counts, percentages, ratios, or "N files do X" — they drift with the next commit.
  * No "this technically works but avoid it" asides and no notes about existing violations. If the code is found violating a rule, report it to the user — do not write the violation into the rule.
  * Phrase prohibitions precisely: if the team may legitimately do the thing as a deliberate change, state what the change requires instead of an absolute "never".
* Verify every claim against the code before writing it; name the mechanism (file, function) rather than describing behaviour from memory.
* Write directives, not descriptions — in rules and in a skill's procedural sections; orientation maps describe by design. A bullet that only states how something works leaves the agent guessing what to do — say what to do, then name the mechanism that makes it work. Keep bullets focused: when one carries several independent rules, split it or promote the group to its own sub-section.
* Rules layer additively — a specific rule must complement, never contradict, a more general one that loads alongside it, and must not restate what the broader one already says. When a fact spans several areas, state it once in the broadest file that covers them all.
* Scope `paths:` to everywhere the invariant APPLIES, not just where the mechanism LIVES — a rule that loads only for the module implementing a mechanism never reaches the code that misuses it. When broad scoping would be noise, put the one-line invariant in `CLAUDE.md` with an explicit pointer to the rule file; an agent can read any rule on demand, the globs only control automatic loading.
* Skills: the `description` frontmatter opens with what the skill does and its key use case, lists concrete triggers (user phrasings, keywords, file areas) and closes with a `Critically:` sentence preempting the wrong default an agent would otherwise follow. Procedures live in skills, invariants in rules — reference the other side instead of duplicating it.
* Skill files are uniform: frontmatter carries `name` and `description` only; every skill ends with a `## Boundaries` section routing to other skills and rules, preceded by `## Reference files` (the skill's `references/*.md` plus key repo files) — mandatory when a `references/` folder exists, omittable in a skill without one whose key files are already cited inline.
* A skill that creates code artifacts points at real reference implementations to copy from — as a copy-from-these table when the artifacts vary by shape, or named in prose when one reference shape suffices; a new file is never written from a blank page.
* Prefer pointing at a self-documenting file or a real reference implementation over copying its inventory — copied enumerations drift with the next commit.
* Every code sample is real — quoted from an actual file or verified against one, using real symbols and constants.
* Terms the suite marks as routinely confused (an alias `tenant_name` vs the underlying index `tenant_name-<uuid>` in CLAUDE.md) keep their exact sense in every `.claude/` file.
* In prose, cite a rule as `` `<name>.md` rule `` and a skill as `` `<name>` skill ``; full `.claude/...` paths belong only in `## Reference files` sections and in CLAUDE.md's pointers to rule files.
* New or revised material is verified before the user reads it — claim by claim against the actual code.
* Formatting: no hard-wrapping — one paragraph or bullet per line, however long. Write a skill's `description` as a `>-` block scalar holding one long line (the block form keeps `:` and quotes in the text YAML-safe; the single line matches the body style).
* When editing an existing material, the default is correction: replace or delete only what became untrue and leave the surrounding text alone. Whether an edit is warranted at all is governed by the `.claude/` sync rule in CLAUDE.md.
