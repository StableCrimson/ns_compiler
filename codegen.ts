import {
  Program,
  Function,
  Statement,
  NodeType,
  ReturnStatement,
  NumLiteral,
} from "./parser.ts";

type InstructionType = "Mov" | "Return" | "Imm";

enum Register {
  EAX = "eax",
}

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
  kind: InstructionType;
}

export interface Ret extends AsmInstruction {
  kind: "Return";
}

export interface Imm extends AsmInstruction {
  kind: "Imm";
  value: number;
}

export interface Mov extends AsmInstruction {
  kind: "Mov";
  source: number;
  destination: Register;
}

export function generateAsmTree(program: Program): AsmProgram {
  const ast = program.body;
  const asm: AsmProgram = {
    kind: "Program",
    body: [],
  };

  for (const func of ast) {
    asm.body.push(generateFunction(func));
  }

  return asm;
}

function generateFunction(functionNode: Function): AsmFunction {
  let asmFunc: AsmFunction = {
    symbol: functionNode.symbol,
    instructions: [],
    kind: "Function",
  };

  for (const statement of functionNode.body) {
    switch (statement.kind) {
      case "Return":
        const value = ((statement as ReturnStatement).value as NumLiteral)
          .value;
        asmFunc.instructions.push({
          kind: "Mov",
          source: value,
          destination: Register.EAX, // TODO: Implement register allocation
        } as Mov);
        asmFunc.instructions.push({ kind: "Return" } as Ret);
        continue;
      default:
        console.error("Unsupported statement kind: ", statement.kind);
        Deno.exit(1);
    }
  }

  return asmFunc;
}
