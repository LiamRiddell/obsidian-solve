import { ASTNode } from "@/engine/ast/nodes/ASTNode";

export enum BinaryOperator {
  Add = "add",
  Subtract = "subtract",
  Multiply = "multiply",
  Divide = "divide",
  Modulo = "modulo",
  Exponent = "exponent",
}

export class BinOpNode extends ASTNode {
  constructor(
    public readonly left: ASTNode,
    public readonly operator: BinaryOperator,
    public readonly right: ASTNode
  ) {
    super();
  }

  accept<T>(visitor: { visit: (node: ASTNode) => T }): T {
    return visitor.visit(this);
  }
}