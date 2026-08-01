import { useMemo, useState, type ReactNode } from "react"
import { RefreshCw, Link2, BarChart3, ListChecks, GitBranch, ChevronRight } from "lucide-react"
import type { PipelineStageResult, NormalizerOutput, LexerOutput } from "@solve-js/types/DiagnosticPipelineResult"
import type { Token } from "@solve-js/lexer/Token"
import { useDiagnosticReportStore, expression as selectExpression } from "@/stores/diagnosticReport"
import { usePipelineStore } from "@/stores/pipeline"
import { ContextHeader } from "@/components/shared/ContextHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const EMPTY_NORMALIZER_OUTPUT: NormalizerOutput = { type: "normalizer", inputTokenCount: 0, outputTokenCount: 0, fusions: [], rulesApplied: [], tokens: [], phrases: {} }

const NON_WORD_TYPES = new Set([
  "NUMBER", "HEX", "BIGINT", "FLOAT", "LSHIFT", "RSHIFT", "BIT_AND", "BIT_OR", "BIT_XOR",
  "LPAREN", "RPAREN", "LBRACKET", "RBRACKET", "COMMA", "COLON", "EQUALS", "PIPE", "AMPERSAND", "AT",
  "SEMICOLON", "QUESTION", "EXCLAMATION", "EOF", "WS", "NEWLINE",
])

function tokenClass(t: { type?: string }): string {
  const type = String(t.type || "").toLowerCase()
  if (["number", "hex", "bigint"].includes(type)) return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
  if (type === "ident") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  if (["star", "plus", "minus", "slash", "caret", "equals"].includes(type)) return "border-muted-foreground/30 bg-muted text-muted-foreground"
  if (type === "keyword" || type.includes("_by")) return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
  return "border-muted-foreground/20 bg-muted text-muted-foreground"
}

interface TrieBranch {
  word: string
  tokenType: string
  path: string
  matched: boolean
  singleton: boolean
}
interface TrieRoot {
  root: string
  matched: boolean
  children: TrieBranch[]
}

interface DiffSegment {
  isFusion: boolean
  rawToken: Token | null
  sourceTokens: Token[]
  normalizedToken: Token | null
  fusedTokens: Token[]
  fusionRule: string
}

