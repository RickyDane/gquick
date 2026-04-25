import { Calculator } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";

const MAX_CALCULATOR_QUERY_LENGTH = 256;
const MAX_PARSE_DEPTH = 64;

class ExpressionParser {
  private position = 0;

  constructor(private readonly input: string) {}

  parse(): number | null {
    const value = this.parseExpression();
    this.skipWhitespace();

    return value !== null && this.position === this.input.length ? value : null;
  }

  private parseExpression(depth = 0): number | null {
    if (depth > MAX_PARSE_DEPTH) return null;

    let value = this.parseTerm(depth);
    if (value === null) return null;

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "+" && operator !== "-") return value;

      this.position += 1;
      const right = this.parseTerm(depth);
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
  }

  private parseTerm(depth: number): number | null {
    let value = this.parseFactor(depth);
    if (value === null) return null;

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();
      if (operator !== "*" && operator !== "/") return value;

      this.position += 1;
      const right = this.parseFactor(depth);
      if (right === null) return null;
      value = operator === "*" ? value * right : value / right;
    }
  }

  private parseFactor(depth: number): number | null {
    if (depth > MAX_PARSE_DEPTH) return null;

    this.skipWhitespace();

    const operator = this.peek();
    if (operator === "+" || operator === "-") {
      this.position += 1;
      const value = this.parseFactor(depth + 1);
      if (value === null) return null;
      return operator === "-" ? -value : value;
    }

    if (operator === "(") {
      this.position += 1;
      const value = this.parseExpression(depth + 1);
      this.skipWhitespace();

      if (value === null || this.peek() !== ")") return null;
      this.position += 1;
      return value;
    }

    return this.parseNumber();
  }

  private parseNumber(): number | null {
    this.skipWhitespace();
    const start = this.position;
    let hasDigit = false;
    let hasDecimal = false;

    while (this.position < this.input.length) {
      const char = this.input[this.position];
      if (char >= "0" && char <= "9") {
        hasDigit = true;
        this.position += 1;
        continue;
      }
      if (char === "." && !hasDecimal) {
        hasDecimal = true;
        this.position += 1;
        continue;
      }
      break;
    }

    if (!hasDigit) return null;
    return Number(this.input.slice(start, this.position));
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) this.position += 1;
  }

  private peek(): string {
    return this.input[this.position] ?? "";
  }
}

function evaluateMathExpression(query: string): number | null {
  if (query.length > MAX_CALCULATOR_QUERY_LENGTH) return null;
  if (!/^[-+*/.()0-9\s]+$/.test(query) || !/[0-9]/.test(query)) return null;

  try {
    const result = new ExpressionParser(query).parse();
    return result !== null && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export const calculatorPlugin: GQuickPlugin = {
  metadata: {
    id: "calculator",
    title: "Calculator",
    subtitle: "Simple math expressions",
    icon: Calculator,
    keywords: ["calc", "math", "add", "subtract", "multiply", "divide"],
  },
  tools: [
    {
      name: "calculate",
      description: "Evaluate a mathematical expression. Supports +, -, *, /, parentheses, and decimals.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Math expression to evaluate, e.g. '(15 + 7) * 3'",
          },
        },
        required: ["expression"],
      },
    },
  ],
  executeTool: async (_name: string, args: Record<string, any>): Promise<ToolResult> => {
    const expression = args.expression;
    if (typeof expression !== "string") {
      return { content: "", success: false, error: "Missing expression parameter" };
    }
    const result = evaluateMathExpression(expression);
    if (result === null) {
      return { content: "", success: false, error: "Invalid or unsupported expression" };
    }
    return { content: result.toString(), success: true };
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    try {
      const result = evaluateMathExpression(query);
      if (result === null) return [];

      return [{
        id: "calculator-result",
        pluginId: "calculator",
        title: `= ${result}`,
        subtitle: `Calculation: ${query}`,
        icon: Calculator,
        score: 100,
        onSelect: async () => {
          await navigator.clipboard.writeText(result.toString());
          await getCurrentWindow().hide();
        },
      }];
    } catch {
      return [];
    }
  },
};
