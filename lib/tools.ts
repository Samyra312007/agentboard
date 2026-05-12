import type { Tool, ToolResult } from "@/types";

// Simulated web search tool
export const webSearch: Tool = {
  name: "web_search",
  description: "Search the web for information about a topic",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const query = params.query as string;

    // Simulate web search with realistic mock data
    const mockResults: Record<string, string[]> = {
      "AI startups": [
        "Zeta AI - Building autonomous agents for enterprise workflows",
        "NeuralShift - AI-powered code generation platform",
        "Cognition Labs - Developer tools for AI engineers",
        "Adept AI - Training AI to use software tools",
        "Anthropic - AI safety research and Claude AI",
      ],
      "default": [
        "Result 1: Relevant information about the query",
        "Result 2: Additional context and details",
        "Result 3: Supporting information",
      ],
    };

    const key = Object.keys(mockResults).find(k => 
      query.toLowerCase().includes(k.toLowerCase())
    ) || "default";

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));

    const output = mockResults[key];

    return {
      success: true,
      output: { results: output },
      latency_ms: Date.now() - startTime,
    };
  },
};

// Calculator tool
export const calculator: Tool = {
  name: "calculator",
  description: "Perform mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "A mathematical expression to evaluate (e.g., '2 + 2' or '10 * 5')",
      },
    },
    required: ["expression"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const expression = params.expression as string;

    try {
      // Safe evaluation of mathematical expressions
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();

      await new Promise(resolve => setTimeout(resolve, 100));

      return {
        success: true,
        output: { expression, result },
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: null,
        error: `Invalid expression: ${expression}`,
        latency_ms: Date.now() - startTime,
      };
    }
  },
};

// Summarizer tool
export const summarizer: Tool = {
  name: "summarizer",
  description: "Summarize a long text into key points",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to summarize",
      },
      maxLength: {
        type: "number",
        description: "Maximum length of the summary in words",
        default: 50,
      },
    },
    required: ["text"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const text = params.text as string;
    const maxLength = (params.maxLength as number) || 50;

    // Simple summarization: take first few sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const summary = sentences
      .slice(0, 3)
      .join(". ")
      .trim()
      .substring(0, maxLength * 10);

    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      success: true,
      output: { summary, originalLength: text.split(/\s+/).length, summaryLength: summary.split(/\s+/).length },
      latency_ms: Date.now() - startTime,
    };
  },
};

// Weather tool (simulated)
export const weather: Tool = {
  name: "weather",
  description: "Get current weather information for a location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city or location name",
      },
    },
    required: ["location"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const location = params.location as string;

    // Simulated weather data
    const mockWeather = {
      temperature: Math.floor(15 + Math.random() * 20),
      condition: ["sunny", "cloudy", "partly cloudy", "rainy"][Math.floor(Math.random() * 4)],
      humidity: Math.floor(40 + Math.random() * 40),
      windSpeed: Math.floor(5 + Math.random() * 20),
    };

    await new Promise(resolve => setTimeout(resolve, 250));

    return {
      success: true,
      output: { location, ...mockWeather },
      latency_ms: Date.now() - startTime,
    };
  },
};

// Tool registry
export const tools: Tool[] = [webSearch, calculator, summarizer, weather];

export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}
