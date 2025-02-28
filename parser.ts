import { Token, TokenType } from "./tokenizer.ts";
import { bail } from "./utils.ts";

export type NodeType =
  | "Program"
  | "Function"
  | "Statement"
  | "Identifier"
  | "Expr"
  | "Compound"
  | "Conditional"
  | "Declaration"
  | "Expression"
  | "Assignment"
  | "Variable"
  | "UnaryExpr"
  | "BinaryExpr"
  | "Return"
  | "If"
  | "While"
  | "DoWhile"
  | "For"
  | "ForInit"
  | "Break"
  | "Continue"
  | "Null"
  | "Block"
  | "SBlock"
  | "DBlock"
  | "NumLiteral";

export enum UnaryOperator {
  Complement = "~",
  Negation = "-",
  Not = "!",
}

export enum BinaryOperator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
  Divide = "/",
  Remainder = "%",
  LogicalAnd = "&&",
  LogicalOr = "||",
  Equal = "=",
  Assertion = "==",
  NotEqual = "!=",
  LessThan = "<",
  LessThanEqual = "<=",
  GreaterThan = ">",
  GreaterThanEqual = ">=",
  Ternary = "?",
}

interface AstNode {
  kind: NodeType;
  line?: number;
}

export interface Program extends AstNode {
  kind: "Program";
  body: Function[];
}

export interface Function extends AstNode {
  kind: "Function";
  symbol: string;
  body: Block;
}

export interface Statement extends AstNode {
  kind: NodeType;
}

export interface Expr extends AstNode {
  kind: NodeType;
}

export interface Block extends AstNode {
  kind: "Block";
  blockItems: BlockItem[];
}

export interface BlockItem extends AstNode {
  kind: NodeType;
}

export interface Declaration extends AstNode {
  kind: "Declaration";
  symbol: string;
  expr?: Expr;
}

export interface Factor extends Expr {}

export interface Variable extends Expr {
  kind: "Variable";
  symbol: string;
}

export interface Assignment extends Expr {
  kind: "Assignment";
  left: Expr;
  right: Expr;
}

export interface NumLiteral extends Factor {
  kind: "NumLiteral";
  value: number;
}

export interface UnaryExpr extends Factor {
  kind: "UnaryExpr";
  operator: UnaryOperator;
  expr: Factor;
}

export interface BinaryExpr extends Expr {
  kind: "BinaryExpr";
  operator: BinaryOperator;
  left: Expr;
  right: Expr;
}

export interface ConditionalExpr extends Expr {
  kind: "Conditional";
  condition: Expr;
  ifTrue: Expr;
  ifFalse: Expr;
}

export interface ReturnStatement extends Statement {
  kind: "Return";
  value: Expr;
}

export interface ExpressionStatement extends Statement {
  kind: "Expression";
  expr: Expr;
}

export interface IfStatement extends Statement {
  kind: "If";
  condition: Expr;
  then: Statement;
  else?: Statement;
}

export interface WhileStatement extends Statement {
  kind: "While";
  condition: Expr;
  body: Statement;
  label?: string;
}

export interface DoWhileStatement extends Statement {
  kind: "DoWhile";
  condition: Expr;
  body: Statement;
  label?: string;
}

export interface ForStatement extends Statement {
  kind: "For";
  init: ForInit;
  condition?: Expr;
  post?: Expr;
  body: Statement;
  label?: string;
}

export interface Continue extends Statement {
  kind: "Continue";
  label?: string;
}

export interface Break extends Statement {
  kind: "Break";
  label?: string;
}

export interface ForInit extends Statement {
  kind: "ForInit";
  init: Declaration | Expr | undefined;
}

export interface CompoundStatement extends Statement {
  kind: "Compound";
  block: Block;
}

export interface Null extends Statement {
  kind: "Null";
}

export interface SBlock extends BlockItem {
  kind: "SBlock";
  statement: Statement;
}

export interface DBlock extends BlockItem {
  kind: "DBlock";
  declaration: Declaration;
}

export class Parser {
  private tokens: Token[] = [];

  private peek(): Token {
    return this.tokens[0];
  }

  private consume(): Token {
    // This should never be called after the token stream is empty
    return this.tokens.shift() as Token;
  }

  private expect(type: TokenType): Token {
    const token = this.consume();

    if (token.type !== type) {
      throw new Error(
        `Line ${token.line}: Expected ${TokenType[type]} but got ${
          TokenType[token.type]
        }`,
      );
    }

    return token;
  }

  // Returns whether or not the next token is a given type.
  // If consume is true, it will consume the token if it
  // is next
  private isNext(token: TokenType, consume: boolean = false): boolean {
    const isNext = this.peek().type == token;
    if (consume && isNext) {
      this.consume();
    }
    return isNext;
  }

  public produceAst(sourceCode: Token[]): Program {
    this.tokens = sourceCode;

    const program: Program = {
      kind: "Program",
      body: [],
    };

    while (this.tokens.length > 0 && !this.isNext(TokenType.EOF)) {
      program.body.push(this.parseFunction());
    }

    return program;
  }

