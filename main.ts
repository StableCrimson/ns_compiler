import { tokenize } from "./tokenizer.ts";
import { Parser } from "./parser.ts";
import { generateAsmTree } from "./codegen.ts";
import { emit } from "./emit.ts";
import { TasGenerator } from "./tacky.ts";

const args = Deno.args;

if (args.length < 1) {
  console.error("Usage: deno run main.ts <source>");
  Deno.exit(1);
}

const filePath = args[args.length - 1];
const fileContents = await Deno.readTextFile(filePath);

const parser = new Parser();
const tasGenerator = new TasGenerator();

let tokens, ast, tas, asmTree;

// Args[0] (if present) tells us what stage of compilation to stop at
switch (args[0]) {
  case "--lex":
    tokens = tokenize(fileContents);
    console.log(tokens);
    break;

  case "--parse":
    ast = parser.produceAst(fileContents);
    console.dir(ast, { depth: null });
    break;
  case "--tacky":
    ast = parser.produceAst(fileContents);
    tas = tasGenerator.generateTas(ast);
    console.dir(tas, {
      depth: null,
    });
    break;
  case "--codegen":
    ast = parser.produceAst(fileContents);
    tas = tasGenerator.generateTas(ast);
    asmTree = generateAsmTree(tas);
    console.dir(asmTree, {
      depth: null,
    });
    break;
  default: {
    ast = parser.produceAst(fileContents);
    tas = tasGenerator.generateTas(ast);
    asmTree = generateAsmTree(tas);
    // TODO: Make this path configurable
    const outPath = "out.asm";
    emit(asmTree, outPath);
  }
}
