import type { ASTNode } from "@/engine/ast/nodes/ASTNode";
import type { NumberNode } from "@/engine/ast/nodes/NumberNode";
import type { StringNode } from "@/engine/ast/nodes/StringNode";

export interface ISolverVisitor<T> {
  visitNumberNode(node: NumberNode): T;
  visitStringNode(node: StringNode): T;
  visit(node: ASTNode): T;
}