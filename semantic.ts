import {
  Assignment,
  BinaryExpr,
  ConditionalExpr,
  DBlock,
  Declaration,
  Expr,
  ExpressionStatement,
  IfStatement,
  Program,
  ReturnStatement,
  SBlock,
  Statement,
  UnaryExpr,
  Variable,
} from "./parser.ts";

export class SemanticAnalyzer {
  private variableTable: Record<string, string> = {};
  private variableCounter = 0;

  public semanticAnalysis(program: Program) {
    // Make sure variable declarations and accesses are valid
    // Also makes sure all variable names are globally unique
    this.resolveVariables(program);
  }

  private resolveVariables(program: Program) {
    for (const func of program.body) {
      for (const block of func.body) {
        switch (block.kind) {
          case "SBlock":
            this.resolveStatement((block as SBlock).statement);
            break;
          case "DBlock":
            this.resolveDecleration((block as DBlock).declaration);
            break;
        }
      }
    }
  }

  private resolveDecleration(decl: Declaration) {
    // No duplicate variables!
    if (this.variableTable[decl.symbol]) {
      console.error("Duplicate variable declaration:", decl.symbol);
      Deno.exit(1);
    }

    const uniqueIdent = `var.${decl.symbol}.renamed.${this.variableCounter++}`;
    this.variableTable[decl.symbol] = uniqueIdent;

    // If the variable has an initializer, we need to check that, too
    // NOTE: This is undefined behavior! You can use a variable in its own initializer.
    // This is "allowed" in the C standard. Would be good to emit a warning if we
    // detect this
    if (decl.expr) {
      this.resolveExpression(decl.expr);
    }
    decl.symbol = uniqueIdent;
  }

  private resolveStatement(statement: Statement) {
    switch (statement.kind) {
      case "Return":
        this.resolveExpression((statement as ReturnStatement).value);
        break;
      case "Expression":
        this.resolveExpression((statement as ExpressionStatement).expr);
        break;
      case "If":
        this.resolveExpression((statement as IfStatement).condition);
        this.resolveStatement((statement as IfStatement).then);
        if ((statement as IfStatement).else) {
          // NOTE: Else will never be undefined if we get here
          this.resolveStatement(
            (statement as IfStatement).else ?? ({} as Statement),
          );
        }
        break;
      case "Null":
        break;
      default:
        console.error("Unable to resolve statement:", statement.kind);
        Deno.exit(1);
    }
  }

  private resolveExpression(expr: Expr) {
    switch (expr.kind) {
      case "Assignment":
        // You can't assign to a non-variable!
        if ((expr as Assignment).left.kind != "Variable") {
          console.error("Invalid lvalue:", expr as Assignment);
          Deno.exit(1);
        }
        this.resolveExpression((expr as Assignment).left);
        this.resolveExpression((expr as Assignment).right);
        break;
      case "Variable":
        if (!this.variableTable[(expr as Variable).symbol]) {
          console.error(
            "Trying to use undeclared variable:",
            (expr as Variable).symbol,
          );
          Deno.exit(1);
        }
        (expr as Variable).symbol =
          this.variableTable[(expr as Variable).symbol];
        break;
      case "UnaryExpr":
        this.resolveExpression((expr as UnaryExpr).expr);
        break;
      case "BinaryExpr":
        this.resolveExpression((expr as BinaryExpr).left);
        this.resolveExpression((expr as BinaryExpr).right);
        break;
      case "Conditional":
        this.resolveExpression((expr as ConditionalExpr).condition);
        this.resolveExpression((expr as ConditionalExpr).ifTrue);
        this.resolveExpression((expr as ConditionalExpr).ifFalse);
        break;
      case "NumLiteral":
        break;
      default:
        console.error("Unable to resolve expression:", expr.kind);
        Deno.exit(1);
    }
  }
}
