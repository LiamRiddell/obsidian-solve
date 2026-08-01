import { registerPackageForTesting } from "@tools/testUtils";
import { ARITHMETIC_PACKAGE, DATETIME_PACKAGE, UOM_PACKAGE, VARIABLES_PACKAGE } from "@solve-js/packages";
import { describe, expect, test } from "@jest/globals";
import { Lexer } from "@solve-js/lexer/Lexer";
import { TokenTypes } from "@solve-js/lexer/Token";
import { Parser } from "@solve-js/parser/Parser";
import { ParseletRegistry } from "@solve-js/parser/registry/ParseletRegistry";
import { BytecodeBuilder } from "@solve-js/parser/BytecodeBuilder";




import { createVM, executeBytecode, unwrapEvalResult } from "@solve-js/vm/VM";
import { sharedOpRegistry } from "@solve-js/vm/OpRegistry";
import { Value, ValueType } from "@solve-js/vm/Value";

function tokenize(lexer: Lexer, input: string) {
  lexer.reset(input);
  const tokens = [];
  for (const t of lexer) {
    if (t.type === TokenTypes.WS || t.type === "NEWLINE") continue;
    tokens.push(t);
  }
  return tokens;
}

function parseAndExecute(input: string, variables: Map<string, Value> = new Map()): Value {
  const lexer = new Lexer();
  const tokens = tokenize(lexer, input);
  const registry = new ParseletRegistry();
  registerPackageForTesting(ARITHMETIC_PACKAGE, registry);
  registerPackageForTesting(DATETIME_PACKAGE, registry);
  registerPackageForTesting(UOM_PACKAGE, registry);
  registerPackageForTesting(VARIABLES_PACKAGE, registry);
  const parser = new Parser(registry);
  const builder = new BytecodeBuilder();
  parser.load(tokens);
  parser.parseExpression(0, builder);
  const program = builder.build();
  const vmUint8 = new Uint8Array(program.opcodes);
  const vmFloat64 = new Float64Array(program.numbers);
  const vm = createVM(sharedOpRegistry);
  
  // Set variables
  for (const [key, value] of variables) {
    vm.setVar(key, value);
  }
  
  const result = executeBytecode(
    { opcodes: vmUint8, numbers: vmFloat64, strings: program.strings },
    vm
  );
  return unwrapEvalResult(result);
}

describe("User Scenario Test", () => {
  test("variable assignment and arithmetic with TimeSpan", () => {
    const variables = new Map<string, Value>();
    
    // :researchDays = 14 days
    const researchDays = parseAndExecute("14 days");
    expect(researchDays.type).toBe(ValueType.Uom);
    expect(researchDays.value).toBe(14);
    expect(researchDays.unit).toBe("days");
    variables.set("researchDays", researchDays);
    
    // :developmentWeeks = 6 weeks
    const developmentWeeks = parseAndExecute("6 weeks");
    expect(developmentWeeks.type).toBe(ValueType.Uom);
    expect(developmentWeeks.value).toBe(6);
    expect(developmentWeeks.unit).toBe("weeks");
    variables.set("developmentWeeks", developmentWeeks);
    
    // :testingDays = 5 days
    const testingDays = parseAndExecute("5 days");
    expect(testingDays.type).toBe(ValueType.Uom);
    expect(testingDays.value).toBe(5);
    expect(testingDays.unit).toBe("days");
    variables.set("testingDays", testingDays);
    
    // :researchEnd = :startDate + :researchDays (using now for startDate)
    const now = parseAndExecute("now");
    expect(now.type).toBe(ValueType.Datetime);
    
    const researchEnd = parseAndExecute(":startDate + :researchDays", new Map([["startDate", now], ["researchDays", researchDays]]));
    expect(researchEnd.type).toBe(ValueType.Datetime);
    
    // :devEnd = :researchEnd + :developmentWeeks
    const devEnd = parseAndExecute(":researchEnd + :developmentWeeks", new Map([["researchEnd", researchEnd], ["developmentWeeks", developmentWeeks]]));
    expect(devEnd.type).toBe(ValueType.Datetime);
    
    // :projectEnd = :devEnd + :testingDays
    const projectEnd = parseAndExecute(":devEnd + :testingDays", new Map([["devEnd", devEnd], ["testingDays", testingDays]]));
    expect(projectEnd.type).toBe(ValueType.Datetime);
  });
});
