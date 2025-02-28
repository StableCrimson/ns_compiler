import { bail } from "./utils.ts";

const IDENTIFIER = /[a-zA-Z_]\w*\b/;
const CONSTANT = /[0-9]+\b/;
const COMMENT = /\/\/.*/;
const BLOCK_COMMENT = /\/\*(\*(?!\/)|[^*])*\*\//;
const PREPROCESSOR_STATEMENT = /#.+\n/;

export enum TokenType {
  Identifier,
  Constant,
  ReservedKeyword,
  OpenParenthesis,
  CloseParenthesis,
  OpenBrace,
  CloseBrace,
  OpenBracket,
  CloseBracket,
  Semicolon,
  Return,
  If,
  Else,
  Question,
  Colon,
  Continue,
  Break,
  While,
  For,
  Do,
  Switch,
  Case,
  Default,
  Goto,
  Void,
  Char,
  Short,
  Int,
  Long,
  Float,
  Double,
  Signed,
  Unsigned,
  Tilde,
  Minus,
  Plus,
  Decrement,
  Increment,
  MinusEqual,
  PlusEqual,
  AsteriskEqual,
  SlashEqual,
  Asterisk,
  ForwardSlash,
  Modulus,
  ModulusEqual,
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  AndEqual,
  OrEqual,
  XorEqual,
  LogicalAnd,
  LogicalOr,
  LogicalNot,
  NotEqual,
  Equal,
  DoubleEqual,
  LeftShift,
  LeftShiftEqual,
  RightShift,
  RightShiftEqual,
  GreaterThan,
  LessThan,
  GreaterThanEqual,
  LessThanEqual,
  EOF,
}

const RESERVED_KEYWORDS: Record<string, TokenType> = {
  return: TokenType.Return,
  if: TokenType.If,
  else: TokenType.Else,
  continue: TokenType.Continue,
  break: TokenType.Break,
  while: TokenType.While,
  for: TokenType.For,
  do: TokenType.Do,
  switch: TokenType.Switch,
  case: TokenType.Case,
  default: TokenType.Default,
  goto: TokenType.Goto,
  void: TokenType.Void,
  char: TokenType.Char,
  short: TokenType.Short,
  int: TokenType.Int,
  long: TokenType.Long,
  float: TokenType.Float,
  double: TokenType.Double,
  signed: TokenType.Signed,
  unsigned: TokenType.Unsigned,
};

export type Token = {
  type: TokenType;
  value: string;
  line?: number;
};

export class Lexer {
  private line = 0;
  private sourceCode = "";
  private tokens: Token[] = [];

