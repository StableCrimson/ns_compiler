import { Token, tokenize, TokenType } from "./tokenizer.ts";

export type NodeType =
  | "Program"
  | "Function"
  | "Statement"
  | "Identifier"
  | "Expr"
  | "UnaryExpr"
  | "BinaryExpr"
  | "Return"
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
  Assertion = "==",
  NotEqual = "!=",
  LessThan = "<",
  LessThanEqual = "<=",
  GreaterThan = ">",
  GreaterThanEqual = ">=",
}

interface AstNode {
  kind: NodeType;
}

export interface Program extends AstNode {
  kind: "Program";
  body: Function[];
}

export interface Function extends AstNode {
  kind: "Function";
  symbol: string;
  body: Statement[];
}

export interface Statement extends AstNode {
  kind: NodeType;
}

export interface Expr extends AstNode {
  kind: NodeType;
}

export interface Factor extends Expr {
  kind: NodeType;
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

export interface ReturnStatement extends Statement {
  kind: "Return";
  value: Expr;
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
        `Expected ${TokenType[type]} but got ${TokenType[token.type]}`,
      );
    }

    return token;
  }

  public produceAst(sourceCode: string): Program {
    this.tokens = tokenize(sourceCode);

    const program: Program = {
      kind: "Program",
      body: [],
    };

    while (this.tokens.length > 0 && this.peek().type !== TokenType.EOF) {
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
    const body = [this.parseStatement()];
    this.expect(TokenType.CloseBrace);

    return { kind: "Function", symbol, body } as Function;
  }

  private parseStatement(): Statement {
    const type = this.peek().type;

    switch (type) {
      case TokenType.Return: {
        this.consume();
        const expr = this.parseExpr();
        this.expect(TokenType.Semicolon);
        return { kind: "Return", value: expr } as ReturnStatement;
      }
      default:
        console.error("Unknown statement type", type);
        Deno.exit(1);
    }

    // This will never be reached, just need to make the TS compiler happy
    return {} as Statement;
  }

  private parseExpr(minimumPrecedence: number = 0): Expr {
    let left = this.parseFactor();

    // If we have a binary operator, we need to treat
    // this like a binary expression
    while (
      this.isNextBinOp() &&
      this.precedence(this.nextBinOp(false)) >= minimumPrecedence
    ) {
      const operator = this.nextBinOp(true);
      const right = this.parseExpr(this.precedence(operator) + 1);
      left = {
        kind: "BinaryExpr",
        operator,
        left,
        right,
      } as BinaryExpr;
    }

    return left;
  }

  private parseFactor(): Factor {
    const type = this.peek().type;
    switch (type) {
      case TokenType.Constant: {
        const expr = this.consume();
        return {
          kind: "NumLiteral",
          value: parseInt(expr.value),
        } as NumLiteral;
      }
      case TokenType.OpenParenthesis: {
        this.consume();
        const expr = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        return expr;
      }
      case TokenType.Minus: {
        this.consume();
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Negation,
          expr,
        } as UnaryExpr;
      }
      case TokenType.Tilde: {
        this.consume();
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Complement,
          expr,
        } as UnaryExpr;
      }
      case TokenType.LogicalNot: {
        this.consume();
        const expr = this.parseFactor();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Not,
          expr,
        } as UnaryExpr;
      }
      default:
        console.error("Unknown expression type", type);
        Deno.exit(1);
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
      case TokenType.DoubleEqual:
      case TokenType.NotEqual:
      case TokenType.LogicalAnd:
      case TokenType.LogicalOr:
      case TokenType.GreaterThan:
      case TokenType.GreaterThanEqual:
      case TokenType.LessThan:
      case TokenType.LessThanEqual:
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
      default:
        console.error("Expected binary operator:", token);
        Deno.exit(1);
    }

    // NOTE unreachable
    return {} as BinaryOperator;
  }

  private precedence(operator: BinaryOperator): number {
    const precedenceMap: Record<string, number> = {
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

    if (precedence) {
      return precedence;
    }

    console.error("Unsupported binary operator:", operator);
    Deno.exit(1);

    // NOTE: Unreachable
    return 1000000;
  }
}
