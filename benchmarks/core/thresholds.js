/**
  * Benchmark Threshold Configuration
  *
  * Defines acceptable performance thresholds.
  * When a benchmark exceeds its threshold in CI mode, the build fails.
  */
/**
 * Performance thresholds — adjust these as benchmarks are established.
 * These are generous initial values that will be tightened as optimizations land.
 */
export const THRESHOLDS = [
    // Lexer benchmarks
    { name: "lexer:simple_arithmetic", maxMeanMs: 0.1 },
    { name: "lexer:unicode_math", maxMeanMs: 0.1 },
    { name: "lexer:keywords", maxMeanMs: 0.1 },
    { name: "lexer:mixed_expression", maxMeanMs: 0.2 },
    { name: "lexer:long_expression", maxMeanMs: 1.0 },
    { name: "lexer:inline_solve", maxMeanMs: 0.1 },
    { name: "lexer:full_markdown_line", maxMeanMs: 0.3 },
    // Parser benchmarks
    { name: "parser:simple_arithmetic", maxMeanMs: 0.2 },
    { name: "parser:complex_expression", maxMeanMs: 0.5 },
    { name: "parser:function_call", maxMeanMs: 0.3 },
    // VM benchmarks
    { name: "vm:simple_add", maxMeanMs: 0.05 },
    { name: "vm:function_call", maxMeanMs: 0.1 },
    { name: "vm:variable_access", maxMeanMs: 0.05 },
    // Pipeline benchmarks
    { name: "pipeline:single_eval_cold", maxMeanMs: 1.0 },
    { name: "pipeline:single_eval_warm", maxMeanMs: 0.1 },
    { name: "pipeline:100_line_doc", maxMeanMs: 50 },
    { name: "pipeline:variable_chain", maxMeanMs: 1.0 },
    // Max multipliers — anything exceeding these is a regression
    { name: "*", maxMeanMs: 1000, maxMultiplier: 3.0 },
];
/**
 * Check benchmark results against thresholds.
 * Returns list of violation messages (empty = all passed).
 */
