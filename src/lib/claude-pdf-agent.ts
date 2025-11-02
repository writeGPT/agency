import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

/**
 * Fast PDF reading using Claude's standard document API (no agent skills)
 * This is much faster than agent skills but may have slightly less accuracy
 */
export async function readPdfWithClaudeFast(file: File): Promise<{
  content: string;
  metadata?: {
    pageCount?: number;
    hasImages?: boolean;
    hasTables?: boolean;
    summary?: string;
  };
  error?: string;
}> {
  const fileName = file.name;
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 120000, // 2 minutes timeout
    });

    // Convert File to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString("base64");

    console.log(`📄 Reading PDF (Fast Mode): ${fileName}`);
    console.log(`📊 File size: ${file.size} bytes`);

    // Use standard messages API with document support (stable, no beta)
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            },
            {
              type: "text",
              text: "Extract all text content from this PDF. Include tables in a readable format.",
            },
          ],
        },
      ],
    });

    console.log(`✅ Fast PDF parsing completed for ${fileName}`);

    // Log token usage
    if (response.usage) {
      console.log(
        `\n📊 Token Usage for PDF Parsing (Fast Mode - ${fileName}):`
      );
      console.log(
        `   📥 Input tokens: ${response.usage.input_tokens.toLocaleString()}`
      );
      console.log(
        `   📤 Output tokens: ${response.usage.output_tokens.toLocaleString()}`
      );
      console.log(
        `   💰 Total tokens: ${(
          response.usage.input_tokens + response.usage.output_tokens
        ).toLocaleString()}`
      );
    }

    // Extract text content
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude API");
    }

    const content = textContent.text;

    const metadata = {
      hasImages:
        content.toLowerCase().includes("image") ||
        content.toLowerCase().includes("chart") ||
        content.toLowerCase().includes("figure"),
      hasTables:
        content.toLowerCase().includes("table") ||
        content.toLowerCase().includes("column"),
      summary: content.substring(0, 200) + "...",
    };

    return {
      content,
      metadata,
    };
  } catch (error) {
    console.error(`❌ Error reading PDF (Fast Mode - ${fileName}):`, error);
    return {
      content: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Read and extract content from a PDF file using Claude's PDF Agent Skill
 *
 * This function uses Claude's Extended Thinking mode with the PDF agent skill
 * to intelligently parse and extract content from PDF documents.
 *
 * The PDF skill allows Claude to:
 * - Extract text from PDFs with high accuracy
 * - Parse tables and structured data
 * - Understand document layout and formatting
 * - Handle multi-page documents
 *
 * @param file - File object from form upload
 * @returns Extracted text content and metadata from the PDF
 */
export async function readPdfWithAgentSkill(file: File): Promise<{
  content: string;
  metadata?: {
    pageCount?: number;
    hasImages?: boolean;
    hasTables?: boolean;
    summary?: string;
  };
  error?: string;
}> {
  const fileName = file.name; // Store for logging
  try {
    // Initialize Anthropic client with extended timeout for agent skills
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 300000, // 5 minutes timeout for PDF processing
    });

    // Convert File to ArrayBuffer then to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString("base64");

    console.log(`📄 Reading PDF with Agent Skill: ${fileName}`);
    console.log(`📊 File size: ${file.size} bytes`);

    // Call Claude API with PDF skill using beta features
    // Note: Using 'as any' for container and tools due to SDK version limitations
    const response = await anthropic.beta.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 38000,
      betas: [
        "code-execution-2025-08-25",
        "skills-2025-10-02",
        "files-api-2025-04-14",
      ] as any,
      container: {
        skills: [
          {
            type: "anthropic",
            skill_id: "pdf",
            version: "latest",
          },
        ],
      } as any,
      tools: [
        {
          type: "code_execution_20250825",
          name: "code_execution",
        },
      ] as any,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            } as any,
            {
              type: "text",
              text: `Extract all text content from this PDF document. Include any tables you find in a readable format. Keep the output concise and structured.`,
            },
          ],
        },
      ],
    } as any);

    console.log(`✅ Claude response received`);
    console.log(
      `🧠 Thinking blocks: ${
        response.content.filter((b) => b.type === "thinking").length
      }`
    );
    console.log(
      `💬 Text blocks: ${
        response.content.filter((b) => b.type === "text").length
      }`
    );

    // Log token usage for PDF parsing
    if (response.usage) {
      console.log(`\n📊 Token Usage for PDF Parsing:`);
      console.log(
        `   📥 Input tokens: ${response.usage.input_tokens.toLocaleString()}`
      );
      console.log(
        `   📤 Output tokens: ${response.usage.output_tokens.toLocaleString()}`
      );
      console.log(
        `   💰 Total tokens: ${(
          response.usage.input_tokens + response.usage.output_tokens
        ).toLocaleString()}`
      );
    }

    // Extract text content (skip thinking blocks)
    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );

    if (textBlocks.length === 0) {
      throw new Error("No text response from Claude API");
    }

    // Combine all text blocks
    const fullContent = textBlocks
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n\n");

    // Extract basic metadata from the response
    const metadata = {
      hasImages:
        fullContent.toLowerCase().includes("image") ||
        fullContent.toLowerCase().includes("chart") ||
        fullContent.toLowerCase().includes("figure"),
      hasTables:
        fullContent.toLowerCase().includes("table") ||
        fullContent.toLowerCase().includes("column"),
      summary: fullContent.substring(0, 200) + "...",
    };

    return {
      content: fullContent,
      metadata,
    };
  } catch (error) {
    console.error("❌ Error reading PDF with Claude Agent Skill:", error);
    return {
      content: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Read PDF from file path using Claude's PDF Agent Skill
 *
 * @param filePath - Path to the PDF file on disk
 * @returns Extracted text content and metadata from the PDF
 */
export async function readPdfFromPathWithAgentSkill(filePath: string): Promise<{
  content: string;
  metadata?: {
    pageCount?: number;
    hasImages?: boolean;
    hasTables?: boolean;
    summary?: string;
  };
  error?: string;
}> {
  try {
    // Initialize Anthropic client with extended timeout for agent skills
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      timeout: 300000, // 5 minutes timeout for PDF processing
    });

    // Read the PDF file as base64
    const pdfBuffer = fs.readFileSync(filePath);
    const base64Pdf = pdfBuffer.toString("base64");
    const fileName = filePath.split("/").pop() || "document.pdf";

    console.log(`📄 Reading PDF with Agent Skill: ${fileName}`);
    console.log(`📊 File size: ${pdfBuffer.length} bytes`);

    // Call Claude API with PDF skill using beta features
    // Note: Using 'as any' for container and tools due to SDK version limitations
    const response = await anthropic.beta.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      betas: [
        "code-execution-2025-08-25",
        "skills-2025-10-02",
        "files-api-2025-04-14",
      ] as any,
      container: {
        skills: [
          {
            type: "anthropic",
            skill_id: "pdf",
            version: "latest",
          },
        ],
      } as any,
      tools: [
        {
          type: "code_execution_20250825",
          name: "code_execution",
        },
      ] as any,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Pdf,
              },
            } as any,
            {
              type: "text",
              text: `Extract all text content from this PDF document. Include any tables you find in a readable format. Keep the output concise and structured.`,
            },
          ],
        },
      ],
    } as any);

    console.log(`✅ Claude response received`);
    console.log(
      `🧠 Thinking blocks: ${
        response.content.filter((b) => b.type === "thinking").length
      }`
    );
    console.log(
      `💬 Text blocks: ${
        response.content.filter((b) => b.type === "text").length
      }`
    );

    // Log token usage for PDF parsing
    if (response.usage) {
      console.log(`\n📊 Token Usage for PDF Parsing:`);
      console.log(
        `   📥 Input tokens: ${response.usage.input_tokens.toLocaleString()}`
      );
      console.log(
        `   📤 Output tokens: ${response.usage.output_tokens.toLocaleString()}`
      );
      console.log(
        `   💰 Total tokens: ${(
          response.usage.input_tokens + response.usage.output_tokens
        ).toLocaleString()}`
      );
    }

    // Extract text content (skip thinking blocks)
    const textBlocks = response.content.filter(
      (block) => block.type === "text"
    );

    if (textBlocks.length === 0) {
      throw new Error("No text response from Claude API");
    }

    // Combine all text blocks
    const fullContent = textBlocks
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n\n");

    // Extract basic metadata from the response
    const metadata = {
      hasImages:
        fullContent.toLowerCase().includes("image") ||
        fullContent.toLowerCase().includes("chart") ||
        fullContent.toLowerCase().includes("figure"),
      hasTables:
        fullContent.toLowerCase().includes("table") ||
        fullContent.toLowerCase().includes("column"),
      summary: fullContent.substring(0, 200) + "...",
    };

    return {
      content: fullContent,
      metadata,
    };
  } catch (error) {
    console.error("❌ Error reading PDF with Claude Agent Skill:", error);
    return {
      content: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