  private parseFunction(): Function {
    this.expect(TokenType.Int);
    const symbol = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.OpenParenthesis);
    // NOTE: This is where we will handle args
    this.expect(TokenType.Void);
    this.expect(TokenType.CloseParenthesis);
    this.expect(TokenType.OpenBrace);
    const body = {
      kind: "Block",
      blockItems: [],
      line: this.peek().line,
    } as Block;
    while (!this.isNext(TokenType.CloseBrace)) {
      body.blockItems.push(this.parseBlockItem());
    }
    this.expect(TokenType.CloseBrace);
    return {
      kind: "Function",
      symbol,
      body,
      line: this.peek().line,
    } as Function;
  }

  private parseBlockItem(): BlockItem {
    const type = this.peek().type;

    switch (type) {
      case TokenType.Int:
        return {
          kind: "DBlock",
          declaration: this.parseDeclaration(),
          line: this.peek().line,
        } as DBlock;
      default:
        return {
          kind: "SBlock",
          statement: this.parseStatement(),
          line: this.peek().line,
        } as SBlock;
    }
  }

  private parseDeclaration(): Declaration {
    this.expect(TokenType.Int);
    const ident = this.expect(TokenType.Identifier);
    const decl = {
      kind: "Declaration",
      symbol: ident.value,
      line: this.peek().line,
    } as Declaration;
    if (this.isNext(TokenType.Equal, true)) {
      decl.expr = this.parseExpr();
    }
    this.expect(TokenType.Semicolon);
    return decl;
  }

  private parseForInit(): ForInit {
    const init = {
      kind: "ForInit",
      line: this.peek().line,
    } as ForInit;

    if (this.isNext(TokenType.Int)) {
      init.init = this.parseDeclaration();
      return init;
    }
    init.init = this.parseOptionalExpr(TokenType.Semicolon);
    this.expect(TokenType.Semicolon);
    return init;
  }

  private parseOptionalExpr(nextToken: TokenType): Expr | undefined {
    if (!this.isNext(nextToken)) {
      return this.parseExpr();
    }
  }

  private parseStatement(): Statement {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Return: {
        this.consume();
        const expr = this.parseExpr();
        this.expect(TokenType.Semicolon);
        return {
          kind: "Return",
          value: expr,
          line: token.line,
        } as ReturnStatement;
      }
      case TokenType.Semicolon:
        this.consume();
        return { kind: "Null", line: token.line } as Null;
      case TokenType.If: {
        this.consume();
        this.expect(TokenType.OpenParenthesis);
        const condition = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        const body = this.parseStatement();

        const ifStatement = {
          kind: "If",
          condition,
          then: body,
          line: token.line,
        } as IfStatement;

        if (this.isNext(TokenType.Else, true)) {
          ifStatement.else = this.parseStatement();
        }
        return ifStatement;
      }
      case TokenType.OpenBrace: {
        this.consume();
        const compound = {
          kind: "Compound",
          block: { kind: "Block", blockItems: [] },
          line: token.line,
        } as CompoundStatement;

        while (!this.isNext(TokenType.CloseBrace)) {
          compound.block.blockItems.push(this.parseBlockItem());
        }
        this.consume();
        return compound;
      }
      case TokenType.While: {
        this.consume();
        this.expect(TokenType.OpenParenthesis);
        const condition = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        return {
          kind: "While",
          condition,
          body: this.parseStatement(),
          line: token.line,
        } as WhileStatement;
      }
      case TokenType.Do: {
        this.consume();
        const statement = {
          kind: "DoWhile",
          body: this.parseStatement(),
          line: token.line,
        } as DoWhileStatement;
        this.expect(TokenType.While);
        this.expect(TokenType.OpenParenthesis);
        statement.condition = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        this.expect(TokenType.Semicolon);
        return statement;
      }
      case TokenType.For: {
        this.consume();
        this.expect(TokenType.OpenParenthesis);
        const statement = {
          kind: "For",
          init: this.parseForInit(),
          line: token.line,
        } as ForStatement;
        statement.condition = this.parseOptionalExpr(TokenType.Semicolon);
        this.expect(TokenType.Semicolon);
        statement.post = this.parseOptionalExpr(TokenType.CloseParenthesis);
        this.expect(TokenType.CloseParenthesis);
        statement.body = this.parseStatement();
        return statement;
      }
      case TokenType.Break: {
        this.consume();
        const statement = { kind: "Break", line: token.line } as Break;
        this.expect(TokenType.Semicolon);
        return statement;
      }
      case TokenType.Continue: {
        this.consume();
        const statement = { kind: "Continue", line: token.line } as Continue;
        this.expect(TokenType.Semicolon);
        return statement;
      }
      default: {
        const expr = {
          kind: "Expression",
          expr: this.parseExpr(),
          line: token.line,
        } as ExpressionStatement;
        this.expect(TokenType.Semicolon);
        return expr;
      }
    }
  }

  private parseExpr(minimumPrecedence: number = 0): Expr {
    let left = this.parseFactor();

    // If we have a binary operator, we need to treat
    // this like a binary expression
    while (
      this.isNextBinOp() &&
      this.precedence(this.nextBinOp(false)) >= minimumPrecedence
    ) {
      // Assignments are right associative and need to be handled slightly differently
      if (this.isNext(TokenType.Equal)) {
        const line = this.peek().line;
        const right = this.parseExpr(this.precedence(this.nextBinOp(true)));
        left = {
          kind: "Assignment",
          left,
          right,
          line,
        } as Assignment;
        continue;
      }

      // Ternary operators
      if (this.isNext(TokenType.Question, true)) {
        const line = this.peek().line;
        const middle = this.parseExpr();
        this.expect(TokenType.Colon);
        const falseTrack = this.parseExpr(
          this.precedence(BinaryOperator.Ternary),
        );
        left = {
          kind: "Conditional",
          condition: left,
          ifTrue: middle,
          ifFalse: falseTrack,
          line,
        } as ConditionalExpr;
        continue;
      }

      const line = this.peek().line;
      const operator = this.nextBinOp(true);
      const right = this.parseExpr(this.precedence(operator) + 1);
      left = {
        kind: "BinaryExpr",
        operator,
        left,
        right,
        line,
      } as BinaryExpr;
    }
    return left;
  }

  private parseFactor(): Factor {
    const token = this.consume();
    switch (token.type) {
      case TokenType.Identifier: {
        return {
          kind: "Variable",
          symbol: token.value,
          line: token.line,
        } as Variable;
      }
      case TokenType.Constant: {
        return {
          kind: "NumLiteral",
          value: parseInt(token.value),
          line: token.line,
        } as NumLiteral;
      }
      case TokenType.OpenParenthesis: {
        const expr = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        return expr;
      }
      case TokenType.Minus: {
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Negation,
          expr,
          line: token.line,
        } as UnaryExpr;
      }
      case TokenType.Tilde: {
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Complement,
          expr,
          line: token.line,
        } as UnaryExpr;
      }
      case TokenType.LogicalNot: {
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Not,
          expr,
          line: token.line,
        } as UnaryExpr;
      }
      default:
        bail(
          `ParseError on line ${token.line}: Unexpected expression type: ${
            TokenType[token.type]
          }`,
        );
    }

    // NOTE: Unreachable, just to make the TS compiler happy
    return {} as Expr;
  }

  private isNextBinOp(): boolean {
    switch (this.peek().type) {
      case TokenType.Plus:
      case TokenType.Minus:
      case TokenType.Asterisk:
      case TokenType.ForwardSlash:
      case TokenType.Modulus:
      case TokenType.Equal:
      case TokenType.DoubleEqual:
      case TokenType.NotEqual:
      case TokenType.LogicalAnd:
      case TokenType.LogicalOr:
      case TokenType.GreaterThan:
      case TokenType.GreaterThanEqual:
      case TokenType.LessThan:
      case TokenType.LessThanEqual:
      case TokenType.Question:
        return true;
      default:
        return false;
    }
  }

  private nextBinOp(consume: boolean): BinaryOperator {
    const token = consume ? this.consume() : this.peek();

    switch (token.type) {
      case TokenType.Plus:
        return BinaryOperator.Add;
      case TokenType.Minus:
        return BinaryOperator.Subtract;
      case TokenType.Asterisk:
        return BinaryOperator.Multiply;
      case TokenType.ForwardSlash:
        return BinaryOperator.Divide;
      case TokenType.Modulus:
        return BinaryOperator.Remainder;
      case TokenType.Equal:
        return BinaryOperator.Equal;
      case TokenType.DoubleEqual:
        return BinaryOperator.Assertion;
      case TokenType.NotEqual:
        return BinaryOperator.NotEqual;
      case TokenType.LogicalAnd:
        return BinaryOperator.LogicalAnd;
      case TokenType.LogicalOr:
        return BinaryOperator.LogicalOr;
      case TokenType.GreaterThan:
        return BinaryOperator.GreaterThan;
      case TokenType.GreaterThanEqual:
        return BinaryOperator.GreaterThanEqual;
      case TokenType.LessThan:
        return BinaryOperator.LessThan;
      case TokenType.LessThanEqual:
        return BinaryOperator.LessThanEqual;
      case TokenType.Question:
        return BinaryOperator.Ternary;
      default:
        bail(
          `ParseError on line ${token.line}: Expected binary operator, got: ${token}`,
        );
    }

    // NOTE unreachable
    return {} as BinaryOperator;
  }

  private precedence(operator: BinaryOperator): number {
    const precedenceMap: Record<string, number> = {
      "=": 1,
      "?": 3,
      "||": 5,
      "&&": 10,
      "==": 30,
      "!=": 30,
      "<": 35,
      "<=": 35,
      ">": 35,
      ">=": 35,
      "+": 45,
      "-": 45,
      "*": 50,
      "/": 50,
      "%": 50,
    };

    const precedence = precedenceMap[operator];
    if (!precedence) {
      bail(`Unexpected binary operator: ${operator}`);
    }
    return precedence;
  }
}