export function checkThresholds(results, thresholds = THRESHOLDS) {
    const violations = [];
    for (const config of thresholds) {
        if (config.name === "*") {
            // Wildcard threshold — applies to all benchmarks
            for (const [, result] of results) {
                if (config.maxMeanMs && result.mean > config.maxMeanMs) {
                    violations.push(`${result.name}: mean ${result.mean.toFixed(3)}ms exceeds ${config.maxMeanMs}ms`);
                }
            }
            continue;
        }
        // Exact match
        const result = results.get(config.name);
        if (!result)
            continue;
        if (config.maxMeanMs && result.mean > config.maxMeanMs) {
            violations.push(`${config.name}: mean ${result.mean.toFixed(3)}ms exceeds ${config.maxMeanMs}ms`);
        }
        if (config.maxMultiplier) {
            // Would need baseline to check multiplier — handled in comparison mode
        }
    }
    return violations;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhyZXNob2xkcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRocmVzaG9sZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7O0lBS0k7QUFhSjs7O0dBR0c7QUFDSCxNQUFNLENBQUMsTUFBTSxVQUFVLEdBQXNCO0lBQzNDLG1CQUFtQjtJQUNuQixFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ25ELEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFDOUMsRUFBRSxJQUFJLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUMxQyxFQUFFLElBQUksRUFBRSx3QkFBd0IsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ2xELEVBQUUsSUFBSSxFQUFFLHVCQUF1QixFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFDakQsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUM5QyxFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBRXBELG9CQUFvQjtJQUNwQixFQUFFLElBQUksRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3BELEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFDckQsRUFBRSxJQUFJLEVBQUUsc0JBQXNCLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUVoRCxnQkFBZ0I7SUFDaEIsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUU7SUFDMUMsRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRTtJQUM1QyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO0lBRS9DLHNCQUFzQjtJQUN0QixFQUFFLElBQUksRUFBRSwyQkFBMkIsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBQ3JELEVBQUUsSUFBSSxFQUFFLDJCQUEyQixFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUU7SUFDckQsRUFBRSxJQUFJLEVBQUUsdUJBQXVCLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRTtJQUNoRCxFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBRW5ELDZEQUE2RDtJQUM3RCxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsR0FBRyxFQUFFO0NBQ25ELENBQUM7QUFFRjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsZUFBZSxDQUM3QixPQUFxQyxFQUNyQyxhQUFnQyxVQUFVO0lBRTFDLE1BQU0sVUFBVSxHQUFhLEVBQUUsQ0FBQztJQUVoQyxLQUFLLE1BQU0sTUFBTSxJQUFJLFVBQVUsRUFBRTtRQUMvQixJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssR0FBRyxFQUFFO1lBQ3ZCLGlEQUFpRDtZQUNqRCxLQUFLLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJLE9BQU8sRUFBRTtnQkFDaEMsSUFBSSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLFNBQVMsRUFBRTtvQkFDdEQsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLFVBQVUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUM7aUJBQ25HO2FBQ0Y7WUFDRCxTQUFTO1NBQ1Y7UUFFRCxjQUFjO1FBQ2QsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEMsSUFBSSxDQUFDLE1BQU07WUFBRSxTQUFTO1FBRXRCLElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUU7WUFDdEQsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sQ0FBQyxJQUFJLFVBQVUsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUM7U0FDbkc7UUFFRCxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUU7WUFDeEIsdUVBQXVFO1NBQ3hFO0tBQ0Y7SUFFRCxPQUFPLFVBQVUsQ0FBQztBQUNwQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gICogQmVuY2htYXJrIFRocmVzaG9sZCBDb25maWd1cmF0aW9uXG4gICpcbiAgKiBEZWZpbmVzIGFjY2VwdGFibGUgcGVyZm9ybWFuY2UgdGhyZXNob2xkcy5cbiAgKiBXaGVuIGEgYmVuY2htYXJrIGV4Y2VlZHMgaXRzIHRocmVzaG9sZCBpbiBDSSBtb2RlLCB0aGUgYnVpbGQgZmFpbHMuXG4gICovXG5cbmltcG9ydCB0eXBlIHsgQmVuY2htYXJrUmVzdWx0IH0gZnJvbSBcIi4vU3RhdFJ1bm5lclwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRocmVzaG9sZENvbmZpZyB7XG4gIC8qKiBCZW5jaG1hcmsgbmFtZSBwYXR0ZXJuIHRvIG1hdGNoICovXG4gIG5hbWU6IHN0cmluZztcbiAgLyoqIE1heGltdW0gYWxsb3dlZCBtZWFuIHRpbWUgaW4gbWlsbGlzZWNvbmRzICovXG4gIG1heE1lYW5NczogbnVtYmVyO1xuICAvKiogTWF4aW11bSBhbGxvd2VkIG11bHRpcGxpZXIgcmVsYXRpdmUgdG8gYmFzZWxpbmUgKGUuZy4sIDIuMCA9IDLDlyBzbG93ZXIgPSBGQUlMKSAqL1xuICBtYXhNdWx0aXBsaWVyPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIFBlcmZvcm1hbmNlIHRocmVzaG9sZHMg4oCUIGFkanVzdCB0aGVzZSBhcyBiZW5jaG1hcmtzIGFyZSBlc3RhYmxpc2hlZC5cbiAqIFRoZXNlIGFyZSBnZW5lcm91cyBpbml0aWFsIHZhbHVlcyB0aGF0IHdpbGwgYmUgdGlnaHRlbmVkIGFzIG9wdGltaXphdGlvbnMgbGFuZC5cbiAqL1xuZXhwb3J0IGNvbnN0IFRIUkVTSE9MRFM6IFRocmVzaG9sZENvbmZpZ1tdID0gW1xuICAvLyBMZXhlciBiZW5jaG1hcmtzXG4gIHsgbmFtZTogXCJsZXhlcjpzaW1wbGVfYXJpdGhtZXRpY1wiLCBtYXhNZWFuTXM6IDAuMSB9LFxuICB7IG5hbWU6IFwibGV4ZXI6dW5pY29kZV9tYXRoXCIsIG1heE1lYW5NczogMC4xIH0sXG4gIHsgbmFtZTogXCJsZXhlcjprZXl3b3Jkc1wiLCBtYXhNZWFuTXM6IDAuMSB9LFxuICB7IG5hbWU6IFwibGV4ZXI6bWl4ZWRfZXhwcmVzc2lvblwiLCBtYXhNZWFuTXM6IDAuMiB9LFxuICB7IG5hbWU6IFwibGV4ZXI6bG9uZ19leHByZXNzaW9uXCIsIG1heE1lYW5NczogMS4wIH0sXG4gIHsgbmFtZTogXCJsZXhlcjppbmxpbmVfc29sdmVcIiwgbWF4TWVhbk1zOiAwLjEgfSxcbiAgeyBuYW1lOiBcImxleGVyOmZ1bGxfbWFya2Rvd25fbGluZVwiLCBtYXhNZWFuTXM6IDAuMyB9LFxuXG4gIC8vIFBhcnNlciBiZW5jaG1hcmtzXG4gIHsgbmFtZTogXCJwYXJzZXI6c2ltcGxlX2FyaXRobWV0aWNcIiwgbWF4TWVhbk1zOiAwLjIgfSxcbiAgeyBuYW1lOiBcInBhcnNlcjpjb21wbGV4X2V4cHJlc3Npb25cIiwgbWF4TWVhbk1zOiAwLjUgfSxcbiAgeyBuYW1lOiBcInBhcnNlcjpmdW5jdGlvbl9jYWxsXCIsIG1heE1lYW5NczogMC4zIH0sXG5cbiAgLy8gVk0gYmVuY2htYXJrc1xuICB7IG5hbWU6IFwidm06c2ltcGxlX2FkZFwiLCBtYXhNZWFuTXM6IDAuMDUgfSxcbiAgeyBuYW1lOiBcInZtOmZ1bmN0aW9uX2NhbGxcIiwgbWF4TWVhbk1zOiAwLjEgfSxcbiAgeyBuYW1lOiBcInZtOnZhcmlhYmxlX2FjY2Vzc1wiLCBtYXhNZWFuTXM6IDAuMDUgfSxcblxuICAvLyBQaXBlbGluZSBiZW5jaG1hcmtzXG4gIHsgbmFtZTogXCJwaXBlbGluZTpzaW5nbGVfZXZhbF9jb2xkXCIsIG1heE1lYW5NczogMS4wIH0sXG4gIHsgbmFtZTogXCJwaXBlbGluZTpzaW5nbGVfZXZhbF93YXJtXCIsIG1heE1lYW5NczogMC4xIH0sXG4gIHsgbmFtZTogXCJwaXBlbGluZToxMDBfbGluZV9kb2NcIiwgbWF4TWVhbk1zOiA1MCB9LFxuICB7IG5hbWU6IFwicGlwZWxpbmU6dmFyaWFibGVfY2hhaW5cIiwgbWF4TWVhbk1zOiAxLjAgfSxcblxuICAvLyBNYXggbXVsdGlwbGllcnMg4oCUIGFueXRoaW5nIGV4Y2VlZGluZyB0aGVzZSBpcyBhIHJlZ3Jlc3Npb25cbiAgeyBuYW1lOiBcIipcIiwgbWF4TWVhbk1zOiAxMDAwLCBtYXhNdWx0aXBsaWVyOiAzLjAgfSxcbl07XG5cbi8qKlxuICogQ2hlY2sgYmVuY2htYXJrIHJlc3VsdHMgYWdhaW5zdCB0aHJlc2hvbGRzLlxuICogUmV0dXJucyBsaXN0IG9mIHZpb2xhdGlvbiBtZXNzYWdlcyAoZW1wdHkgPSBhbGwgcGFzc2VkKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrVGhyZXNob2xkcyhcbiAgcmVzdWx0czogTWFwPHN0cmluZywgQmVuY2htYXJrUmVzdWx0PixcbiAgdGhyZXNob2xkczogVGhyZXNob2xkQ29uZmlnW10gPSBUSFJFU0hPTERTXG4pOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHZpb2xhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBjb25maWcgb2YgdGhyZXNob2xkcykge1xuICAgIGlmIChjb25maWcubmFtZSA9PT0gXCIqXCIpIHtcbiAgICAgIC8vIFdpbGRjYXJkIHRocmVzaG9sZCDigJQgYXBwbGllcyB0byBhbGwgYmVuY2htYXJrc1xuICAgICAgZm9yIChjb25zdCBbLCByZXN1bHRdIG9mIHJlc3VsdHMpIHtcbiAgICAgICAgaWYgKGNvbmZpZy5tYXhNZWFuTXMgJiYgcmVzdWx0Lm1lYW4gPiBjb25maWcubWF4TWVhbk1zKSB7XG4gICAgICAgICAgdmlvbGF0aW9ucy5wdXNoKGAke3Jlc3VsdC5uYW1lfTogbWVhbiAke3Jlc3VsdC5tZWFuLnRvRml4ZWQoMyl9bXMgZXhjZWVkcyAke2NvbmZpZy5tYXhNZWFuTXN9bXNgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gRXhhY3QgbWF0Y2hcbiAgICBjb25zdCByZXN1bHQgPSByZXN1bHRzLmdldChjb25maWcubmFtZSk7XG4gICAgaWYgKCFyZXN1bHQpIGNvbnRpbnVlO1xuXG4gICAgaWYgKGNvbmZpZy5tYXhNZWFuTXMgJiYgcmVzdWx0Lm1lYW4gPiBjb25maWcubWF4TWVhbk1zKSB7XG4gICAgICB2aW9sYXRpb25zLnB1c2goYCR7Y29uZmlnLm5hbWV9OiBtZWFuICR7cmVzdWx0Lm1lYW4udG9GaXhlZCgzKX1tcyBleGNlZWRzICR7Y29uZmlnLm1heE1lYW5Nc31tc2ApO1xuICAgIH1cblxuICAgIGlmIChjb25maWcubWF4TXVsdGlwbGllcikge1xuICAgICAgLy8gV291bGQgbmVlZCBiYXNlbGluZSB0byBjaGVjayBtdWx0aXBsaWVyIOKAlCBoYW5kbGVkIGluIGNvbXBhcmlzb24gbW9kZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB2aW9sYXRpb25zO1xufVxuXG5leHBvcnQgdHlwZSB7IEJlbmNobWFya1Jlc3VsdCB9IGZyb20gXCIuL1N0YXRSdW5uZXJcIjsiXX0=