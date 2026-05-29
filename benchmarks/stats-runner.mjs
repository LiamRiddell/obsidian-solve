/**
 * Stats Runner — runs all 8 benchmarks N times each, computes mean/stddev/min/max.
 *
 * Usage: node benchmarks/stats-runner.mjs [runs=5]
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESULTS_DIR = join(ROOT, "src", "solve-js", "benchmarks", "results");
const RUNS = parseInt(process.argv[2], 10) || 5;
const SCRIPT_START = Date.now();

// ─── Extraction helpers (must be defined before BENCHMARKS) ────────────

function extractScalarResults(json) {
  const out = {};
  for (const [key, val] of Object.entries(json.results)) {
    if (typeof val === "number") out[key] = [val];
  }
  return out;
}

function extractPool(json) {
  const out = {};
  for (const d of json.details) {
    out[`${d.name}/noPool`] = [d.withoutPool.meanNs];
    out[`${d.name}/pooled`] = [d.withPool.meanNs];
    out[`${d.name}/delta`] = [d.deltaNs];
  }
  out["summary_meanDeltaNs"] = [json.summary.meanDeltaNs];
  out["summary_meanPercent"] = [json.summary.meanPercentImprovement];
  return out;
}

function extractThroughput(json) {
  const out = {};
  for (const [tier, modes] of Object.entries(json.tiers)) {
    for (const [mode, data] of Object.entries(modes)) {
      out[`${tier}/${mode}/meanMs`] = [data.meanMs];
      out[`${tier}/${mode}/opsPerSec`] = [data.opsPerSec];
    }
  }
  if (json.stageBreakdown) {
    for (const [key, val] of Object.entries(json.stageBreakdown)) {
      if (typeof val === "number") out[`stage/${key}`] = [val];
    }
  }
  return out;
}

function extractParseCompile(json) {
  const out = {};
  for (const [key, val] of Object.entries(json.results)) {
    out[`${key}/meanUs`] = [val.meanUs];
    out[`${key}/opsPerUs`] = [val.opsPerUs];
    out[`${key}/opcodes`] = [val.opcodeCount];
  }
  out["summary/meanUs"] = [json.summary.meanUs];
  out["summary/minUs"] = [json.summary.minUs];
  out["summary/maxUs"] = [json.summary.maxUs];
  out["summary/meanOpcodes"] = [json.summary.meanOpcodesPerExpr];
  return out;
}

// ─── Benchmark definitions ────────────────────────────────────────────

const BENCHMARKS = [
  {
    name: "Lexer",
    spec: "src/solve-js/__tests__/benchmarks/lexerBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "lexer-baseline.json"),
    extract: extractScalarResults,
    unit: "ms",
    lowerIsBetter: true,
  },
  {
    name: "Parser",
    spec: "src/solve-js/__tests__/benchmarks/parserBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "parser-baseline.json"),
    extract: extractScalarResults,
    unit: "ms",
    lowerIsBetter: true,
  },
  {
    name: "Pipeline",
    spec: "src/solve-js/__tests__/benchmarks/pipelineBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "pipeline-baseline.json"),
    extract: extractScalarResults,
    unit: "ms",
    lowerIsBetter: true,
  },
  {
    name: "VM",
    spec: "src/solve-js/__tests__/benchmarks/vmBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "vm-baseline.json"),
    extract: extractScalarResults,
    unit: "μs",
    lowerIsBetter: true,
  },
  {
    name: "Builder Pool",
    spec: "src/solve-js/__tests__/benchmarks/builderPoolBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "builder-pool-baseline.json"),
    extract: extractPool,
    unit: "ns",
    lowerIsBetter: true,
  },
  {
    name: "VM Pool",
    spec: "src/solve-js/__tests__/benchmarks/vmPoolBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "vm-pool-baseline.json"),
    extract: extractPool,
    unit: "ns",
    lowerIsBetter: true,
  },
  {
    name: "Full Throughput",
    spec: "src/solve-js/__tests__/benchmarks/fullPipelineThroughputBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "full-pipeline-throughput-baseline.json"),
    extract: extractThroughput,
    unit: "",
    lowerIsBetter: true,
  },
  {
    name: "Parse+Compile Micro",
    spec: "src/solve-js/__tests__/benchmarks/parseCompileMicroBenchmarks.spec.ts",
    baseline: join(RESULTS_DIR, "parse-compile-baseline.json"),
    extract: extractParseCompile,
    unit: "μs",
    lowerIsBetter: true,
  },
];

// ─── Stats ─────────────────────────────────────────────────────────────

function computeStats(values) {
  const n = values.length;
  if (n < 2) return { mean: values[0], stddev: 0, min: values[0], max: values[0], n };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, stddev: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values), n };
}

// ─── Main ──────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════╗");
console.log(`║  Stats Runner — ${RUNS} runs × ${BENCHMARKS.length} benchmarks             ║`);
console.log("╚══════════════════════════════════════════════════════════╝\n");

const allStats = {};

for (const bm of BENCHMARKS) {
  const bmStart = Date.now();
  console.log(`\n── ${bm.name} ──`.padEnd(60, "─"));

  for (let run = 1; run <= RUNS; run++) {
    const runStart = Date.now();
    process.stdout.write(`  Run ${run}/${RUNS}... `);

    try {
      execSync(
        `npx jest --no-coverage --silent "${join(ROOT, bm.spec)}"`,
        {
          cwd: ROOT,
          stdio: "pipe",
          timeout: 300_000,
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
        }
      );
    } catch (err) {
      // jest returns non-zero if tests fail — still read baseline
    }

    try {
      const json = JSON.parse(readFileSync(bm.baseline, "utf-8"));
      const extracted = bm.extract(json);

      for (const [key, arr] of Object.entries(extracted)) {
        const fqKey = `${bm.name}::${key}`;
        if (!allStats[fqKey]) allStats[fqKey] = [];
        allStats[fqKey].push(arr[0]);
      }

      const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
      console.log(`OK (${elapsed}s)`);
    } catch (err) {
      console.log(`MISSING BASELINE: ${err.message.slice(0, 80)}`);
    }
  }

  const bmElapsed = ((Date.now() - bmStart) / 1000).toFixed(1);
  console.log(`  Done in ${bmElapsed}s`);
}

// ─── Compute stats ────────────────────────────────────────────────────

console.log("\n\n╔══════════════════════════════════════════════════════════╗");
console.log("║  STATISTICAL SUMMARY                                   ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// Group by benchmark
const grouped = {};
for (const [fqKey, values] of Object.entries(allStats)) {
  const [bmName, ...metricParts] = fqKey.split("::");
  const metric = metricParts.join("::");
  if (!grouped[bmName]) grouped[bmName] = {};
  grouped[bmName][metric] = computeStats(values);
}

// Print each benchmark
for (const bm of BENCHMARKS) {
  const data = grouped[bm.name];
  if (!data) continue;

  console.log(`\n### ${bm.name}`);
  console.log("| Metric | Mean | ± StdDev | Min | Max | CV% |");
  console.log("|--------|------|----------|-----|-----|-----|");

  const entries = Object.entries(data);
  // Show summary rows last
  entries.sort((a, b) => {
    const aSum = a[0].startsWith("summary") ? 1 : 0;
    const bSum = b[0].startsWith("summary") ? 1 : 0;
    return aSum - bSum;
  });

  for (const [metric, stats] of entries) {
    const unit = bm.unit;
    const cv = stats.mean !== 0 ? ((stats.stddev / Math.abs(stats.mean)) * 100).toFixed(1) : "0.0";
    const fmtMean = formatNum(stats.mean);
    const fmtStd = formatNum(stats.stddev);
    const fmtMin = formatNum(stats.min);
    const fmtMax = formatNum(stats.max);

    console.log(
      `| \`${metric}\` | ${fmtMean}${unit} | ±${fmtStd} | ${fmtMin} | ${fmtMax} | ${cv}% |`
    );
  }

  if (bm.name === "Full Throughput" && data["stage/parseCompilePercent"]) {
    const s = data["stage/parseCompilePercent"];
    console.log(`\n> ⚡ **Parse+Compile % of pipeline**: ${s.mean.toFixed(1)}% ±${s.stddev.toFixed(1)}%`);
  }
  if (bm.name === "Parse+Compile Micro" && data["summary/meanUs"]) {
    const s = data["summary/meanUs"];
    console.log(`\n> ⚡ **Parse+Compile mean**: ${s.mean.toFixed(3)} μs ±${s.stddev.toFixed(3)} μs (CV ${(s.stddev/s.mean*100).toFixed(1)}%)`);
  }
}

// ─── Cross-benchmark comparsion (affected vs unaffected) ──────────────

console.log("\n\n### 📈 Cross-Benchmark Summary");
console.log("| Benchmark | Key Metric | Mean | ± StdDev | CV% |");
console.log("|-----------|------------|------|----------|-----|");

const keyMetrics = [
  { bm: "Lexer", metric: "simple_arithmetic", label: "simple_arithmetic (ms)" },
  { bm: "Parser", metric: "mixed", label: "mixed expr (ms)" },
  { bm: "Pipeline", metric: "single_eval_warm", label: "single_eval_warm (ms)" },
  { bm: "VM", metric: "simple_add", label: "simple_add (μs)" },
  { bm: "Builder Pool", metric: "summary_meanDeltaNs", label: "mean pool delta (ns)" },
  { bm: "VM Pool", metric: "summary_meanDeltaNs", label: "mean pool delta (ns)" },
  { bm: "Full Throughput", metric: "stage/parseCompilePercent", label: "parse+compile %" },
  { bm: "Parse+Compile Micro", metric: "summary/meanUs", label: "mean μs/expr" },
];

for (const km of keyMetrics) {
  const stats = grouped[km.bm]?.[km.metric];
  if (!stats) continue;
  const cv = stats.mean !== 0 ? ((stats.stddev / Math.abs(stats.mean)) * 100).toFixed(1) : "0.0";
  console.log(`| ${km.bm} | ${km.label} | ${formatNum(stats.mean)} | ±${formatNum(stats.stddev)} | ${cv}% |`);
}

console.log(`\nDone in ${((Date.now() - SCRIPT_START) / 1000).toFixed(0)}s.`);

function formatNum(n) {
  if (n === 0) return "0";
  if (Math.abs(n) < 0.001) return n.toExponential(3);
  if (Math.abs(n) < 1) return n.toFixed(4);
  if (Math.abs(n) < 10) return n.toFixed(3);
  if (Math.abs(n) < 100) return n.toFixed(2);
  return n.toFixed(1);
}
