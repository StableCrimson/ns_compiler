import {
  AllocateStack,
  AsmOperand,
  AsmProgram,
  BinaryOperation,
  Cmp,
  Idiv,
  Imm,
  Jmp,
  JmpCC,
  Label,
  Mov,
  Reg,
  SetCC,
  Stack,
  UnaryOperation,
} from "./codegen.ts";
import { BinaryOperator, UnaryOperator } from "./parser.ts";
import { bail } from "./utils.ts";

enum UnaryAsmInstruction {
  Negation = "  negl\n",
  Not = "  notl\n",
}

enum BinaryAsmInstruction {
  Add = "addl",
  Subtract = "subl",
  Multiply = "imml",
}
export function emit(sourceCode: AsmProgram, target: string) {
  let output = "";
  let funcSymbols = "";

  for (const asmFunc of sourceCode.body) {
    funcSymbols += `  .globl ${asmFunc.symbol}\n`;

    // TODO: if on MacOS, use _ prefix
    output += `${asmFunc.symbol}:\n`;

    // Prelude
    output += "  pushq  %rsp\n";
    output += "  movq   %rsp, %rbp\n";

    for (const instruction of asmFunc.instructions) {
      switch (instruction.kind) {
        case "Mov": {
          const instr = instruction as Mov;
          const src = getMoveOperand(instr.source);
          const dest = getMoveOperand(instr.destination);
          output += `  mov    ${src}, ${dest}\n`;
          break;
        }
        case "Ret":
          // Clear stack
          output += "  movq   %rbp, %rsp\n";
          output += "  popq   %rbp\n";
          output += `  ret\n`;
          break;
        case "AllocateStack":
          output += `  subq   $${(instruction as AllocateStack).value}, %rsp\n`;
          break;
        case "Cdq":
          output += "  cdq\n";
          break;
        case "Idiv":
          output += `  idivl  ${getMoveOperand(
            (instruction as Idiv).operand,
          )}\n`;
          break;
        case "Cmp": {
          const instr = instruction as Cmp;
          output += `  cmpl   ${getMoveOperand(instr.a)}  ${getMoveOperand(
            instr.b,
          )}\n`;
          break;
        }
        case "Jmp":
          output += `  jmp    .L${(instruction as Jmp).label}\n`;
          break;
        case "JmpCC": {
          const instr = instruction as JmpCC;
          output += `  j${instr.condition.padEnd(4)}  .L${instr.label}\n`;
          break;
        }
        case "SetCC":
          output += `  set${(instruction as SetCC).condition.padEnd(2)}  ${getMoveOperand(
            (instruction as SetCC).operand,
          )}\n`;
          break;
        case "Label":
          // On MacOS, omit the .
          output += `.L${(instruction as Label).symbol}:\n`;
          break;
        case "UnaryOperation":
          switch ((instruction as UnaryOperation).operator) {
            case UnaryOperator.Negation:
              output += UnaryAsmInstruction.Negation;
              break;
            case UnaryOperator.Complement:
              output += UnaryAsmInstruction.Not;
              break;
          }
          break;
        case "BinaryOperation": {
          const instr = instruction as BinaryOperation;
          output += `  ${getBinaryOperator(instr).padEnd(6)} ${getMoveOperand(
            instr.operand1,
          )}, ${getMoveOperand(instr.operand2)}\n`;
          break;
        }
        default:
          bail(`Emission: Unsupported ASM instruction: ${instruction.kind}`);
      }
    }
  }

  output = funcSymbols + "\n" + output;

  // TODO: On linux
  // output += "  .section .note.GNU-stack,"",@progbits"
  Deno.writeTextFile(target, output);
}

function getMoveOperand(val: AsmOperand): string {
  switch (val.kind) {
    case "Reg":
      return `%${(val as Reg).register}(%rbp)`;
    case "Stack":
      return `%${(val as Stack).value}(%rbp)`;
    case "Imm":
      return `%${(val as Imm).value}`;
    default:
      bail(`Emission: Unsupported ASM Operand: ${val.kind}`);
  }

  // NOTE: Unreachable. To make TS happy.
  return "";
}

function getBinaryOperator(ins: BinaryOperation): BinaryAsmInstruction {
  switch (ins.operator) {
    case BinaryOperator.Add:
      return BinaryAsmInstruction.Add;
    case BinaryOperator.Subtract:
      return BinaryAsmInstruction.Subtract;
    case BinaryOperator.Multiply:
      return BinaryAsmInstruction.Multiply;
    default:
      bail(`Emission: Unsupported binary operator: ${ins.operator}`);
  }
  // NOTE: Unreachable
  return {} as BinaryAsmInstruction;
}
