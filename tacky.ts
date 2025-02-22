import {
  Expr,
  Function,
  NumLiteral,
  Program,
  ReturnStatement,
  Statement,
  UnaryExpr,
  UnaryOperator,
} from "./parser.ts";

type InstructionType = "UnaryOperation" | "Return";
type TasValueKind = "Constant" | "Variable";

interface TasConstruct {}

export interface TasProgram extends TasConstruct {
  kind: "Program";
  body: TasFunction[];
}

export interface TasFunction extends TasConstruct {
  kind: "Function";
  symbol: string;
  instructions: TasInstruction[];
}

export interface TasInstruction extends TasConstruct {
  kind: InstructionType;
}

export interface TasValue extends TasConstruct {
  kind: TasValueKind;
}

export interface TasConstant extends TasValue {
  kind: "Constant";
  value: number;
}

export interface TasVariable extends TasValue {
  kind: "Variable";
  symbol: string;
}

export interface TasReturn extends TasInstruction {
  kind: "Return";
  value: TasValue;
}

export interface TasUnary extends TasInstruction {
  kind: "UnaryOperation";
  operator: UnaryOperator;
  source: TasValue;
  // TODO: This MUST be a temporary variable
  destination: TasValue;
}

export class TasGenerator {
  private tempVariableCounter = 0;
  private instructions: TasInstruction[] = [];

  public generateTas(program: Program): TasProgram {
    const ast = program.body;
    const asm: TasProgram = {
      kind: "Program",
      body: [],
    };

    for (const func of ast) {
      this.instructions = [];
      asm.body.push(this.generateFunction(func));
    }

    return asm;
  }

  private generateFunction(functionNode: Function): TasFunction {
    for (const statement of functionNode.body) {
      this.emitTackyStatement(statement);
    }

    const tasFunc: TasFunction = {
      kind: "Function",
      symbol: functionNode.symbol,
      instructions: this.instructions,
    };

    return tasFunc;
  }

  private emitTackyStatement(statement: Statement) {
    switch (statement.kind) {
      case "Return": {
        const returnExpr = (statement as ReturnStatement).value;
        const returnValue = this.emitTackyExpr(returnExpr);
        this.instructions.push({
          kind: "Return",
          value: returnValue,
        } as TasReturn);
        break;
      }
      default:
        this.emitTackyExpr(statement as Expr);
    }
  }

  private emitTackyExpr(expr: Expr): TasValue {
    switch (expr.kind) {
      case "NumLiteral": {
        const returnValue = (expr as NumLiteral).value;
        return { kind: "Constant", value: returnValue } as TasConstant;
      }
      case "UnaryExpr": {
        const parsedExpr = expr as UnaryExpr;
        const source = this.emitTackyExpr(parsedExpr.expr);
        const destSymbol = this.makeTempVariable();
        const dest = { kind: "Variable", symbol: destSymbol } as TasVariable;
        this.instructions.push({
          kind: "UnaryOperation",
          source,
          destination: dest as TasValue,
          operator: parsedExpr.operator,
        } as TasUnary);
        return dest;
      }
      default:
        console.error("Unsupported statement kind: ", expr.kind);
        Deno.exit(1);
    }

    // NOTE: Unreachable, just for the TS compiler
    return {} as TasValue;
  }

  private makeTempVariable(): string {
    return `temp_v${this.tempVariableCounter++}`;
  }
}
