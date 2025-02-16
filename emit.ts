import { AsmProgram, Imm, Mov } from "./codegen.ts";

export function emit(sourceCode: AsmProgram, target: string) {
  let output = "";
  let funcSymbols = "";

  for (const asmFunc of sourceCode.body) {
    funcSymbols += `.globl ${asmFunc.symbol}\n`;

    // TODO: If on Linux, write header information
    // TODO: if on MacOS, use _ prefix
    output += `${asmFunc.symbol}:\n`;

    for (const instruction of asmFunc.instructions) {
      switch (instruction.kind) {
        case "Mov":
          // NOTE: Maybe use tabs instead?
          output += `  mov ${(instruction as Mov).source}, %${(instruction as Mov).destination
            }\n`;
          break;
        case "Return":
          output += `  ret\n`;
          break;
        case "Imm":
          output += `  imm ${(instruction as Imm).value}\n`;
          break;
      }
    }
  }

  output = funcSymbols + "\n" + output;

  Deno.writeTextFile(target, output);
}
