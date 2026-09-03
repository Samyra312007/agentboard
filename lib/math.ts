/**
 * Safe arithmetic expression evaluator.
 *
 * Replaces the previous `Function("return ...")()` approach, which executed
 * arbitrary JavaScript. This is a small recursive-descent parser that only
 * understands numbers, `+ - * / % ^` and parentheses, with hard limits on
 * expression length, token count and operand count.
 */

const MAX_EXPRESSION_LENGTH = 200;
const MAX_TOKENS = 100;
const MAX_OPERANDS = 32;

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    // Skip whitespace between tokens without merging adjacent numbers.
    if (char === " " || char === "\t" || char === "\n") {
      i++;
      continue;
    }

    if (char >= "0" && char <= "9") {
      let j = i;
      while (j < input.length && (input[j] >= "0" && input[j] <= "9" || input[j] === ".")) {
        j++;
      }
      const raw = input.slice(i, j);
      // Reject malformed numbers like "1.2.3"
      if ((raw.match(/\./g) || []).length > 1) {
        throw new ExpressionError(`Invalid number: ${raw}`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`Invalid number: ${raw}`);
      }
      tokens.push({ kind: "number", value });
      i = j;
      continue;
    }

    if ("+-*/%^()".includes(char)) {
      if (char === "(") tokens.push({ kind: "lparen" });
      else if (char === ")") tokens.push({ kind: "rparen" });
      else tokens.push({ kind: "operator", value: char });
      i++;
      continue;
    }

    throw new ExpressionError(`Unexpected character: ${char}`);
  }

  return tokens;
}

export function evaluateExpression(input: string): number {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ExpressionError("Expression is empty");
  }
  if (input.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression exceeds ${MAX_EXPRESSION_LENGTH} characters`);
  }

  const tokens = tokenize(input);
  if (tokens.length === 0) throw new ExpressionError("Expression is empty");
  if (tokens.length > MAX_TOKENS) throw new ExpressionError("Expression has too many tokens");

  let operandCount = 0;
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];

  const expectNumber = (): number => {
    const token = peek();
    if (!token || token.kind !== "number") {
      throw new ExpressionError("Expected a number");
    }
    pos++;
    operandCount++;
    if (operandCount > MAX_OPERANDS) {
      throw new ExpressionError(`Expression has too many operands (max ${MAX_OPERANDS})`);
    }
    return token.value;
  };

  // expression := term (('+' | '-') term)*
  const parseExpression = (): number => {
    let left = parseTerm();
    for (;;) {
      const token = peek();
      if (token && token.kind === "operator" && (token.value === "+" || token.value === "-")) {
        pos++;
        const right = parseTerm();
        left = token.value === "+" ? left + right : left - right;
      } else {
        return left;
      }
    }
  };

  // term := factor (('*' | '/' | '%') factor)*
  const parseTerm = (): number => {
    let left = parseFactor();
    for (;;) {
      const token = peek();
      if (token && token.kind === "operator" && ["*", "/", "%"].includes(token.value)) {
        pos++;
        const right = parseFactor();
        if (token.value === "*") left = left * right;
        else if (token.value === "/") {
          if (right === 0) throw new ExpressionError("Division by zero");
          left = left / right;
        } else {
          if (right === 0) throw new ExpressionError("Division by zero");
          left = left % right;
        }
      } else {
        return left;
      }
    }
  };

  // factor := '-' factor | '(' expression ')' | number | factor '^' factor
  const parseFactor = (): number => {
    const token = peek();
    if (token && token.kind === "operator" && token.value === "-") {
      pos++;
      return -parseFactor();
    }
    if (token && token.kind === "lparen") {
      pos++;
      const value = parseExpression();
      const closing = peek();
      if (!closing || closing.kind !== "rparen") {
        throw new ExpressionError('Expected operator ")"');
      }
      pos++;
      return value;
    }
    const base = expectNumber();
    const next = peek();
    if (next && next.kind === "operator" && next.value === "^") {
      pos++;
      const exponent = parseFactor();
      return Math.pow(base, exponent);
    }
    return base;
  };

  const result = parseExpression();
  if (pos !== tokens.length) {
    throw new ExpressionError("Unexpected token at end of expression");
  }
  if (!Number.isFinite(result)) {
    throw new ExpressionError("Result is not a finite number");
  }
  return result;
}