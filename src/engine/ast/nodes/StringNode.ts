import { ASTNode } from "@/engine/ast/nodes/ASTNode";

export class StringNode extends ASTNode {
  constructor(public readonly value: string) {
    super();
  }

  accept<T>(visitor: { visit: (node: ASTNode) => T }): T {
    return visitor.visit(this);
  }
}