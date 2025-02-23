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
          const src = getMoveOperand((instruction as Mov).source);
          const dest = getMoveOperand((instruction as Mov).destination);
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
        case "Cmp":
          output += `  cmpl   ${getMoveOperand((instruction as Cmp).a)}  ${getMoveOperand(
            (instruction as Cmp).b,
          )}\n`;
          break;
        case "Jmp":
          output += `  jmp    .L${(instruction as Jmp).label}\n`;
          break;
        case "JmpCC":
          output += `  j${(instruction as JmpCC).condition.padEnd(4)}  .L${
            (instruction as Jmp).label
          }\n`;
          break;
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
        case "BinaryOperation":
          output += `  ${getBinaryOperator(
            instruction as BinaryOperation,
          ).padEnd(6)} ${getMoveOperand(
            (instruction as BinaryOperation).operand1,
          )}, ${getMoveOperand((instruction as BinaryOperation).operand2)}\n`;
          break;
        default:
          console.error("Unsupported ASM instruction:", instruction);
          Deno.exit(1);
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
      console.log("Unsupported asm operand", val);
      Deno.exit(1);
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
      console.error("Unsupported binary operator:", ins.operator);
      Deno.exit(1);
  }
  // NOTE: Unreachable
  return {} as BinaryAsmInstruction;
}
