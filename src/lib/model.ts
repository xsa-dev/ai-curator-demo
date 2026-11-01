import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
export function getModel() {
  if (process.env.LLM_PROVIDER === "google") {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error("LLM_NOT_CONFIGURED");
    return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(process.env.GOOGLE_MODEL || "gemini-2.5-flash");
  }
  if (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== "groq") throw new Error("LLM_NOT_CONFIGURED");
  if (!process.env.GROQ_API_KEY) throw new Error("LLM_NOT_CONFIGURED");
  return createGroq({ apiKey: process.env.GROQ_API_KEY })(process.env.GROQ_MODEL || "openai/gpt-oss-120b");
}