/** Ported from playground's NormalizerTab.vue. */
export function NormalizerTab() {
  const stages = useDiagnosticReportStore((s) => s.stages)
  const lineResults = useDiagnosticReportStore((s) => s.lineResults)
  const expression = useDiagnosticReportStore(selectExpression)
  const selectedLine = usePipelineStore((s) => s.selectedLine)
  const [trieExpanded, setTrieExpanded] = useState(true)

  const normalizerStage: PipelineStageResult | null = stages.find((s) => s.stage === "normalizer") ?? null
  const data: NormalizerOutput = (normalizerStage?.output as NormalizerOutput) ?? EMPTY_NORMALIZER_OUTPUT

  const rawTokens: Token[] = useMemo(() => {
    const lexer = stages.find((s) => s.stage === "lexer")
    return lexer ? ((lexer.output as LexerOutput).tokens ?? []) : []
  }, [stages])

  const tokensRemoved = data.inputTokenCount - data.outputTokenCount

  const typeGuardSkipCount = useMemo(() => rawTokens.filter((t) => NON_WORD_TYPES.has(t.type as string)).length, [rawTokens])

  const triePhrases = data.phrases ?? {}
  const triePhraseCount = Object.keys(triePhrases).length

  const trieTree = useMemo<TrieRoot[]>(() => {
    const matchedPhrases = new Set(data.fusions.map((f) => f.sourceTokens.map((s) => s.value).join(" ").toLowerCase()))
    const rootMap = new Map<string, TrieBranch[]>()
    for (const [phrase, tokenType] of Object.entries(triePhrases)) {
      const words = phrase.split(" ")
      const root = words[0]
      if (!rootMap.has(root)) rootMap.set(root, [])
      if (words.length > 1) {
        rootMap.get(root)!.push({ word: words.slice(1).join(" "), tokenType, path: phrase, matched: matchedPhrases.has(phrase), singleton: false })
      } else {
        rootMap.get(root)!.push({ word: "", tokenType, path: phrase, matched: matchedPhrases.has(phrase), singleton: true })
      }
    }
    return Array.from(rootMap.entries()).map(([root, children]) => ({ root, matched: children.some((c) => c.matched), children }))
  }, [data.fusions, triePhrases])

  const fusionConsumed = useMemo(() => {
    const consumed = new Set<number>()
    for (const f of data.fusions) {
      const sourceCount = f.sourceTokens.length
      for (let start = 0; start <= rawTokens.length - sourceCount; start++) {
        if (consumed.has(start)) continue
        let match = true
        for (let j = 0; j < sourceCount; j++) {
          const st = f.sourceTokens[j]
          const rt = rawTokens[start + j]
          if (consumed.has(start + j) || rt.type !== st.type || rt.value !== st.value) {
            match = false
            break
          }
        }
        if (match) {
          for (let j = 0; j < sourceCount; j++) consumed.add(start + j)
          break
        }
      }
    }
    return consumed
  }, [data.fusions, rawTokens])

  const fusionResults = useMemo(() => {
    const norm = data.tokens
    const results = new Set<number>()
    for (const f of data.fusions) {
      const ft = f.fusedToken
      for (let i = 0; i < norm.length; i++) {
        if (!results.has(i) && norm[i].type === ft.type && norm[i].value === ft.value) {
          results.add(i)
          break
        }
      }
    }
    return results
  }, [data.fusions, data.tokens])

  const diffSegments = useMemo<DiffSegment[]>(() => {
    const raw = rawTokens
    const norm = data.tokens
    const consumed = fusionConsumed
    const results = fusionResults
    const fusions = data.fusions
    const segments: DiffSegment[] = []
    let rawIdx = 0,
      normIdx = 0
    while (rawIdx < raw.length || normIdx < norm.length) {
      const isStartOfFusion = consumed.has(rawIdx) && !consumed.has(rawIdx - 1)
      if (isStartOfFusion && rawIdx < raw.length) {
        const fusion = fusions.find((f) => {
          for (let j = 0; j < f.sourceTokens.length; j++) {
            if (rawIdx + j >= raw.length) return false
            if (raw[rawIdx + j].type !== f.sourceTokens[j].type || raw[rawIdx + j].value !== f.sourceTokens[j].value) return false
          }
          return true
        })
        if (fusion && fusion.sourceTokens.length > 0) {
          const sourceCount = fusion.sourceTokens.length
          const fusedTokens: Token[] = []
          if (normIdx < norm.length && results.has(normIdx)) {
            fusedTokens.push(norm[normIdx])
            normIdx++
          }
          segments.push({ isFusion: true, rawToken: null, sourceTokens: fusion.sourceTokens, normalizedToken: null, fusedTokens: fusedTokens.length > 0 ? fusedTokens : [fusion.fusedToken], fusionRule: fusion.rule })
          rawIdx += sourceCount
          continue
        }
      }
      if (rawIdx < raw.length && consumed.has(rawIdx)) {
        rawIdx++
        continue
      }
      if (normIdx < norm.length && results.has(normIdx)) {
        segments.push({ isFusion: true, rawToken: null, sourceTokens: [], normalizedToken: null, fusedTokens: [norm[normIdx]], fusionRule: "fusion result" })
        normIdx++
        continue
      }
      if (rawIdx < raw.length && normIdx < norm.length) {
        segments.push({ isFusion: false, rawToken: raw[rawIdx], sourceTokens: [], normalizedToken: norm[normIdx], fusedTokens: [], fusionRule: "" })
        rawIdx++
        normIdx++
        continue
      }
      if (rawIdx < raw.length) {
        segments.push({ isFusion: false, rawToken: raw[rawIdx], sourceTokens: [], normalizedToken: null, fusedTokens: [], fusionRule: "" })
        rawIdx++
        continue
      }
      if (normIdx < norm.length) {
        segments.push({ isFusion: false, rawToken: null, sourceTokens: [], normalizedToken: norm[normIdx], fusedTokens: [], fusionRule: "" })
        normIdx++
        continue
      }
      break
    }
    return segments
  }, [rawTokens, data.tokens, data.fusions, fusionConsumed, fusionResults])

  const fusionGroups = useMemo(() => {
    const groups = new Map<string, typeof data.fusions>()
    for (const f of data.fusions) {
      if (!groups.has(f.rule)) groups.set(f.rule, [])
      groups.get(f.rule)!.push(f)
    }
    return Array.from(groups.entries()).map(([rule, fusions]) => ({ rule, fusions }))
  }, [data.fusions])

  if (!normalizerStage) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <EmptyState icon={RefreshCw} text="No normalizer data available" hint="Evaluate an expression to see token normalization details" />
      </div>
    )
  }

  const activeExpression =
    selectedLine !== null
      ? (lineResults.find((r) => r.lineNumber === selectedLine)?.expression ?? "")
      : (lineResults[0]?.expression ?? expression ?? "")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ContextHeader label="Normalizing" lineBadge={selectedLine !== null ? `L${selectedLine}` : "All Lines"} expression={activeExpression} />

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Input Tokens" value={String(data.inputTokenCount)} />
          <StatCard label="Output Tokens" value={String(data.outputTokenCount)} />
          <StatCard label="Fusions" value={String(data.fusions.length)} />
          <StatCard label="Tokens Removed" value={String(tokensRemoved)} className={tokensRemoved > 0 ? "text-destructive" : undefined} />
          <StatCard label="Type-Guard Skips" value={String(typeGuardSkipCount)} className="text-blue-600 dark:text-blue-400" />
        </div>

        {/* Token Fusions */}
        <Section icon={Link2} title="Token Fusions" tag={String(data.fusions.length)}>
          {data.fusions.length === 0 ? (
            <div className="text-muted-foreground text-sm">No tokens were fused</div>
          ) : (
            <div className="space-y-3">
              {fusionGroups.map((group, gi) => (
                <div key={gi}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{group.rule}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {group.fusions.length} fusion{group.fusions.length !== 1 ? "s" : ""}
                    </span>
                    {group.rule === "phrase-trie" && (
                      <span className="text-primary flex items-center gap-1 text-[10px]">
                        <GitBranch className="size-3" /> trie match
                      </span>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {group.fusions.map((fusion, fi) => (
                        <tr key={fi} className="border-t">
                          <td className="py-1.5">
                            <span className="flex flex-wrap gap-1">
                              {fusion.sourceTokens.map((st, si) => (
                                <span key={si} title={`${st.type}: ${st.value}`} className={cn("rounded border px-1.5 py-0.5 font-mono", tokenClass(st))}>
                                  {st.value}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="text-muted-foreground w-8 py-1.5 text-center">→</td>
                          <td className="py-1.5">
                            <span
                              title={`${fusion.fusedToken.type}: ${fusion.fusedToken.value}`}
                              className={cn("flex w-fit items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono", tokenClass(fusion.fusedToken))}
                            >
                              <span className="text-[9px] uppercase opacity-70">{fusion.fusedToken.type}</span>
                              <span className="font-semibold">{fusion.fusedToken.value}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Token Diff */}
        <Section icon={BarChart3} title="Token Diff" tag={`${rawTokens.length} → ${data.tokens.length}`}>
          <div className="mb-2 grid grid-cols-[1fr_2rem_1fr] text-xs">
            <div>
              <div className="font-medium">Raw (before)</div>
              <div className="text-muted-foreground text-[10px]">{rawTokens.length} tokens</div>
            </div>
            <div />
            <div>
              <div className="font-medium">Normalized (after)</div>
              <div className="text-muted-foreground text-[10px]">{data.tokens.length} tokens</div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {diffSegments.map((seg, si) => (
              <div key={si} className={cn("grid grid-cols-[1fr_5rem_1fr] items-center gap-1 rounded-sm px-1 py-0.5", seg.isFusion && "bg-amber-500/5")}>
                <div className="flex flex-wrap gap-1">
                  {seg.isFusion
                    ? seg.sourceTokens.map((st, ti) => (
                        <span key={ti} title={`${st.type}: ${st.value}`} className={cn("rounded border px-1.5 py-0.5 font-mono text-xs", tokenClass(st))}>
                          {st.value}
                        </span>
                      ))
                    : seg.rawToken && (
                        <span title={`${seg.rawToken.type}: ${seg.rawToken.value}`} className={cn("rounded border px-1.5 py-0.5 font-mono text-xs", tokenClass(seg.rawToken))}>
                          {seg.rawToken.value}
                        </span>
                      )}
                </div>
                <div className="text-muted-foreground text-center text-[10px]">
                  {seg.isFusion ? (
                    <span title={`Fused by rule: ${seg.fusionRule}`} className="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded px-1 py-0.5 text-[9px]">
                      {seg.fusionRule}
                    </span>
                  ) : seg.rawToken ? (
                    "→"
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {seg.isFusion ? (
                    <>
                      {seg.fusedTokens.map((ft, fi) => (
                        <span key={fi} title={`${ft.type}: ${ft.value}`} className={cn("flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs", tokenClass(ft))}>
                          <span className="text-[9px] uppercase opacity-70">{ft.type}</span>
                          <span className="font-semibold">{ft.value}</span>
                        </span>
                      ))}
                      <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded px-1 py-0.5 text-[9px]">fusion</span>
                    </>
                  ) : (
                    seg.normalizedToken && (
                      <span title={`${seg.normalizedToken.type}: ${seg.normalizedToken.value}`} className={cn("rounded border px-1.5 py-0.5 font-mono text-xs", tokenClass(seg.normalizedToken))}>
                        {seg.normalizedToken.value}
                      </span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Rules Applied */}
        <Section icon={ListChecks} title="Rules Applied" tag={String(data.rulesApplied.length)}>
          {data.rulesApplied.length === 0 ? (
            <div className="text-muted-foreground text-sm">No rules were applied</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.rulesApplied.map((r) => (
                <span
                  key={r.rule}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs",
                    r.rule === "phrase-trie" ? "border-primary/30 bg-primary/10" : "bg-muted",
                  )}
                >
                  {r.rule} <span className="text-muted-foreground">×{r.count}</span>
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* PhraseTrie Overview */}
        <Card size="sm" className="gap-0 py-0">
          <div onClick={() => setTrieExpanded((o) => !o)} className="bg-muted/50 hover:bg-muted flex cursor-pointer items-center gap-2 border-b px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <GitBranch className="size-3.5" /> PhraseTrie Overview
            </span>
            <span className="text-muted-foreground text-xs">{triePhraseCount}</span>
            <ChevronRight className={cn("ml-auto size-4 transition-transform", trieExpanded && "rotate-90")} />
          </div>
          {trieExpanded && (
            <div className="p-3">
              {triePhraseCount === 0 ? (
                <div className="text-muted-foreground text-sm">No phrases registered</div>
              ) : (
                <>
                  <div className="text-muted-foreground mb-2 text-xs">
                    The engine's full registered phrase dictionary (word-level trie, single-pass matching, longest-match-wins) — not just the phrases used in this expression.
                  </div>
                  <div className="space-y-2">
                    {trieTree.map((group) => (
                      <div key={group.root}>
                        <div className="flex items-center gap-2">
                          <span className={cn("size-1.5 rounded-full", group.matched ? "bg-primary" : "bg-muted-foreground/40")} />
                          <span className="font-mono text-sm font-semibold">{group.root}</span>
                          {group.matched && <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[9px] font-medium">matched</span>}
                        </div>
                        {group.children.length > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5 pl-6">
                            {group.children.map((child) => (
                              <div key={child.path} className="flex items-center gap-2 font-mono text-xs">
                                <span className="text-muted-foreground">├─</span>
                                <span>{child.word}</span>
                                <span className="text-muted-foreground text-[10px]">{child.tokenType}</span>
                                {child.matched ? (
                                  <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[9px] font-medium">matched</span>
                                ) : child.singleton ? (
                                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[9px]">leaf</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card size="sm">
      <div className="text-muted-foreground px-4 text-[10px] font-medium uppercase">{label}</div>
      <div className={cn("mt-0.5 px-4 font-mono text-lg font-bold", className)}>{value}</div>
    </Card>
  )
}

function Section({ icon: Icon, title, tag, children }: { icon: typeof RefreshCw; title: string; tag: string; children: ReactNode }) {
  return (
    <Card size="sm" className="gap-0 py-0">
      <div className="bg-muted/50 flex items-center gap-2 border-b px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className="size-3.5" /> {title}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">{tag}</span>
      </div>
      <div className="p-3">{children}</div>
    </Card>
  )
}
