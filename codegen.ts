import { BinaryOperator, UnaryOperator } from "./parser.ts";

import {
  TasBinary,
  TasConstant,
  TasCopy,
  TasFunction,
  TasJump,
  TasJumpIfNotZero,
  TasJumpIfZero,
  TasLabel,
  TasProgram,
  TasReturn,
  TasUnary,
  TasValue,
  TasVariable,
} from "./tacky.ts";
import { bail } from "./utils.ts";

export enum Register {
  AX = "eax",
  R10 = "r10d",
  DX = "edx",
  R11 = "r11d",
}

enum ConditionFlags {
  E = "e",
  NE = "ne",
  G = "g",
  GE = "ge",
  L = "l",
  LE = "le",
}

type AsmInstructionKind =
  | "Mov"
  | "Ret"
  | "Idiv"
  | "Cdq"
  | "Cmp"
  | "Jmp"
  | "JmpCC"
  | "SetCC"
  | "Label"
  | "BinaryOperation"
  | "UnaryOperation"
  | "AllocateStack";

type AsmOperandKind = "Imm" | "PseudoReg" | "Stack" | "Reg";

interface AsmConstruct {}

export interface AsmProgram extends AsmConstruct {
  kind: "Program";
  body: AsmFunction[];
}

export interface AsmFunction extends AsmConstruct {
  kind: "Function";
  symbol: string;
  instructions: AsmInstruction[];
}

export interface AsmInstruction extends AsmConstruct {
  kind: AsmInstructionKind;
}

export interface Ret extends AsmInstruction {
  kind: "Ret";
}

export interface Mov extends AsmInstruction {
  kind: "Mov";
  source: AsmOperand;
  destination: AsmOperand;
}

export interface UnaryOperation extends AsmInstruction {
  kind: "UnaryOperation";
  operator: UnaryOperator;
  operand: AsmOperand;
}

export interface BinaryOperation extends AsmInstruction {
  kind: "BinaryOperation";
  operator: BinaryOperator;
  operand1: AsmOperand;
  operand2: AsmOperand;
}

export interface AllocateStack extends AsmInstruction {
  kind: "AllocateStack";
  value: number;
}

export interface Idiv extends AsmInstruction {
  kind: "Idiv";
  operand: AsmOperand;
}

export interface Cdq extends AsmInstruction {
  kind: "Cdq";
}

export interface Label extends AsmInstruction {
  kind: "Label";
  symbol: string;
}

export interface Jmp extends AsmInstruction {
  kind: "Jmp";
  label: string;
}

export interface JmpCC extends AsmInstruction {
  kind: "JmpCC";
  condition: ConditionFlags;
  label: string;
}

export interface SetCC extends AsmInstruction {
  kind: "SetCC";
  condition: ConditionFlags;
  operand: AsmOperand;
}

export interface Cmp extends AsmInstruction {
  kind: "Cmp";
  a: AsmOperand;
  b: AsmOperand;
}

export interface AsmOperand extends AsmConstruct {
  kind: AsmOperandKind;
}

export interface Imm extends AsmOperand {
  kind: "Imm";
  value: number;
}

export interface Reg extends AsmOperand {
  kind: "Reg";
  register: Register;
}

export interface PseudoReg extends AsmOperand {
  kind: "PseudoReg";
  symbol: string;
}

export interface Stack extends AsmOperand {
  kind: "Stack";
  value: number;
}

export function generateAsmTree(program: TasProgram): AsmProgram {
  const ast = program.body;
  const asm: AsmProgram = {
    kind: "Program",
    body: [],
  };

  for (const func of ast) {
    // Pass 1: Generate a function
    const asmFunc = generateFunction(func);
    // Pass 2: Replace the pseudoregisters and fixup move instructions
    replacePseudoregisters(asmFunc);
    // Pass 3: Fixup invalid instructions
    fixupInvalidInstructions(asmFunc);
    asm.body.push(asmFunc);
  }

  return asm;
}

