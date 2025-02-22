import {
  AllocateStack,
  AsmOperand,
  AsmProgram,
  Imm,
  Mov,
  Reg,
  Stack,
  UnaryOperation,
} from "./codegen.ts";
import { UnaryOperator } from "./parser.ts";

enum UnaryAsmInstruction {
  Negation = "  negl\n",
  Not = "  notl\n",
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
          output += `  mov ${src}, ${dest}\n`;
          break;
        }
        case "Ret":
          // Clear stack
          output += "  movq  %rbp, %rsp\n";
          output += "  popq  %rbp\n";
          output += `  ret\n`;
          break;
        case "AllocateStack":
          output += `  subq  $${(instruction as AllocateStack).value}, %rsp\n`;
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
