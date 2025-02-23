import { PseudoReg } from "./codegen.ts";
import {
  BinaryExpr,
  BinaryOperator,
  Expr,
  Function,
  NumLiteral,
  Program,
  ReturnStatement,
  Statement,
  UnaryExpr,
  UnaryOperator,
} from "./parser.ts";

type InstructionType =
  | "Copy"
  | "Label"
  | "Jump"
  | "JumpIfZero"
  | "JumpIfNotZero"
  | "UnaryOperation"
  | "BinaryOperation"
  | "Return";
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
  destination: TasValue;
}

export interface TasBinary extends TasInstruction {
  kind: "BinaryOperation";
  operator: BinaryOperator;
  source1: TasValue;
  source2: TasValue;
  destination: TasValue;
}

export interface TasCopy extends TasInstruction {
  kind: "Copy";
  source: TasValue;
  destination: TasValue;
}

export interface TasJump extends TasInstruction {
  kind: "Jump";
  label: TasLabel;
}

export interface TasJumpIfZero extends TasInstruction {
  kind: "JumpIfZero";
  condition: TasValue;
  label: TasLabel;
}

export interface TasJumpIfNotZero extends TasInstruction {
  kind: "JumpIfNotZero";
  condition: TasValue;
  label: TasLabel;
}

export interface TasLabel extends TasInstruction {
  kind: "Label";
  symbol: string;
}

export class TasGenerator {
  private tempVariableCounter = 0;
  private labelCounter = 0;
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
      case "Expr":
      case "UnaryExpr":
      case "BinaryExpr":
        this.emitTackyExpr(statement as Expr);
        break;
      default:
        console.error("Unsupported statement type:", statement.kind);
        Deno.exit(1);
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
      case "BinaryExpr": {
        const parsedExpr = expr as BinaryExpr;

        if (parsedExpr.operator == BinaryOperator.LogicalAnd) {
          // Setup labels and values
          const result1 = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const result2 = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const expressionResult = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const falseLabel = {
            kind: "Label",
            symbol: this.makeLabel(),
          } as TasLabel;
          const endLabel = {
            kind: "Label",
            symbol: this.makeLabel(),
          } as TasLabel;

          // Evaluate the first part of the condition
          const source1 = this.emitTackyExpr(parsedExpr.left);
          this.instructions.push({
            kind: "Copy",
            source: source1,
            destination: result1,
          } as TasCopy);
          this.instructions.push({
            kind: "JumpIfZero",
            label: falseLabel,
            condition: result1,
          } as TasJumpIfZero);

          // Evaluate the next part
          const source2 = this.emitTackyExpr(parsedExpr.right);

          this.instructions.push({
            kind: "Copy",
            source: source2,
            destination: result2,
          } as TasCopy);
          this.instructions.push({
            kind: "JumpIfZero",
            label: falseLabel,
            condition: result2,
          } as TasJumpIfZero);
          this.instructions.push({
            kind: "Copy",
            source: { kind: "Constant", value: 1 } as TasConstant,
            destination: expressionResult,
          } as TasCopy);
          this.instructions.push({
            kind: "Jump",
            label: endLabel,
          } as TasJump);
          this.instructions.push(falseLabel);
          this.instructions.push({
            kind: "Copy",
            source: { kind: "Constant", value: 0 } as TasConstant,
            destination: expressionResult,
          } as TasCopy);
          this.instructions.push(endLabel);
          return expressionResult;
        }

        if (parsedExpr.operator == BinaryOperator.LogicalOr) {
          // Setup labels and values
          const result1 = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const result2 = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const expressionResult = {
            kind: "Variable",
            symbol: this.makeTempVariable(),
          } as TasVariable;
          const falseLabel = {
            kind: "Label",
            symbol: this.makeLabel(),
          } as TasLabel;
          const endLabel = {
            kind: "Label",
            symbol: this.makeLabel(),
          } as TasLabel;

          // Evaluate the first part of the condition
          const source1 = this.emitTackyExpr(parsedExpr.left);
          this.instructions.push({
            kind: "Copy",
            source: source1,
            destination: result1,
          } as TasCopy);
          this.instructions.push({
            kind: "JumpIfNotZero",
            label: falseLabel,
            condition: result1,
          } as TasJumpIfNotZero);

          // Evaluate the next part
          const source2 = this.emitTackyExpr(parsedExpr.right);

          this.instructions.push({
            kind: "Copy",
            source: source2,
            destination: result2,
          } as TasCopy);
          this.instructions.push({
            kind: "JumpIfNotZero",
            label: falseLabel,
            condition: result2,
          } as TasJumpIfNotZero);
          this.instructions.push({
            kind: "Copy",
            source: { kind: "Constant", value: 1 } as TasConstant,
            destination: expressionResult,
          } as TasCopy);
          this.instructions.push({
            kind: "Jump",
            label: endLabel,
          } as TasJump);
          this.instructions.push(falseLabel);
          this.instructions.push({
            kind: "Copy",
            source: { kind: "Constant", value: 0 } as TasConstant,
            destination: expressionResult,
          } as TasCopy);
          this.instructions.push(endLabel);
          return expressionResult;
        }

        const source1 = this.emitTackyExpr(parsedExpr.left);
        const source2 = this.emitTackyExpr(parsedExpr.right);
        const destSymbol = this.makeTempVariable();
        const dest = { kind: "Variable", symbol: destSymbol } as TasVariable;
        this.instructions.push({
          kind: "BinaryOperation",
          source1,
          source2,
          destination: dest as TasValue,
          operator: parsedExpr.operator,
        } as TasBinary);
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

  private makeLabel(): string {
    return `label_l${this.labelCounter++}`;
  }
}
