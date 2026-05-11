import { describe, expect, test } from "@jest/globals";
import {
	ASTNode,
	NumberNode,
	StringNode,
	BinOpNode,
	BinaryOperator,
	UnaryOpNode,
	UnaryOperator,
} from "@/engine/ast";
import { ISolverVisitor } from "@/engine/ast/visitors/ISolverVisitor";

class TestSolverVisitor implements ISolverVisitor<number> {
	visitNumberNode(node: NumberNode): number {
		return Number(node.value);
	}
	visitStringNode(node: StringNode): number {
		return node.value.length;
	}
	visit(node: ASTNode): number {
		if (node instanceof NumberNode) return this.visitNumberNode(node);
		if (node instanceof StringNode) return this.visitStringNode(node);
		return 0;
	}
}

describe("ASTNode", () => {
	test("NumberNode stores and returns value", () => {
		const node = new NumberNode(42);
		expect(node.value).toBe(42);
	});

	test("NumberNode accepts visitor", () => {
		const node = new NumberNode(42);
		const visitor = new TestSolverVisitor();
		expect(node.accept(visitor)).toBe(42);
	});

	test("StringNode stores and returns value", () => {
		const node = new StringNode("hello");
		expect(node.value).toBe("hello");
	});

	test("StringNode accepts visitor", () => {
		const node = new StringNode("hello");
		const visitor = new TestSolverVisitor();
		expect(node.accept(visitor)).toBe(5);
	});

	test("BinOpNode stores left, operator, right", () => {
		const left = new NumberNode(10);
		const right = new NumberNode(20);
		const node = new BinOpNode(left, BinaryOperator.Add, right);
		expect(node.left).toBe(left);
		expect(node.operator).toBe(BinaryOperator.Add);
		expect(node.right).toBe(right);
	});

	test("UnaryOpNode stores operator and operand", () => {
		const operand = new NumberNode(5);
		const node = new UnaryOpNode(UnaryOperator.Negative, operand);
		expect(node.operator).toBe(UnaryOperator.Negative);
		expect(node.operand).toBe(operand);
	});

	test("BinaryOperator enum has expected values", () => {
		expect(BinaryOperator.Add).toBe("add");
		expect(BinaryOperator.Subtract).toBe("subtract");
		expect(BinaryOperator.Multiply).toBe("multiply");
	});

	test("UnaryOperator enum has expected values", () => {
		expect(UnaryOperator.Positive).toBe("positive");
		expect(UnaryOperator.Negative).toBe("negative");
	});
});