import { ASTNode } from "@/engine/ast/nodes/ASTNode";

export class NumberNode extends ASTNode {
  constructor(public readonly value: number) {
    super();
  }

  accept<T>(visitor: { visit: (node: ASTNode) => T }): T {
    return visitor.visit(this);
  }
}