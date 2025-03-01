import {
  Assignment,
  BinaryExpr,
  BinaryOperator,
  Block,
  BlockItem,
  Break,
  CompoundStatement,
  ConditionalExpr,
  Continue,
  DBlock,
  Declaration,
  DoWhileStatement,
  Expr,
  ExpressionStatement,
  ForInit,
  ForStatement,
  Function,
  IfStatement,
  NumLiteral,
  Program,
  ReturnStatement,
  SBlock,
  Statement,
  UnaryExpr,
  UnaryOperator,
  Variable,
  WhileStatement,
} from "./parser.ts";
import { bail } from "./utils.ts";

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

export interface TasProgram {
  kind: "Program";
  body: TasFunction[];
}

export interface TasFunction {
  kind: "Function";
  symbol: string;
  instructions: TasInstruction[];
}

export interface TasInstruction {
  kind: InstructionType;
}

export interface TasValue {
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
    this.emitTackyBlock(functionNode.body);

    const tasFunc: TasFunction = {
      kind: "Function",
      symbol: functionNode.symbol,
      instructions: this.instructions,
    };

    return tasFunc;
  }

  private emitTackyBlock(block: Block) {
    for (const item of block.blockItems) {
      this.emitTackyBlockItem(item);
    }
  }

  private emitTackyForInit(init: ForInit) {
    if (init.init?.kind == "Declaration") {
      this.emitTackyDeclaration(init.init as Declaration)
    } else if (init.init) {
      this.emitTackyExpr(init.init as Expr);
    }
  }

  private emitTackyBlockItem(block: BlockItem) {
    switch (block.kind) {
      case "DBlock":
        this.emitTackyDeclaration((block as DBlock).declaration);
        break;
      case "SBlock":
        this.emitTackyStatement((block as SBlock).statement);
        break;
    }
  }

  private emitTackyDeclaration(declaration: Declaration) {
    if (declaration.expr) {
      const value = this.emitTackyExpr(declaration.expr);
      this.instructions.push({
        kind: "Copy",
        source: value,
        destination: {
          kind: "Variable",
          symbol: declaration.symbol,
        } as TasVariable,
      } as TasCopy);
    }
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
      case "Compound": {
        const compound = statement as CompoundStatement;
        this.emitTackyBlock(compound.block);
        break;
      }
      case "If": {
        const ifStatement = statement as IfStatement;
        const condResult = this.makeTempVariable();
        const endLabel = this.makeLabel("end");
        const elseLabel = this.makeLabel("else");

        // Evaluate the condition
        const cond = this.emitTackyExpr(ifStatement.condition);

        this.instructions.push({
          kind: "Copy",
          source: cond,
          destination: condResult,
        } as TasCopy);
        this.instructions.push({
          kind: "JumpIfZero",
          label: ifStatement.else ? elseLabel : endLabel,
          condition: condResult,
        } as TasJumpIfZero);
        this.emitTackyStatement(ifStatement.then);

        // If we have an else statement
        if (ifStatement.else) {
          this.instructions.push({
            kind: "Jump",
            label: endLabel,
          } as TasJump);
          this.instructions.push(elseLabel);
          this.emitTackyStatement(ifStatement.else ?? ({} as Statement));
        }

        this.instructions.push(endLabel);
        break;
      }
      case "While": {
        const parsedStatement = statement as WhileStatement;
        const breakLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_break`,
        } as TasLabel;
        const continueLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_continue`,
        } as TasLabel;
        this.instructions.push(continueLabel);
        const cond = this.emitTackyExpr(parsedStatement.condition);
        const condResult = this.makeTempVariable();
        this.instructions.push({
          kind: "Copy",
          source: cond,
          destination: condResult,
        } as TasCopy);
        // If condition is not met, end the loop
        this.instructions.push({
          kind: "JumpIfZero",
          condition: condResult,
          label: breakLabel,
        } as TasJumpIfZero);
        this.emitTackyStatement(parsedStatement.body);
        this.instructions.push({
          kind: "Jump",
          label: continueLabel,
        } as TasJump);
        this.instructions.push(breakLabel);
        break;
      }
      case "DoWhile": {
        const parsedStatement = statement as DoWhileStatement;
        const startLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_start`,
        } as TasLabel;
        const breakLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_break`,
        } as TasLabel;
        const continueLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_continue`,
        } as TasLabel;
        this.instructions.push(startLabel);
        this.emitTackyStatement(parsedStatement.body);
        this.instructions.push(continueLabel);
        const cond = this.emitTackyExpr(parsedStatement.condition);
        const condResult = this.makeTempVariable();
        this.instructions.push({
          kind: "Copy",
          source: cond,
          destination: condResult,
        } as TasCopy);
        // If condition is not met, end the loop
        this.instructions.push({
          kind: "JumpIfNotZero",
          condition: condResult,
          label: startLabel,
        } as TasJumpIfNotZero);
        this.instructions.push(breakLabel);
        break;
      }
      case "For": {
        const parsedStatement = statement as ForStatement;
        const init = parsedStatement.init;
        const startLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_start`,
        } as TasLabel;
        const breakLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_break`,
        } as TasLabel;
        const continueLabel = {
          kind: "Label",
          symbol: `${parsedStatement.label}_continue`,
        } as TasLabel;

        this.emitTackyForInit(parsedStatement.init);
        this.instructions.push(startLabel);

        // If there is a condition expression, use that instead
        // In the C standard, if a condition is not provided, you
        // should just use a non-zero constant. However doing that would
        // just add a vestigial instruction (a jump that would never be made),
        // so it's more efficient for us to omit the jump entirely
        if (parsedStatement.condition) {
          const cond = this.emitTackyExpr(parsedStatement.condition);
          const condResult = this.makeTempVariable();

          this.instructions.push({
            kind: "Copy",
            source: cond,
            destination: condResult,
          } as TasCopy);
          // If condition is not met, end the loop
          this.instructions.push({
            kind: "JumpIfZero",
            condition: condResult,
            label: breakLabel,
          } as TasJumpIfZero);
        }
        this.emitTackyStatement(parsedStatement.body);
        this.instructions.push(continueLabel);
        if (parsedStatement.post) {
          this.emitTackyExpr(parsedStatement.post);
        }
        this.instructions.push({ kind: "Jump", label: startLabel } as TasJump);
        this.instructions.push(breakLabel);
        break;
      }
      case "Break":
        this.instructions.push({
          kind: "Jump",
          label: {
            kind: "Label",
            symbol: `${(statement as Break).label}_break`,
          } as TasLabel,
        } as TasJump);
        break;
      case "Continue":
        this.instructions.push({
          kind: "Jump",
          label: {
            kind: "Label",
            symbol: `${(statement as Continue).label}_continue`,
          } as TasLabel,
        } as TasJump);
        break;
      case "Expression":
        this.emitTackyExpr((statement as ExpressionStatement).expr);
        break;
      case "UnaryExpr":
      case "BinaryExpr":
        this.emitTackyExpr(statement as Expr);
        break;
      case "Null":
        break;
      default:
        bail(`TAS: Unsupported statement kind: ${statement.kind}`);
    }
  }

  private emitTackyExpr(expr: Expr): TasValue {
    switch (expr.kind) {
      case "NumLiteral": {
        const returnValue = (expr as NumLiteral).value;
        return { kind: "Constant", value: returnValue } as TasConstant;
      }
      case "Variable":
        return {
          kind: "Variable",
          symbol: (expr as Variable).symbol,
        } as TasVariable;
      case "Assignment": {
        const parsedExpr = expr as Assignment;
        const rhs = this.emitTackyExpr(parsedExpr.right);
        const variable = {
          kind: "Variable",
          symbol: (parsedExpr.left as Variable).symbol,
        } as TasVariable;
        this.instructions.push({
          kind: "Copy",
          source: rhs,
          destination: variable,
        } as TasCopy);
        return variable;
      }
      case "UnaryExpr": {
        const parsedExpr = expr as UnaryExpr;
        const source = this.emitTackyExpr(parsedExpr.expr);
        const dest = this.makeTempVariable();
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
          const result1 = this.makeTempVariable();
          const result2 = this.makeTempVariable();
          const expressionResult = this.makeTempVariable();
          const endLabel = this.makeLabel("end");
          const falseLabel = this.makeLabel("false");

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
          const result1 = this.makeTempVariable();
          const result2 = this.makeTempVariable();
          const expressionResult = this.makeTempVariable();
          const endLabel = this.makeLabel("end");
          const falseLabel = this.makeLabel("false");

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
        const dest = this.makeTempVariable();
        this.instructions.push({
          kind: "BinaryOperation",
          source1,
          source2,
          destination: dest,
          operator: parsedExpr.operator,
        } as TasBinary);
        return dest;
      }
      case "Conditional": {
        const parsedExpr = expr as ConditionalExpr;
        const condResult = this.makeTempVariable();
        const v1 = this.makeTempVariable();
        const v2 = this.makeTempVariable();
        const result = this.makeTempVariable();

        const elseLabel = this.makeLabel("else");
        const endLabel = this.makeLabel("end");
        const cond = this.emitTackyExpr(parsedExpr.condition);

        this.instructions.push({
          kind: "Copy",
          source: cond,
          destination: condResult,
        } as TasCopy);
        this.instructions.push({
          kind: "JumpIfZero",
          label: elseLabel,
          condition: condResult,
        } as TasJumpIfZero);
        this.instructions.push({
          kind: "Copy",
          source: this.emitTackyExpr(parsedExpr.ifTrue),
          destination: v1,
        } as TasCopy);
        this.instructions.push({
          kind: "Copy",
          source: v1,
          destination: result,
        } as TasCopy);
        this.instructions.push({
          kind: "Jump",
          label: endLabel,
        } as TasJump);
        this.instructions.push(elseLabel);
        this.instructions.push({
          kind: "Copy",
          source: this.emitTackyExpr(parsedExpr.ifFalse),
          destination: v2,
        } as TasCopy);
        this.instructions.push({
          kind: "Copy",
          source: v2,
          destination: result,
        } as TasCopy);
        this.instructions.push(endLabel);
        return result;
      }
      default:
        bail(`TAS: Unsupported expression kind: ${expr.kind}`);
    }

    // NOTE: Unreachable, just for the TS compiler
    return {} as TasValue;
  }

  private makeTempVariable(): TasVariable {
    // Variables with a '.' are invalid in C source code.
    // So naming the symbols AFTER parsing ensures the
    // temp variable name won't conflict with the user-defined ones
    return {
      kind: "Variable",
      symbol: `temp.v${this.tempVariableCounter++}`,
    } as TasVariable;
  }

  private makeLabel(prefix: string | undefined = undefined): TasLabel {
    const labelName = prefix ?? "label";
    return {
      kind: "Label",
      symbol: `${labelName}_${this.labelCounter++}`,
    } as TasLabel;
  }
}
