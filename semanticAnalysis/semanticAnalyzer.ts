import { Program } from "../parser.ts";
import { LoopLabeler } from "./loopLabeler.ts";
import { VariableResolver } from "./variableResolver.ts";

export function semanticAnalysis(program: Program) {
  // Make sure variable declarations and accesses are valid
  // Also makes sure all variable names are globally unique
  const resolver = new VariableResolver();
  resolver.resolveVariables(program);

  // Label all loops for TAS / ASM passes
  // Check to make sure all break and continue statements
  // are contained within loops and associates them with the
  // correct one
  const labeler = new LoopLabeler();
  labeler.labelLoops(program);
}
