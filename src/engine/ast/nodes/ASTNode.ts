export abstract class ASTNode {
  abstract accept<T>(visitor: { visit: (node: ASTNode) => T }): T;
}