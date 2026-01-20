// lib/gemini.ts
// Google Gemini AI client initialization

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Using gemini-1.5-pro (version 1.5, better quality)
// gemini-pro is deprecated, use gemini-1.5-pro or gemini-1.5-flash instead
export const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default genAI;
