import {
  Block,
  BlockItem,
  Break,
  CompoundStatement,
  Continue,
  DoWhileStatement,
  ForStatement,
  Function,
  IfStatement,
  Program,
  SBlock,
  Statement,
  WhileStatement,
} from "../parser.ts";
import { bail } from "../utils.ts";

export class LoopLabeler {
  private loopLabelCounter: number = 0;
  public labelLoops(program: Program) {
    for (const func of program.body) {
      this.labelFunction(func);
    }
  }

  private labelFunction(func: Function) {
    this.labelBlock(func.body);
  }

  private labelBlock(
    block: Block,
    currentLoopId: number | undefined = undefined,
  ) {
    for (const item of block.blockItems) {
      this.labelBlockItem(item, currentLoopId);
    }
  }

  private labelBlockItem(
    item: BlockItem,
    currentLoopId: number | undefined = undefined,
  ) {
    if (item.kind == "SBlock") {
      this.labelStatement((item as SBlock).statement, currentLoopId);
    }
  }

  private labelStatement(
    statement: Statement,
    currentLoopId: number | undefined,
  ) {
    switch (statement.kind) {
      case "Compound":
        this.labelBlock((statement as CompoundStatement).block, currentLoopId);
        break;
      case "Break":
        if (!currentLoopId) {
          bail(
            `LoopLabeling error on line ${statement.line}: Break statement outside of loop`,
          );
        }
        (statement as Break).label = this.getLoopLabel();
        break;
      case "Continue":
        if (!currentLoopId) {
          bail(
            `LoopLabeling error on line ${statement.line}: Continue statement outside of loop`,
          );
        }
        (statement as Continue).label = this.getLoopLabel();
        break;
      case "While":
        (statement as WhileStatement).label = this.getLoopLabel(true);
        this.labelStatement(
          (statement as WhileStatement).body,
          this.loopLabelCounter,
        );
        break;
      case "DoWhile":
        (statement as DoWhileStatement).label = this.getLoopLabel(true);
        this.labelStatement(
          (statement as DoWhileStatement).body,
          this.loopLabelCounter,
        );
        break;
      case "For":
        (statement as ForStatement).label = this.getLoopLabel(true);
        this.labelStatement(
          (statement as ForStatement).body,
          this.loopLabelCounter,
        );
        break;
      case "If":
        this.labelStatement((statement as IfStatement).then, currentLoopId);
        if ((statement as IfStatement).else) {
          // NOTE: else will never be undefined if we get here
          this.labelStatement((statement as IfStatement).else ?? {} as Statement, currentLoopId);
        }
    }
  }

  private getLoopLabel(isNewLabel: boolean = false): string {
    if (isNewLabel) {
      this.loopLabelCounter++;
    }
    return `loop_${this.loopLabelCounter}`;
  }
}
