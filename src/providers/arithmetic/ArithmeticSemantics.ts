import { BasicArithmeticActionDict } from "@/grammars/arithmetic/BasicArithmetic.ohm-bundle";
import { FloatResult } from "@/results/FloatResult";
import { HexResult } from "@/results/HexResult";
import { IntegerResult } from "@/results/IntegerResult";
import { PercentageResult } from "@/results/PercentageResult";
import { AdditionVisitor } from "@/visitors/arithmetic/AdditionVisitor";
import { ArithmeticExpressionVisitor } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";
import { DivisionVisitor } from "@/visitors/arithmetic/DivisionVisitor";
import { ExponentVisitor } from "@/visitors/arithmetic/ExponentVisitor";
import {
	LogicalShiftLeftVisitor,
	LogicalShiftRightVisitor,
} from "@/visitors/arithmetic/LogicalShiftVisitor";
import { ModuloVisitor } from "@/visitors/arithmetic/ModuloVisitor";
import { MultiplicationVisitor } from "@/visitors/arithmetic/MultiplicationVisitor";
import { SubtractionVisitor } from "@/visitors/arithmetic/SubtractionVisitor";

const arithmeticVisitor = new ArithmeticExpressionVisitor();

export const basicArithmeticSemanticActions: BasicArithmeticActionDict<
	FloatResult | IntegerResult | HexResult | PercentageResult
> = {
	LogicalShift_left(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new LogicalShiftLeftVisitor(x, y));
	},
	LogicalShift_right(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new LogicalShiftRightVisitor(x, y));
	},
	AS_addition(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new AdditionVisitor(x, y));
	},
	AS_subtraction(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new SubtractionVisitor(x, y));
	},
	MD_multiplication(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new MultiplicationVisitor(x, y));
	},
	MD_division(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new DivisionVisitor(x, y));
	},
	MD_modulo(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new ModuloVisitor(x, y));
	},
	E_exponent(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new ExponentVisitor(x, y));
	},
	P_parenthesis(_l, e, _r) {
		return e.visit();
	},
	Primitive_positive(_, e) {
		return arithmeticVisitor.visitPositive(e.visit());
	},
	Primitive_negative(_, e) {
		return arithmeticVisitor.visitNegative(e.visit());
	},
	constant(_) {
		return arithmeticVisitor.visitConstant(this.sourceString);
	},
	hex(_, _1) {
		return arithmeticVisitor.visitHex(this.sourceString);
	},
	number_fract(_, _1, _2) {
		return arithmeticVisitor.visitFloat(this.sourceString);
	},
	number_whole(_) {
		return arithmeticVisitor.visitInteger(this.sourceString);
	},
};
