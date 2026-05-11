import { ASTNode } from "@/engine/ast/nodes/ASTNode";

export enum UnaryOperator {
  Positive = "positive",
  Negative = "negative",
}

export class UnaryOpNode extends ASTNode {
  constructor(
    public readonly operator: UnaryOperator,
    public readonly operand: ASTNode
  ) {
    super();
  }

  accept<T>(visitor: { visit: (node: ASTNode) => T }): T {
    return visitor.visit(this);
  }
}