function generateFunction(functionNode: TasFunction): AsmFunction {
  const asmFunc: AsmFunction = {
    kind: "Function",
    symbol: functionNode.symbol,
    instructions: [],
  };

  for (const instruction of functionNode.instructions) {
    switch (instruction.kind) {
      case "UnaryOperation": {
        const ins = instruction as TasUnary;

        if (ins.operator == UnaryOperator.Not) {
          asmFunc.instructions.push({
            kind: "Cmp",
            a: { kind: "Imm", value: 0 } as Imm,
            b: getOperand(ins.source),
          } as Cmp);
          asmFunc.instructions.push({
            kind: "Mov",
            source: { kind: "Imm", value: 0 } as Imm,
            destination: getOperand(ins.destination),
          } as Mov);
          asmFunc.instructions.push({
            kind: "SetCC",
            condition: ConditionFlags.E,
            operand: getOperand(ins.destination),
          } as SetCC);
          continue;
        }

        asmFunc.instructions.push({
          kind: "Mov",
          source: getOperand(ins.source),
          destination: getOperand(ins.destination),
        } as Mov);
        asmFunc.instructions.push({
          kind: "UnaryOperation",
          operator: ins.operator,
          operand: getOperand(ins.destination),
        } as UnaryOperation);
        continue;
      }
      case "BinaryOperation": {
        const ins = instruction as TasBinary;

        // Division and remainders are different and need to be handled differently
        if (
          ins.operator == BinaryOperator.Divide ||
          ins.operator == BinaryOperator.Remainder
        ) {
          handleComplexBinary(ins, asmFunc);
          continue;
        }

        const comparisonFlags = getComparisonFlags(ins);
        if (comparisonFlags) {
          // Operands are backwards on purpose :)
          asmFunc.instructions.push({
            kind: "Cmp",
            a: getOperand(ins.source2),
            b: getOperand(ins.source1),
          } as Cmp);
          asmFunc.instructions.push({
            kind: "Mov",
            source: { kind: "Imm", value: 0 } as Imm,
            destination: getOperand(ins.destination),
          } as Mov);
          asmFunc.instructions.push({
            kind: "SetCC",
            condition: comparisonFlags,
            operand: getOperand(ins.destination),
          } as SetCC);
          continue;
        }

        asmFunc.instructions.push({
          kind: "Mov",
          source: getOperand(ins.source1),
          destination: getOperand(ins.destination),
        } as Mov);
        asmFunc.instructions.push({
          kind: "BinaryOperation",
          operator: ins.operator,
          operand1: getOperand(ins.source2),
          operand2: getOperand(ins.destination),
        } as BinaryOperation);
        continue;
      }
      case "Jump": {
        const ins = instruction as TasJump;
        asmFunc.instructions.push({
          kind: "Jmp",
          label: ins.label.symbol,
        } as Jmp);
        continue;
      }
      case "JumpIfZero": {
        const ins = instruction as TasJumpIfZero;
        asmFunc.instructions.push({
          kind: "Cmp",
          a: { kind: "Imm", value: 0 } as Imm,
          b: getOperand(ins.condition),
        } as Cmp);
        asmFunc.instructions.push({
          kind: "JmpCC",
          condition: ConditionFlags.E,
          label: ins.label.symbol,
        } as JmpCC);
        continue;
      }
      case "JumpIfNotZero": {
        const ins = instruction as TasJumpIfNotZero;
        asmFunc.instructions.push({
          kind: "Cmp",
          a: { kind: "Imm", value: 0 } as Imm,
          b: getOperand(ins.condition),
        } as Cmp);
        asmFunc.instructions.push({
          kind: "JmpCC",
          condition: ConditionFlags.NE,
          label: ins.label.symbol,
        } as JmpCC);
        continue;
      }
      case "Label": {
        const ins = instruction as TasLabel;
        asmFunc.instructions.push({
          kind: "Label",
          symbol: ins.symbol,
        } as Label);
        continue;
      }
      case "Copy": {
        const ins = instruction as TasCopy;
        asmFunc.instructions.push({
          kind: "Mov",
          source: getOperand(ins.source),
          destination: getOperand(ins.destination),
        } as Mov);
        continue;
      }
      case "Return": {
        const value = (instruction as TasReturn).value;
        asmFunc.instructions.push({
          kind: "Mov",
          source: getOperand(value),
          destination: {
            kind: "Reg",
            register: Register.AX,
          } as Reg,
        } as Mov);
        asmFunc.instructions.push({ kind: "Ret" } as Ret);
        continue;
      }
      default:
        bail(`Codegen: Unsupported statement kind: ${instruction.kind}`);
    }
  }

  return asmFunc;
}

