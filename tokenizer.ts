const IDENTIFIER = /[a-zA-Z_]\w*\b/;
const CONSTANT = /[0-9]+\b/;
const COMMENT = /\/\/.*/;
const BLOCK_COMMENT = /\/\*(\*(?!\/)|[^*])*\*\//;

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
  Decrement,
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
};

export function tokenize(input: string): Token[] {
  let sourceCode = input.trim();
  let tokens: Token[] = [];

  while (sourceCode.length > 0) {
    // Comments
    const comment = sourceCode.match(COMMENT);

    if (comment && sourceCode.startsWith(comment[0])) {
      sourceCode = sourceCode.slice(comment[0].length).trim();
      continue;
    }

    const blockComment = sourceCode.match(BLOCK_COMMENT);

    if (blockComment && sourceCode.startsWith(blockComment[0])) {
      sourceCode = sourceCode.slice(blockComment[0].length).trim();
      continue;
    }

    // Identifiers and keywords
    const ident = sourceCode.match(IDENTIFIER);

    if (ident && sourceCode.startsWith(ident[0])) {
      const token = {
        type: RESERVED_KEYWORDS[ident[0]] ?? TokenType.Identifier,
        value: ident[0],
      };
      tokens.push(token);
      sourceCode = sourceCode.slice(ident[0].length).trim();
      continue;
    }

    // Constants
    const constant = sourceCode.match(CONSTANT);

    if (constant && sourceCode.startsWith(constant[0])) {
      const token = { type: TokenType.Constant, value: constant[0] };
      tokens.push(token);
      sourceCode = sourceCode.slice(constant[0].length).trim();
      continue;
    }

    // Paranthesis
    if (sourceCode[0] === "(") {
      const token = { type: TokenType.OpenParenthesis, value: "(" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }
    if (sourceCode[0] === ")") {
      const token = { type: TokenType.CloseParenthesis, value: ")" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }

    // Brackets
    if (sourceCode[0] === "[") {
      const token = { type: TokenType.OpenBracket, value: "[" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }
    if (sourceCode[0] === "]") {
      const token = { type: TokenType.CloseBracket, value: "]" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }

    // Braces
    if (sourceCode[0] === "{") {
      const token = { type: TokenType.OpenBrace, value: "{" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }
    if (sourceCode[0] === "}") {
      const token = { type: TokenType.CloseBrace, value: "}" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }

    // Semicolon
    if (sourceCode[0] === ";") {
      const token = { type: TokenType.Semicolon, value: ";" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }

    if (sourceCode[0] === "~") {
      const token = { type: TokenType.Tilde, value: "~" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }

    if (sourceCode[0] === "-") {
      // TODO: Not supported yet
      if (sourceCode[1] === "-") {
        const token = { type: TokenType.Decrement, value: "--" };
        tokens.push(token);
        sourceCode = sourceCode.slice(2).trim();
        continue;
      }

      const token = { type: TokenType.Minus, value: "-" };
      tokens.push(token);
      sourceCode = sourceCode.slice(1).trim();
      continue;
    }
    // We weren't able to match the current token, bail
    console.error("Unexpected token: " + sourceCode);
    Deno.exit(1);
  }

  tokens.push({ type: TokenType.EOF, value: "End of file" });
  return tokens;
}
