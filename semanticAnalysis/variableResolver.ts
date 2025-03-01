import {
  Assignment,
  BinaryExpr,
  Block,
  CompoundStatement,
  ConditionalExpr,
  DBlock,
  Declaration,
  DoWhileStatement,
  Expr,
  ExpressionStatement,
  ForInit,
  ForStatement,
  IfStatement,
  Program,
  ReturnStatement,
  SBlock,
  Statement,
  UnaryExpr,
  Variable,
  WhileStatement,
} from "../parser.ts";
import { bail } from "../utils.ts";

type ScopeEntry = {
  uniqueSymbol: string;
  inCurrentBlock: boolean;
};

type Scope = Record<string, ScopeEntry>;

export class VariableResolver {
  private variableCounter = 0;

  public resolveVariables(program: Program) {
    for (const func of program.body) {
      const scope: Scope = {};
      this.resolveBlock(func.body, scope);
    }
  }

  private resolveBlock(block: Block, scope: Scope) {
    for (const item of block.blockItems) {
      switch (item.kind) {
        case "SBlock":
          this.resolveStatement((item as SBlock).statement, scope);
          break;
        case "DBlock":
          this.resolveDecleration((item as DBlock).declaration, scope);
          break;
      }
    }
  }

  private resolveForInit(init: ForInit, scope: Scope) {
    switch (init.init?.kind) {
      case "Declaration":
        this.resolveDecleration(init.init as Declaration, scope);
        break;
      case "Expr":
        this.resolveExpression(init.init as Expr, scope);
        break;
    }
  }

  private resolveDecleration(decl: Declaration, scope: Scope) {
    // No duplicate variables!
    if (scope[decl.symbol]?.inCurrentBlock) {
      bail(
        `VariableResolution error on line ${decl.line}: Duplicate variable declaration: ${decl.symbol}`,
      );
    }

    const uniqueIdent = `var.${decl.symbol}.renamed.${this.variableCounter++}`;
    scope[decl.symbol] = { uniqueSymbol: uniqueIdent, inCurrentBlock: true };

    // If the variable has an initializer, we need to check that, too
    // NOTE: This is undefined behavior! You can use a variable in its own initializer.
    // This is "allowed" in the C standard. Would be good to emit a warning if we
    // detect this
    if (decl.expr) {
      this.resolveExpression(decl.expr, scope);
    }
    decl.symbol = uniqueIdent;
  }

  private resolveStatement(statement: Statement, scope: Scope) {
    switch (statement.kind) {
      case "Return":
        this.resolveExpression((statement as ReturnStatement).value, scope);
        break;
      case "Expression":
        this.resolveExpression((statement as ExpressionStatement).expr, scope);
        break;
      case "Compound": {
        const newScope = this.createInnerScope(scope);
        const state = statement as CompoundStatement;
        this.resolveBlock(state.block, newScope);
        break;
      }
      case "If": {
        const ifStatement = statement as IfStatement;
        this.resolveExpression(ifStatement.condition, scope);
        this.resolveStatement(ifStatement.then, scope);
        if (ifStatement.else) {
          // NOTE: Else will never be undefined if we get here
          this.resolveStatement(ifStatement.else ?? ({} as Statement), scope);
        }
        break;
      }
      case "While": {
        const whileStatement = statement as WhileStatement;
        this.resolveExpression(whileStatement.condition, scope);
        this.resolveStatement(whileStatement.body, scope);
        break;
      }
      case "DoWhile": {
        const doWhileStatement = statement as DoWhileStatement;
        this.resolveStatement(doWhileStatement.body, scope);
        this.resolveExpression(doWhileStatement.condition, scope);
        break;
      }
      case "For": {
        const forStatement = statement as ForStatement;
        const newScope = this.createInnerScope(scope);
        this.resolveForInit(forStatement.init, newScope);
        if (forStatement.condition) {
          this.resolveExpression(forStatement.condition, newScope);
        }
        if (forStatement.post) {
          this.resolveExpression(forStatement.post, newScope);
        }
        this.resolveStatement(forStatement.body, newScope);
        break;
      }
      case "Null":
      case "Continue":
      case "Break":
        break;
      default:
        bail(
          `VariableResolution error on line ${statement.line}: Unable to resolve statement: ${statement.kind}`,
        );
    }
  }

  private resolveExpression(expr: Expr, scope: Scope) {
    switch (expr.kind) {
      case "Assignment": {
        // You can't assign to a non-variable!
        const assignment = expr as Assignment;
        if (assignment.left.kind != "Variable") {
          bail(
            `VariableResolution error on line ${assignment.line}: Invalid lvalue: ${assignment.left.kind}`,
          );
        }
        this.resolveExpression(assignment.left, scope);
        this.resolveExpression(assignment.right, scope);
        break;
      }
      case "Variable": {
        const variable = expr as Variable;
        if (!scope[variable.symbol]) {
          bail(
            `VariableResolution error on line ${variable.line}: Attempting to use undeclared variable: ${variable.symbol}`,
          );
        }
        variable.symbol = scope[variable.symbol].uniqueSymbol;
        break;
      }
      case "UnaryExpr":
        this.resolveExpression((expr as UnaryExpr).expr, scope);
        break;
      case "BinaryExpr":
        this.resolveExpression((expr as BinaryExpr).left, scope);
        this.resolveExpression((expr as BinaryExpr).right, scope);
        break;
      case "Conditional":
        this.resolveExpression((expr as ConditionalExpr).condition, scope);
        this.resolveExpression((expr as ConditionalExpr).ifTrue, scope);
        this.resolveExpression((expr as ConditionalExpr).ifFalse, scope);
        break;
      case "NumLiteral":
        break;
      default:
        bail(
          `VariableResolution error on line ${expr.line}: Unable to resolve expression: ${expr.kind}`,
        );
    }
  }

  private createInnerScope(scope: Scope): Scope {
    const newScope: Scope = {};
    for (const key in scope) {
      newScope[key] = {
        uniqueSymbol: scope[key].uniqueSymbol,
        inCurrentBlock: false,
      } as ScopeEntry;
    }
    return newScope;
  }
}
