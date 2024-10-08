import { BasicArithmeticActionDict } from "@/grammars/arithmetic/BasicArithmetic.ohm-bundle";
import { HexResult } from "@/results/HexResult";
import { NumberResult } from "@/results/NumberResult";
import UserSettings from "@/settings/UserSettings";
import { AdditionVisitor } from "@/visitors/arithmetic/AdditionVisitor";
import { ArithmeticExpression } from "@/visitors/arithmetic/ArithmeticExpressionVisitor";
import { DivisionVisitor } from "@/visitors/arithmetic/DivisionVisitor";
import { ExponentVisitor } from "@/visitors/arithmetic/ExponentVisitor";
import {
	LogicalShiftLeftVisitor,
	LogicalShiftRightVisitor,
} from "@/visitors/arithmetic/LogicalShiftVisitor";
import { ModuloVisitor } from "@/visitors/arithmetic/ModuloVisitor";
import { MultiplicationVisitor } from "@/visitors/arithmetic/MultiplicationVisitor";
import { SubtractionVisitor } from "@/visitors/arithmetic/SubtractionVisitor";

export const basicArithmeticSemanticActions: BasicArithmeticActionDict<
	NumberResult | HexResult
> = {
	LogicalShift_left(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new LogicalShiftLeftVisitor(y));
	},
	LogicalShift_right(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new LogicalShiftRightVisitor(y));
	},
	AS_addition(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new AdditionVisitor(y));
	},
	AS_subtraction(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new SubtractionVisitor(y));
	},
	MD_multiplication(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new MultiplicationVisitor(y));
	},
	MD_division(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new DivisionVisitor(y));
	},
	MD_modulo(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new ModuloVisitor(y));
	},
	E_exponent(xNode, _, yNode) {
		const x = xNode.visit();
		const y = yNode.visit();
		return x.accept(new ExponentVisitor(y));
	},
	P_parenthesis(_l, e, _r) {
		return e.visit();
	},
	Primitive_positive(_, e) {
		return ArithmeticExpression.visitPositive(e.visit());
	},
	Primitive_negative(_, e) {
		return ArithmeticExpression.visitNegative(e.visit());
	},
	constant(_) {
		return ArithmeticExpression.visitConstant(this.sourceString);
	},
	hex(_, _1) {
		return ArithmeticExpression.visitHex(this.sourceString);
	},
	number(_, _1) {
		const userDecimalSeparatorLocale =
			UserSettings.getInstance().numberResult.decimalSeparatorLocale;

		return ArithmeticExpression.visitNumber(
			this.sourceString,
			userDecimalSeparatorLocale
		);
	},
};