  public tokenize(input: string): Token[] {
    this.sourceCode = input.trim();
    this.line = 1;
    this.tokens = [];

    while (this.sourceCode.length > 0) {
      while (this.sourceCode.startsWith("\n")) {
        this.line++;
        this.sourceCode = this.sourceCode.slice(1);
      }
      this.sourceCode = this.sourceCode.trim();

      // Preprocessor steps
      this.sourceCode = this.sourceCode.trim();
      // TODO: Will need to actually support this later
      const preprocessorStatement = this.sourceCode.match(
        PREPROCESSOR_STATEMENT,
      );
      if (
        preprocessorStatement &&
        this.sourceCode.startsWith(preprocessorStatement[0])
      ) {
        this.line += (preprocessorStatement[0].match(/\n/) || []).length;
        this.sourceCode = this.sourceCode.slice(
          preprocessorStatement[0].length,
        );
        continue;
      }

      // Comments
      const comment = this.sourceCode.match(COMMENT);

      if (comment && this.sourceCode.startsWith(comment[0])) {
        this.line += (comment[0].match(/\n/) || []).length;
        this.sourceCode = this.sourceCode.slice(comment[0].length);
        continue;
      }

      const blockComment = this.sourceCode.match(BLOCK_COMMENT);

      if (blockComment && this.sourceCode.startsWith(blockComment[0])) {
        this.line += (blockComment[0].match(/\n/) || []).length;
        this.sourceCode = this.sourceCode.slice(blockComment[0].length);
        continue;
      }

      // Identifiers and keywords
      const ident = this.sourceCode.match(IDENTIFIER);

      if (ident && this.sourceCode.startsWith(ident[0])) {
        const token = {
          type: RESERVED_KEYWORDS[ident[0]] ?? TokenType.Identifier,
          value: ident[0],
          line: this.line,
        };
        this.tokens.push(token);
        this.sourceCode = this.sourceCode.slice(ident[0].length).trim();
        continue;
      }

      // Constants
      const constant = this.sourceCode.match(CONSTANT);

      if (constant && this.sourceCode.startsWith(constant[0])) {
        const token = {
          type: TokenType.Constant,
          value: constant[0],
          line: this.line,
        };
        this.tokens.push(token);
        this.sourceCode = this.sourceCode.slice(constant[0].length).trim();
        continue;
      }

      // Paranthesis
      if (this.testToken("(", TokenType.OpenParenthesis)) {
        continue;
      }
      if (this.testToken(")", TokenType.CloseParenthesis)) {
        continue;
      }

      // Brackets
      if (this.testToken("[", TokenType.OpenBracket)) {
        continue;
      }
      if (this.testToken("]", TokenType.CloseBracket)) {
        continue;
      }

      // Braces
      if (this.testToken("{", TokenType.OpenBrace)) {
        continue;
      }
      if (this.testToken("}", TokenType.CloseBrace)) {
        continue;
      }

      if (this.testToken(";", TokenType.Semicolon)) {
        continue;
      }
      if (this.testToken("?", TokenType.Question)) {
        continue;
      }
      if (this.testToken(":", TokenType.Colon)) {
        continue;
      }
      if (this.testToken("~", TokenType.Tilde)) {
        continue;
      }

      // Minus Operators
      if (this.testToken("--", TokenType.Decrement)) {
        continue;
      }
      if (this.testToken("-=", TokenType.MinusEqual)) {
        continue;
      }
      if (this.testToken("-", TokenType.Minus)) {
        continue;
      }

      if (this.testToken("++", TokenType.Increment)) {
        continue;
      }
      if (this.testToken("+=", TokenType.PlusEqual)) {
        continue;
      }
      if (this.testToken("+", TokenType.Plus)) {
        continue;
      }

      if (this.testToken("*=", TokenType.AsteriskEqual)) {
        continue;
      }
      if (this.testToken("*", TokenType.Asterisk)) {
        continue;
      }

      if (this.testToken("/=", TokenType.SlashEqual)) {
        continue;
      }
      if (this.testToken("/", TokenType.ForwardSlash)) {
        continue;
      }

      if (this.testToken("%=", TokenType.ModulusEqual)) {
        continue;
      }
      if (this.testToken("%", TokenType.Modulus)) {
        continue;
      }

      if (this.testToken("!=", TokenType.NotEqual)) {
        continue;
      }
      if (this.testToken("!", TokenType.LogicalNot)) {
        continue;
      }

      if (this.testToken("&&", TokenType.LogicalAnd)) {
        continue;
      }
      if (this.testToken("&=", TokenType.AndEqual)) {
        continue;
      }
      if (this.testToken("&", TokenType.BitwiseAnd)) {
        continue;
      }

      if (this.testToken("||", TokenType.LogicalOr)) {
        continue;
      }
      if (this.testToken("|=", TokenType.OrEqual)) {
        continue;
      }
      if (this.testToken("|", TokenType.BitwiseOr)) {
        continue;
      }

      if (this.testToken("^=", TokenType.XorEqual)) {
        continue;
      }
      if (this.testToken("^", TokenType.BitwiseXor)) {
        continue;
      }

      if (this.testToken(">>=", TokenType.RightShiftEqual)) {
        continue;
      }
      if (this.testToken(">>", TokenType.RightShift)) {
        continue;
      }
      if (this.testToken(">=", TokenType.GreaterThanEqual)) {
        continue;
      }
      if (this.testToken(">", TokenType.GreaterThan)) {
        continue;
      }

      if (this.testToken("<<=", TokenType.LeftShiftEqual)) {
        continue;
      }
      if (this.testToken("<<", TokenType.LeftShift)) {
        continue;
      }
      if (this.testToken("<=", TokenType.LessThanEqual)) {
        continue;
      }
      if (this.testToken("<", TokenType.LessThan)) {
        continue;
      }

      if (this.testToken("==", TokenType.DoubleEqual)) {
        continue;
      }
      if (this.testToken("=", TokenType.Equal)) {
        continue;
      }

      // We weren't able to match the current token, bail
      bail(
        `LexError: Unexpected token on line ${this.line}: ${this.sourceCode}`,
      );
    }

    this.tokens.push({ type: TokenType.EOF, value: "End of file" });
    return this.tokens;
  }

  private testToken(character: string, token: TokenType): boolean {
    if (this.sourceCode.startsWith(character)) {
      this.tokens.push({ type: token, value: character, line: this.line });
      this.sourceCode = this.sourceCode.slice(character.length);
      return true;
    }
    return false;
  }
}
