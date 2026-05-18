const { ExpressionEngine } = require("./src/solve-js/src/engine/ExpressionEngine");
const { TimelineDiagnosticCollector } = require("./src/solve-js/src/diagnostics/index");

function warmup() {
  const eng = new ExpressionEngine("en", false);
  for (let i = 0; i < 1000; i++) {
    try { eng.evaluateExpression(`${i} + ${i}`); } catch {}
  }
}

function runBenchmarks() {
  const expressions = [
    "1 + 2", "10 * 20 + 30", "sqrt(144) + abs(-5)",
    "10% of 200", "2 ^ 10", "(3 + 4) * (8 - 2)",
    "50 kilometers to meters", "5 + 3 * 2 - 1",
  ];

  const iterations = 10000;
  const warmupIterations = 1000;
  const results = {};

  console.log("=== PRODUCTION MODE (NullDiagnosticCollector) ===");
  const prodEngine = new ExpressionEngine("en", false);
  for (const expr of expressions) {
    for (let i = 0; i < warmupIterations; i++) {
      try { prodEngine.evaluateExpression(expr); } catch {}
    }
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      try { prodEngine.evaluateExpression(expr); } catch {}
      times.push((performance.now() - t0) * 1000);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const median = times[Math.floor(times.length / 2)];
    results[expr] = { prodMean: mean, prodMedian: median };
    console.log(`  ${expr.padEnd(35)} mean: ${mean.toFixed(2).padStart(8)}μs  median: ${median.toFixed(2).padStart(8)}μs`);
  }

  console.log("\n=== DIAGNOSTIC MODE (TimelineDiagnosticCollector) ===");
  const diagEngine = new ExpressionEngine("en", true);
  for (const expr of expressions) {
    for (let i = 0; i < warmupIterations; i++) {
      try { diagEngine.evaluateExpression(expr); } catch {}
    }
    const times = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      try { diagEngine.evaluateExpression(expr); } catch {}
      times.push((performance.now() - t0) * 1000);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const median = times[Math.floor(times.length / 2)];
    results[expr].diagMean = mean;
    results[expr].diagMedian = median;
    console.log(`  ${expr.padEnd(35)} mean: ${mean.toFixed(2).padStart(8)}μs  median: ${median.toFixed(2).padStart(8)}μs`);
  }

  console.log("\n=== OVERHEAD COMPARISON ===");
  for (const expr of expressions) {
    const r = results[expr];
    const overhead = ((r.diagMean / r.prodMean) - 1) * 100;
    console.log(`  ${expr.padEnd(35)} overhead: ${overhead.toFixed(1).padStart(6)}%`);
  }

  // Full document benchmark
  console.log("\n=== DOCUMENT PARSE BENCHMARK (50 lines) ===");
  const docLines = [];
  for (let i = 0; i < 50; i++) {
    docLines.push(`:v${i} = ${i} + ${i * 2}`);
  }
  const doc = docLines.join("\n");

  const docEngine = new ExpressionEngine("en", false);
  const docTimes = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    docEngine.parseDocument(doc, { inputType: "markdown" });
    docTimes.push(performance.now() - t0);
  }
  docTimes.sort((a, b) => a - b);
  console.log(`  Production: mean=${(docTimes.reduce((a,b)=>a+b,0)/docTimes.length).toFixed(3)}ms  median=${docTimes[Math.floor(docTimes.length/2)].toFixed(3)}ms`);

  const diagDocEngine = new ExpressionEngine("en", true);
  const diagDocTimes = [];
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    diagDocEngine.parseDocument(doc, { inputType: "markdown" });
    diagDocTimes.push(performance.now() - t0);
  }
  diagDocTimes.sort((a, b) => a - b);
  console.log(`  Diagnostic: mean=${(diagDocTimes.reduce((a,b)=>a+b,0)/diagDocTimes.length).toFixed(3)}ms  median=${diagDocTimes[Math.floor(diagDocTimes.length/2)].toFixed(3)}ms`);

  // Correctness verification
  console.log("\n=== CORRECTNESS VERIFICATION ===");
  const testEngine = new ExpressionEngine("en", true);
  const testCases = [
    ["1 + 2", 3], ["2 * 3 + 4", 10], ["10% of 200", 20],
    ["sqrt(144)", 12], ["(3 + 4) * 2", 14], ["pi * 2", Math.PI * 2],
  ];
  let allPass = true;
  for (const [expr, expected] of testCases) {
    const result = testEngine.evaluateExpression(expr);
    const pass = Math.abs(result.toNumber() - expected) < 0.001;
    console.log(`  ${pass ? "PASS" : "FAIL"}: ${expr} = ${result.toNumber()} (expected ~${expected})`);
    if (!pass) allPass = false;
  }

  // Validate diagnostic report structure
  console.log("\n=== DIAGNOSTIC REPORT VALIDATION ===");
  const reportEngine = new ExpressionEngine("en", true);
  const report = reportEngine.evaluateLineWithDebug(1, "1 + 2 * 3");
  if (report.debug) {
    console.log(`  Has tokens: ${!!report.debug.events}`);
    console.log(`  Event count: ${report.debug.events.length}`);
    console.log(`  Parse categories: ${[...report.debug.summary.parseCategories.entries()].map(([k,v]) => `${k}(${v})`).join(", ")}`);
    console.log(`  Total opcodes: ${report.debug.summary.totalOpcodes}`);
    console.log(`  Cache hit: ${report.debug.summary.cacheHit}`);
    console.log(`  VM trace enabled: ${report.debug.metadata.vmTraceEnabled}`);
    const parseletEvents = report.debug.events.filter((e) => e.type === "parselet_matched");
    console.log(`  Parselet matched events: ${parseletEvents.length}`);
    if (parseletEvents.length > 0) {
      console.log(`  First parselet: category=${parseletEvents[0].parseletCategory} type=${parseletEvents[0].parseletType}`);
    }
  } else {
    console.log("  FAIL: No debug report returned");
  }

  // Verify getParsletTypeForToken is gone
  console.log("\n=== VERIFY getParsletTypeForToken REMOVED ===");
  const engineProto = Object.getPrototypeOf(reportEngine);
  if (typeof engineProto.getParseletTypeForToken === "function") {
    console.log("  FAIL: getParsletTypeForToken still exists");
    allPass = false;
  } else {
    console.log("  PASS: getParsletTypeForToken removed from engine");
  }

  console.log(`\n=== RESULT: ${allPass ? "ALL TESTS PASSED" : "SOME TESTS FAILED"} ===`);
}

warmup();
runBenchmarks();