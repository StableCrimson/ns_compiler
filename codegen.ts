import { UnaryOperator } from "./parser.ts";

import {
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
}

type AsmInstructionKind = "Mov" | "Ret" | "UnaryOperation" | "AllocateStack";
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

export interface UnaryOperation {
  kind: "UnaryOperation";
  operator: UnaryOperator;
  operand: AsmOperand;
}

export interface AllocateStack extends AsmInstruction {
  kind: "AllocateStack";
  value: number;
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
      case "Ret": {
        fixedInstructions.push(instruction);
        continue;
      }
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