function getOperand(tasValue: TasValue): AsmOperand {
  switch (tasValue.kind) {
    case "Constant": {
      return { kind: "Imm", value: (tasValue as TasConstant).value } as Imm;
    }
    case "Variable": {
      return {
        kind: "PseudoReg",
        symbol: (tasValue as TasVariable).symbol,
      } as PseudoReg;
    }
  }
}

function replacePseudoregisters(asmFunc: AsmFunction) {
  const symbols: string[] = [];
  const fixedInstructions: AsmInstruction[] = [];
  let stackSize = 0;

  for (const instruction of asmFunc.instructions) {
    switch (instruction.kind) {
      case "UnaryOperation": {
        if ((instruction as UnaryOperation).operand.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as UnaryOperation).operand as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as UnaryOperation).operand = {
            kind: "Stack",
            // NOTE: || 0 to avoid -0
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "BinaryOperation": {
        if ((instruction as BinaryOperation).operand1.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as BinaryOperation).operand1 as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as BinaryOperation).operand1 = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }

        if ((instruction as BinaryOperation).operand2.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as BinaryOperation).operand2 as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as BinaryOperation).operand2 = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "Mov": {
        // Check source of move
        if ((instruction as Mov).source.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as Mov).source as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as Mov).source = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }

        // Check destination of move
        if ((instruction as Mov).destination.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as Mov).destination as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as Mov).destination = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "Idiv": {
        if ((instruction as Idiv).operand.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as Idiv).operand as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as Idiv).operand = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "Cmp": {
        // Check source of compare
        if ((instruction as Cmp).a.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as Cmp).a as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as Cmp).a = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }

        // Check destination of compare
        if ((instruction as Cmp).b.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as Cmp).b as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as Cmp).b = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "SetCC": {
        if ((instruction as SetCC).operand.kind == "PseudoReg") {
          const stackOffset = getStackOffset(
            (instruction as SetCC).operand as PseudoReg,
            symbols,
          );

          stackSize = Math.max(stackSize, -stackOffset);
          (instruction as SetCC).operand = {
            kind: "Stack",
            value: stackOffset || 0,
          } as Stack;
        }
        fixedInstructions.push(instruction);
        continue;
      }
      case "AllocateStack":
      case "Jmp":
      case "JmpCC":
      case "Label":
      case "Cdq":
      case "Ret":
        fixedInstructions.push(instruction);
        continue;
      default:
        bail(`Codegen: Unsupported AsmInstruction: ${instruction}`);
    }
  }

  // If we need to use the stack, insert an allocation as the first instruction
  if (stackSize > 0) {
    fixedInstructions.unshift({
      kind: "AllocateStack",
      value: stackSize,
    } as AllocateStack);
  }

  asmFunc.instructions = fixedInstructions;
}

function getStackOffset(pseudoReg: PseudoReg, symbols: string[]): number {
  const symbol = pseudoReg.symbol;

  if (!symbols.includes(symbol)) {
    symbols.push(symbol);
    return (symbols.length - 1) * -4;
  }

  return symbols.indexOf(symbol) * -4;
}

