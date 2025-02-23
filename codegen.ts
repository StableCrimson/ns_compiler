import { BinaryOperator, UnaryOperator } from "./parser.ts";

import {
  TasBinary,
  TasConstant,
  TasFunction,
  TasProgram,
  TasReturn,
  TasUnary,
  TasValue,
  TasVariable,
} from "./tacky.ts";

export enum Register {
  AX = "eax",
  R10 = "r10d",
  DX = "edx",
  R11 = "r11d",
}

type AsmInstructionKind =
  | "Mov"
  | "Ret"
  | "Idiv"
  | "Cdq"
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
        console.error("Unsupported statement kind:", instruction.kind);
        Deno.exit(1);
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
      case "Cdq":
      case "Ret":
        fixedInstructions.push(instruction);
        continue;
      default:
        console.error("Unknown AsmInstruction:", instruction);
        Deno.exit(1);
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

function isBinOpValid(ins: BinaryOperation): boolean {
  return !(ins.operand1.kind == "Stack" && ins.operand2.kind == "Stack");
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
