import { Token, tokenize, TokenType } from "./tokenizer.ts";

export type NodeType =
  | "Program"
  | "Function"
  | "Statement"
  | "Identifier"
  | "Expr"
  | "UnaryExpr"
  | "Return"
  | "NumLiteral";

export enum UnaryOperator {
  Complement = "~",
  Negation = "-",
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

export interface NumLiteral extends Expr {
  kind: "NumLiteral";
  value: number;
}

export interface UnaryExpr extends Expr {
  kind: "UnaryExpr";
  operator: UnaryOperator;
  expr: Expr;
}

export interface ReturnStatement extends Statement {
  kind: "Return";
  value: Expr;
}

interface IfStatement extends Statement {
  condition: Expr;
  thenBranch: Statement;
  elseBranch?: Statement;
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

    let program: Program = {
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
      case TokenType.If: {
        this.consume();
        this.expect(TokenType.OpenParenthesis);
        const condition = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        this.expect(TokenType.OpenBrace);
        const thenBranch = this.parseStatement();
        this.expect(TokenType.CloseBrace);

        let elseBranch: Statement | undefined;

        if (this.peek().type === TokenType.Else) {
          this.consume();
          elseBranch = this.parseStatement();
        }

        return { condition, thenBranch, elseBranch } as IfStatement;
      }
      default:
        console.error("Unknown statement type", type);
        Deno.exit(1);
    }

    // This will never be reached, just need to make the TS compiler happy
    return {} as Statement;
  }

  private parseExpr(): Expr {
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
        const expr = this.parseExpr();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Negation,
          expr,
        } as UnaryExpr;
      }
      case TokenType.Tilde: {
        this.consume();
        const expr = this.parseExpr();
        return {
          kind: "UnaryExpr",
          operator: UnaryOperator.Complement,
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
}