function isMoveValid(ins: Mov) {
  return !(ins.source.kind == "Stack" && ins.destination.kind == "Stack");
}

function isCmpValid(ins: Cmp) {
  return !(ins.a.kind == "Stack" && ins.b.kind == "Stack");
}

function isBinOpValid(ins: BinaryOperation): boolean {
  return !(ins.operand1.kind == "Stack" && ins.operand2.kind == "Stack");
}

function getComparisonFlags(ins: TasBinary): ConditionFlags | undefined {
  switch (ins.operator) {
    case BinaryOperator.Assertion:
      return ConditionFlags.E;
    case BinaryOperator.NotEqual:
      return ConditionFlags.NE;
    case BinaryOperator.LessThan:
      return ConditionFlags.L;
    case BinaryOperator.LessThanEqual:
      return ConditionFlags.LE;
    case BinaryOperator.GreaterThan:
      return ConditionFlags.G;
    case BinaryOperator.GreaterThanEqual:
      return ConditionFlags.GE;
  }
}

function handleComplexBinary(ins: TasBinary, func: AsmFunction) {
  switch (ins.operator) {
    case BinaryOperator.Divide: {
      func.instructions.push({
        kind: "Mov",
        source: getOperand(ins.source1),
        destination: { kind: "Reg", register: Register.AX } as Reg,
      } as Mov);
      func.instructions.push({
        kind: "Cdq",
      } as Cdq);
      func.instructions.push({
        kind: "Idiv",
        operand: getOperand(ins.source2),
      } as Idiv);
      func.instructions.push({
        kind: "Mov",
        source: { kind: "Reg", register: Register.AX } as Reg,
        destination: getOperand(ins.destination),
      } as Mov);
      break;
    }
    case BinaryOperator.Remainder: {
      func.instructions.push({
        kind: "Mov",
        source: getOperand(ins.source1),
        destination: { kind: "Reg", register: Register.AX } as Reg,
      } as Mov);
      func.instructions.push({
        kind: "Cdq",
      } as Cdq);
      func.instructions.push({
        kind: "Idiv",
        operand: getOperand(ins.source2),
      } as Idiv);
      func.instructions.push({
        kind: "Mov",
        source: { kind: "Reg", register: Register.DX } as Reg,
        destination: getOperand(ins.destination),
      } as Mov);
      break;
    }
  }
}

