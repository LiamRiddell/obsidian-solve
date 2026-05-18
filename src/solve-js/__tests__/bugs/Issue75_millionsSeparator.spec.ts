import { describe, expect, test, beforeEach } from "@jest/globals";
import { ExpressionEngine } from "@solve-js/engine/ExpressionEngine";

describe("Issue #75: Numbers with millions separator commas (locale-aware)", () => {
  describe("US/EN locale (1,000.00 format)", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
      engine = new ExpressionEngine("en", false);
    });

    test("comma-separated number parses as full number: 1,000 = 1000", () => {
      const result = engine.evaluateLine(1, "1,000");
      expect(result.toNumber()).toBe(1000);
    });

    test("double comma number parses: 1,000,000 = 1000000", () => {
      const result = engine.evaluateLine(1, "1,000,000");
      expect(result.toNumber()).toBe(1000000);
    });

    test("addition of comma-separated numbers", () => {
      const result = engine.evaluateLine(1, "6,962,886 + 2,680,366");
      expect(result.toNumber()).toBe(9643252);
    });

    test("decimal with commas: 1,000.5", () => {
      const result = engine.evaluateLine(1, "1,000.5 + 2,000.5");
      expect(result.toNumber()).toBe(3001);
    });

    test("no spaces around commas", () => {
      const result = engine.evaluateLine(1, "6,962,886+2,680,366");
      expect(result.toNumber()).toBe(9643252);
    });
  });

  describe("DE/DE locale (1.000,00 format)", () => {
    let engine: ExpressionEngine;

    beforeEach(() => {
      engine = new ExpressionEngine("de", false);
    });

    test("dot-separated number parses: 1.000 = 1000", () => {
      const result = engine.evaluateLine(1, "1.000");
      expect(result.toNumber()).toBe(1000);
    });

    test("double dot number parses: 1.000.000 = 1000000", () => {
      const result = engine.evaluateLine(1, "1.000.000");
      expect(result.toNumber()).toBe(1000000);
    });

    test("comma as decimal separator: 1,5 = 1.5", () => {
      const result = engine.evaluateLine(1, "1,5");
      expect(result.toNumber()).toBe(1.5);
    });

    test("EU format calculation: 1.000,5 + 2.000,5", () => {
      const result = engine.evaluateLine(1, "1.000,5 + 2.000,5");
      expect(result.toNumber()).toBe(3001);
    });

    test("addition of dot-separated numbers (DE locale)", () => {
      const result = engine.evaluateLine(1, "6.962.886 + 2.680.366");
      expect(result.toNumber()).toBe(9643252);
    });
  });
});