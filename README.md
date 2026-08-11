<div align="center">

<img src="internal/solve-github-banner.png" alt="Solve for Obsidian" width="100%" />

**A calculator built into your notes.**

Type an expression on any line and the answer appears next to it as you type.
Dates, units, percentages, currency and plain arithmetic all work in the same
note you are already writing in.

[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/LiamRiddell/obsidian-solve?style=flat&sort=semver)](https://github.com/LiamRiddell/obsidian-solve/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE.md)

[Syntax reference](https://liamriddell.github.io/solve-engine/syntax/cheatsheet/) &nbsp;•&nbsp;
[solve-engine](https://github.com/LiamRiddell/solve-engine)

</div>

> **Solve 2.0 is here.** The engine has been rewritten from scratch. The old
> Ohm.js grammar is gone, replaced by a lexer, a parser and a bytecode
> virtual machine, published separately as
> [solve-engine](https://github.com/LiamRiddell/solve-engine). Results are
> faster and more consistent, and there is now a proper
> [syntax reference](https://liamriddell.github.io/solve-engine/syntax/cheatsheet/)
> in place of the old wiki. See the
> [release notes](https://github.com/LiamRiddell/obsidian-solve/releases/tag/2.0.0)
> for the full list of changes.
>
> Going forward, new syntax and engine features ship through
> [solve-engine](https://github.com/LiamRiddell/solve-engine). This
> repository consumes it as a dependency and updates automatically when a
> new version is released. Engine feature requests and syntax questions
> belong there. This repository is for the Obsidian integration itself:
> settings, rendering and editor behaviour.

<p align="center">
  <img width="100%" src="internal/screenshot.png"/>
</p>

Solve embeds [`solve-engine`](https://github.com/LiamRiddell/solve-engine), a
standalone natural language expression engine, in Obsidian's editor. Every
line is evaluated as you type, and the result appears next to it without
leaving the note.

```solve
10 + 20 / 200 * 4              // = 10.40
days since 01/01/2023          // = 233 days
01/01/2023 + 20 days           // = Sat Jan 21 2023
15% of 2400                    // = 360
100cm + 2m                     // = 300.00 cm
$100 + $250                    // = $350.00
```

The [syntax reference](https://liamriddell.github.io/solve-engine/syntax/cheatsheet/)
is the full list of what the engine understands: arithmetic, dates,
percentages, units, currency, dice, conditionals and more. Everything on
that page works the same way inside a note.

## Install

**From Obsidian**

Open Settings, go to Community plugins, then Browse. Search for "Solve" and
click Install, then Enable.

**Manually**

Copy `main.js`, `styles.css` and `manifest.json` into
`VaultFolder/.obsidian/plugins/solve/`. Reload Obsidian and enable the
plugin from Community plugins.

## How it works

Each line is evaluated independently as you type. A result that resolves
immediately, such as arithmetic, dates or units, renders inline right away.
A result that depends on an async source, such as currency conversion or
live weather, shows a pending state until it resolves. Click a result to
commit it into the line as text.

Evaluation, caching and formatting all come from `solve-engine`. This
repository wires that engine into Obsidian's editor (CodeMirror 6) and
exposes the parts of it that make sense as user-facing settings: safety
limits, result formatting and inline solve commit behaviour. See
[solve-engine](https://github.com/LiamRiddell/solve-engine) for the engine
itself, including its architecture and design notes.

## License

MIT. See [LICENSE.md](LICENSE.md).

If it is useful to you, [sponsorship](https://github.com/sponsors/LiamRiddell)
or a [coffee](https://www.buymeacoffee.com/liamriddell) is welcome and never
expected.
