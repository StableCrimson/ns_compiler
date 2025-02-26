import { Token, tokenize, TokenType } from "./tokenizer.ts";

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

export interface Factor extends Expr {
  kind: NodeType;
}

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
    const body = {
      kind: "Block",
      blockItems: [],
    } as Block;
    while (this.peek().type != TokenType.CloseBrace) {
      body.blockItems.push(this.parseBlockItem());
    }
    this.expect(TokenType.CloseBrace);
    return { kind: "Function", symbol, body } as Function;
  }

  private parseBlockItem(): BlockItem {
    const type = this.peek().type;

    switch (type) {
      case TokenType.Int:
        return {
          kind: "DBlock",
          declaration: this.parseDeclaration(),
        } as DBlock;
      default:
        return {
          kind: "SBlock",
          statement: this.parseStatement(),
        } as SBlock;
    }
  }

  private parseDeclaration(): Declaration {
    this.expect(TokenType.Int);
    const ident = this.expect(TokenType.Identifier);
    const decl = {
      kind: "Declaration",
      symbol: ident.value,
    } as Declaration;
    if (this.peek().type == TokenType.Equal) {
      this.consume();
      decl.expr = this.parseExpr();
    }
    this.expect(TokenType.Semicolon);
    return decl;
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
      case TokenType.Semicolon:
        this.consume();
        return { kind: "Null" } as Null;
      case TokenType.If: {
        this.consume();
        this.expect(TokenType.OpenParenthesis);
        const condition = this.parseExpr();
        this.expect(TokenType.CloseParenthesis);
        //this.expect(TokenType.OpenBrace);
        const body = this.parseStatement();
        //this.expect(TokenType.CloseBrace);

        const ifStatement = {
          kind: "If",
          condition,
          then: body,
        } as IfStatement;

        if (this.peek().type == TokenType.Else) {
          this.consume();
          //this.expect(TokenType.OpenBrace);
          ifStatement.else = this.parseStatement();
          //this.expect(TokenType.CloseBrace);
        }
        return ifStatement;
      }
      case TokenType.OpenBrace: {
        this.consume();
        const compound = {
          kind: "Compound",
          block: { kind: "Block", blockItems: [] },
        } as CompoundStatement;

        while (this.peek().type != TokenType.CloseBrace) {
          compound.block.blockItems.push(this.parseBlockItem());
        }
        this.consume();
        return compound;
      }
      default: {
        const expr = {
          kind: "Expression",
          expr: this.parseExpr(),
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
      if (this.peek().type == TokenType.Equal) {
        const right = this.parseExpr(this.precedence(this.nextBinOp(true)));
        left = {
          kind: "Assignment",
          left,
          right,
        } as Assignment;
        continue;
      }

      // Ternary operators
      if (this.peek().type == TokenType.Question) {
        this.consume();
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
        } as ConditionalExpr;
        continue;
      }

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
      case TokenType.Identifier: {
        const ident = this.consume();
        return {
          kind: "Variable",
          symbol: ident.value,
        } as Variable;
      }
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
        console.error("Unknown expression type:", TokenType[type]);
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
        console.error("Expected binary operator:", token);
        Deno.exit(1);
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
      console.error("Unsupported binary operator:", operator);
      Deno.exit(1);
    }
    return precedence;
  }
}