function fixupInvalidInstructions(asmFunc: AsmFunction) {
  const fixedInstructions: AsmInstruction[] = [];

  for (const instruction of asmFunc.instructions) {
    switch (instruction.kind) {
      case "Mov": {
        if (isMoveValid(instruction as Mov)) {
          fixedInstructions.push(instruction);
          continue;
        }

        /*
         * If the move instruction is writing to and from the stack,
         * we need to split that into to moves:
         * stack -> R10
         * R10 -> stack
         */
        fixedInstructions.push({
          kind: "Mov",
          source: (instruction as Mov).source,
          destination: { kind: "Reg", register: Register.R10 } as Reg,
        } as Mov);
        fixedInstructions.push({
          kind: "Mov",
          source: { kind: "Reg", register: Register.R10 } as Reg,
          destination: (instruction as Mov).destination,
        } as Mov);
        continue;
      }
      case "Cmp": {
        // Cannot have second operand be a constant
        if ((instruction as Cmp).b.kind == "Imm") {
          fixedInstructions.push({
            kind: "Mov",
            source: (instruction as Cmp).b,
            destination: { kind: "Reg", register: Register.R11 } as Reg,
          } as Mov);
          fixedInstructions.push({
            kind: "Cmp",
            a: (instruction as Cmp).a,
            b: { kind: "Reg", register: Register.R11 } as Reg,
          } as Cmp);
          continue;
        }

        if (isCmpValid(instruction as Cmp)) {
          fixedInstructions.push(instruction);
          continue;
        }

        /*
         * If the move instruction is writing to and from the stack,
         * we need to split that into to moves:
         * stack -> R10
         * R10 -> stack
         */
        fixedInstructions.push({
          kind: "Mov",
          source: (instruction as Cmp).a,
          destination: { kind: "Reg", register: Register.R10 } as Reg,
        } as Mov);
        fixedInstructions.push({
          kind: "Cmp",
          a: { kind: "Reg", register: Register.R10 } as Reg,
          b: (instruction as Cmp).b,
        } as Cmp);
        continue;
      }
      case "Idiv": {
        if ((instruction as Idiv).operand.kind != "Imm") {
          fixedInstructions.push(instruction);
          continue;
        }

        fixedInstructions.push({
          kind: "Mov",
          source: (instruction as Idiv).operand,
          destination: { kind: "Reg", register: Register.R10 } as Reg,
        } as Mov);
        fixedInstructions.push({
          kind: "Idiv",
          operand: { kind: "Reg", register: Register.R10 } as Reg,
        } as Idiv);
        continue;
      }
      case "BinaryOperation": {
        // Add, Sub, and Mult cannot have their second operand be a constant
        if (
          (instruction as BinaryOperation).operand2.kind == "Imm" &&
          ((instruction as BinaryOperation).operator == BinaryOperator.Add ||
            (instruction as BinaryOperation).operator ==
              BinaryOperator.Subtract ||
            (instruction as BinaryOperation).operator ==
              BinaryOperator.Multiply)
        ) {
          fixedInstructions.push({
            kind: "Mov",
            source: (instruction as BinaryOperation).operand1,
            destination: { kind: "Reg", register: Register.R10 } as Reg,
          } as Mov);
          fixedInstructions.push({
            kind: "BinaryOperation",
            operator: (instruction as BinaryOperation).operator,
            operand1: { kind: "Reg", register: Register.R10 } as Reg,
            operand2: (instruction as BinaryOperation).operand2,
          } as BinaryOperation);
          continue;
        }

        if (
          (instruction as BinaryOperation).operator ==
            BinaryOperator.Multiply &&
          (instruction as BinaryOperation).operand2.kind == "Stack"
        ) {
          fixedInstructions.push({
            kind: "Mov",
            source: (instruction as BinaryOperation).operand2,
            destination: { kind: "Reg", register: Register.R11 } as Reg,
          } as Mov);
          fixedInstructions.push({
            kind: "BinaryOperation",
            operator: (instruction as BinaryOperation).operator,
            operand1: (instruction as BinaryOperation).operand1,
            operand2: { kind: "Reg", register: Register.R11 } as Reg,
          } as BinaryOperation);
          fixedInstructions.push({
            kind: "Mov",
            source: { kind: "Reg", register: Register.R11 } as Reg,
            destination: (instruction as BinaryOperation).operand2,
          } as Mov);
          continue;
        }
        if (isBinOpValid(instruction as BinaryOperation)) {
          fixedInstructions.push(instruction);
          continue;
        }

        if (
          (instruction as BinaryOperation).operator == BinaryOperator.Add ||
          (instruction as BinaryOperation).operator == BinaryOperator.Subtract
        ) {
          fixedInstructions.push({
            kind: "Mov",
            source: (instruction as BinaryOperation).operand1,
            destination: { kind: "Reg", register: Register.R10 } as Reg,
          } as Mov);
          fixedInstructions.push({
            kind: "BinaryOperation",
            operator: (instruction as BinaryOperation).operator,
            operand1: { kind: "Reg", register: Register.R10 } as Reg,
            operand2: (instruction as BinaryOperation).operand2,
          } as BinaryOperation);
          continue;
        }

        continue;
      }
      default:
        fixedInstructions.push(instruction);
    }
  }

  asmFunc.instructions = fixedInstructions;
}
