import { BasicArithmeticActionDict } from "@/providers/arithmetic/basic/BasicArithmetic.ohm-bundle";
import { AdditionVisitor } from "@/visitors/AdditionVisitor";
import { ArithmeticExpressionVisitor } from "@/visitors/ArithmeticExpressionVisitor";
import { DivisionVisitor } from "@/visitors/DivisionVisitor";
import { ExponentVisitor } from "@/visitors/ExponentVisitor";
import {
	LogicalShiftLeftVisitor,
	LogicalShiftRightVisitor,
} from "@/visitors/LogicalVisitor";
import { ModuloVisitor } from "@/visitors/ModuloVisitor";
import { MultiplicationVisitor } from "@/visitors/MultiplicationVisitor";
import { SubtractionVisitor } from "@/visitors/SubtractionVisitor";
import { FloatResult } from "@/visitors/results/FloatResult";
import { HexResult } from "@/visitors/results/HexResult";
import { IntegerResult } from "@/visitors/results/IntegerResult";
import { PercentageResult } from "@/visitors/results/PercentageResult";

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
