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
	LogicalShift_left(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return x.accept(new LogicalShiftLeftVisitor(xVisit, yVisit));
	},
	LogicalShift_right(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return x.accept(new LogicalShiftRightVisitor(xVisit, yVisit));
	},
	AS_addition(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new AdditionVisitor(xVisit, yVisit));
	},
	AS_subtraction(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new SubtractionVisitor(xVisit, yVisit));
	},
	MD_multiplication(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new MultiplicationVisitor(xVisit, yVisit));
	},
	MD_division(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new DivisionVisitor(xVisit, yVisit));
	},
	MD_modulo(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new ModuloVisitor(xVisit, yVisit));
	},
	E_exponent(x, _, y) {
		const xVisit = x.visit();
		const yVisit = y.visit();
		return xVisit.accept(new ExponentVisitor(xVisit, yVisit));
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
