/**
 * Content chunking utilities for RAG
 * Semantic-aware splitting for better retrieval quality
 *
 * 2025 Best Practices:
 * - Token-based sizing (~400 tokens per chunk for better semantic cohesion)
 * - Preserve sentence/paragraph boundaries
 * - Include heading context for hierarchical understanding
 * - Keep useful content (links with URLs, short code snippets)
 */
import { logger } from "@repo/logs";

// ============================================================================
// Types
// ============================================================================

/**
 * Content type detected from markdown structure
 */
export type ContentType = "prose" | "list" | "table" | "faq" | "code" | "mixed";

/**
 * Enhanced chunk with metadata for better RAG retrieval
 */
export interface DocumentChunk {
	content: string;
	title: string | null;
	sourceUrl: string;
	chunkIndex: number;
	// Enhanced metadata
	headingPath: string[];
	contentType: ContentType;
	estimatedTokens: number;
}

/**
 * Configuration for chunking behavior
 */
export interface ChunkingConfig {
	/** Target chunk size in tokens (default: 400) */
	targetTokens?: number;
	/** Overlap percentage (default: 15%) */
	overlapPercent?: number;
	/** Respect sentence boundaries (default: true) */
	respectBoundaries?: boolean;
	/** Maximum chunks per document (default: 100) */
	maxChunks?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TARGET_TOKENS = 400;
const DEFAULT_OVERLAP_PERCENT = 15;
const MAX_CHUNKS_PER_DOCUMENT = 100;
const CHARS_PER_TOKEN = 4; // Approximate for English text

// ============================================================================
// Content Type Detection
// ============================================================================

/**
 * Detect the primary content type of text
 */
function detectContentType(text: string): ContentType {
	const lines = text.split("\n").filter((l) => l.trim());

	// Check for code blocks
	if (text.includes("```") || text.includes("    ")) {
		const codeBlockCount = (text.match(/```/g) || []).length / 2;
		if (codeBlockCount >= 2) {
			return "code";
		}
	}

	// Check for FAQ patterns (Q: A: or Question/Answer patterns)
	if (
		/\b(Q:|A:|Question:|Answer:|FAQ)/i.test(text) ||
		/\?[\s\n]+[A-Z]/.test(text)
	) {
		return "faq";
	}

	// Check for table (markdown tables with |)
	const tableRowCount = (text.match(/\|.*\|/g) || []).length;
	if (tableRowCount >= 3) {
		return "table";
	}

	// Check for list (lines starting with -, *, or numbers)
	const listLines = lines.filter((l) => /^[\s]*[-*•]|\d+[.)]\s/.test(l));
	if (listLines.length > lines.length * 0.5) {
		return "list";
	}

	// Check for mixed content
	const hasHeadings = /^#{1,6}\s/.test(text);
	if (hasHeadings && (listLines.length > 0 || tableRowCount > 0)) {
		return "mixed";
	}

	return "prose";
}

/**
 * Estimate token count from text
 * Uses character count / 4 as approximation for English
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ============================================================================
// Heading Path Extraction
// ============================================================================

/**
 * Extract heading hierarchy from markdown
 * Returns array of headings leading to current position
 */
function extractHeadingPath(content: string, position: number): string[] {
	const headingStack: { level: number; text: string }[] = [];

	// Find all headings before the position using matchAll
	const headingRegex = /^(#{1,6})\s+(.+)$/gm;
	const matches = content.matchAll(headingRegex);

	for (const match of matches) {
		const matchIndex = match.index ?? 0;
		if (matchIndex >= position) {
			break;
		}

		const hashPart = match[1];
		const textPart = match[2];
		if (!hashPart || !textPart) {
			continue;
		}

		const level = hashPart.length;
		const text = textPart.trim();

		// Pop headings of same or higher level
		while (headingStack.length > 0) {
			const last = headingStack[headingStack.length - 1];
			if (!last || last.level < level) {
				break;
			}
			headingStack.pop();
		}

		headingStack.push({ level, text });
	}

	return headingStack.map((h) => h.text);
}

// ============================================================================
// Markdown Cleaning
// ============================================================================

/**
 * Clean markdown while preserving useful context
 * Unlike old approach, we keep:
 * - Links with their URLs (for citation)
 * - Short code snippets (< 200 chars)
 * - Heading structure
 */
function cleanMarkdown(content: string): string {
	return (
		content
			// Remove large code blocks (> 500 chars) but keep small ones
			.replace(/```[\s\S]{500,}?```/g, "[code block removed]")
			// Keep small code blocks but remove the fence markers
			.replace(/```(\w*)\n([\s\S]{0,500}?)```/g, (_, lang, code) => {
				const trimmed = code.trim();
				return trimmed
					? `[Code${lang ? ` (${lang})` : ""}]: ${trimmed}`
					: "";
			})
			// Remove inline code backticks but keep content
			.replace(/`([^`]+)`/g, "$1")
			// Remove image syntax but keep alt text
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) =>
				alt ? `[Image: ${alt}]` : "",
			)
			// Convert links to "text (url)" format for citation
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
			// Remove HTML tags
			.replace(/<[^>]+>/g, "")
			// Normalize whitespace but keep paragraph breaks
			.replace(/\n{3,}/g, "\n\n")
			.replace(/ {2,}/g, " ")
			// Remove horizontal rules
			.replace(/^[-*_]{3,}$/gm, "")
			.trim()
	);
}

// ============================================================================
// Semantic Chunking
// ============================================================================

/**
 * Find the best split point near a position
 * Prefers: paragraph breaks > sentence ends > clause breaks > word breaks
 */
function findBestSplitPoint(
	text: string,
	targetPos: number,
	searchRange = 200,
): number {
	const start = Math.max(0, targetPos - searchRange);
	const end = Math.min(text.length, targetPos + searchRange);
	const searchText = text.slice(start, end);

	// Priority 1: Paragraph break (double newline)
	const paragraphMatch = searchText.match(/\n\n/);
	if (paragraphMatch?.index !== undefined) {
		const absPos = start + paragraphMatch.index + 2;
		if (Math.abs(absPos - targetPos) <= searchRange) {
			return absPos;
		}
	}

	// Priority 2: Sentence end (. ! ? followed by space or newline)
	const sentenceMatches = [...searchText.matchAll(/[.!?]\s/g)];
	if (sentenceMatches.length > 0) {
		// Find the sentence end closest to target
		let bestMatch = sentenceMatches[0];
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const match of sentenceMatches) {
			if (match.index !== undefined) {
				const absPos = start + match.index + 1;
				const distance = Math.abs(absPos - targetPos);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestMatch = match;
				}
			}
		}
		if (bestMatch?.index !== undefined) {
			return start + bestMatch.index + 1;
		}
	}

	// Priority 3: List item or heading boundary
	const listMatch = searchText.match(/\n[-*•]|\n\d+[.)]/);
	if (listMatch?.index !== undefined) {
		return start + listMatch.index;
	}

	// Priority 4: Any newline
	const newlineMatch = searchText.match(/\n/);
	if (newlineMatch?.index !== undefined) {
		return start + newlineMatch.index;
	}

	// Fallback: word boundary near target
	const spaceMatch = searchText.match(/ /);
	if (spaceMatch?.index !== undefined) {
		return start + spaceMatch.index + 1;
	}

	// Last resort: use target position
	return targetPos;
}

/**
 * Chunk with position information (used internally)
 */
interface ChunkWithPosition {
	text: string;
	startPosition: number;
	endPosition: number;
}

/**
 * Split text into semantic chunks with overlap
 * Respects sentence and paragraph boundaries
 */
export function chunkText(text: string, options?: ChunkingConfig): string[] {
	return chunkTextWithPositions(text, options).map((c) => c.text);
}

/**
 * Split text into semantic chunks with overlap, returning position information
 * Respects sentence and paragraph boundaries
 */
export function chunkTextWithPositions(
	text: string,
	options?: ChunkingConfig,
): ChunkWithPosition[] {
	const targetTokens = options?.targetTokens ?? DEFAULT_TARGET_TOKENS;
	const overlapPercent = options?.overlapPercent ?? DEFAULT_OVERLAP_PERCENT;
	const maxChunks = options?.maxChunks ?? MAX_CHUNKS_PER_DOCUMENT;
	const respectBoundaries = options?.respectBoundaries ?? true;

	const chunkSize = targetTokens * CHARS_PER_TOKEN;
	const overlap = Math.floor(chunkSize * (overlapPercent / 100));

	// Small document optimization
	if (text.length <= chunkSize) {
		const trimmed = text.trim();
		if (trimmed.length === 0) {
			return [];
		}
		// Find actual start position after trim
		const startPos = text.indexOf(trimmed.charAt(0));
		return [
			{
				text: trimmed,
				startPosition: startPos,
				endPosition: text.length,
			},
		];
	}

	const chunks: ChunkWithPosition[] = [];
	let position = 0;

	while (position < text.length && chunks.length < maxChunks) {
		const endTarget = position + chunkSize;

		// Find the actual end position respecting boundaries
		let end: number;
		if (respectBoundaries && endTarget < text.length) {
			end = findBestSplitPoint(text, endTarget, 200);
		} else {
			end = Math.min(endTarget, text.length);
		}

		// Extract chunk
		const rawChunk = text.slice(position, end);
		const chunk = rawChunk.trim();
		if (chunk.length > 0) {
			// Calculate actual start position accounting for trimmed whitespace
			const leadingWs = rawChunk.length - rawChunk.trimStart().length;
			chunks.push({
				text: chunk,
				startPosition: position + leadingWs,
				endPosition: end,
			});
		}

		// Move to next position with overlap
		const nextPosition = end - overlap;

		// Prevent infinite loop
		if (nextPosition <= position) {
			position = end;
		} else {
			position = nextPosition;
		}
	}

	if (chunks.length >= maxChunks && position < text.length) {
		logger.warn("Document truncated: exceeded max chunk limit", {
			maxChunks,
			totalLength: text.length,
			processedLength: position,
		});
	}

	return chunks;
}

/**
 * Chunk a document with enhanced metadata
 * Returns DocumentChunk objects with heading paths and content types
 */
export function chunkDocument(
	content: string,
	metadata: {
		title: string | null;
		sourceUrl: string;
	},
	options?: ChunkingConfig,
): DocumentChunk[] {
	// Clean while preserving structure
	const cleanedContent = cleanMarkdown(content);

	// Split into chunks with position information (avoids indexOf for duplicates)
	const chunksWithPositions = chunkTextWithPositions(cleanedContent, options);

	return chunksWithPositions.map((chunk, index) => {
		// Use the accurate position from chunking instead of indexOf
		const chunkPosition = chunk.startPosition;

		// Extract heading path for this chunk
		const headingPath = extractHeadingPath(cleanedContent, chunkPosition);

		// Detect content type
		const contentType = detectContentType(chunk.text);

		// Estimate tokens
		const estimatedTokens = estimateTokens(chunk.text);

		// Prepend heading context if available (improves retrieval)
		let enhancedContent = chunk.text;
		if (headingPath.length > 0 && !chunk.text.startsWith("#")) {
			const headingContext = headingPath.join(" > ");
			enhancedContent = `[Section: ${headingContext}]\n\n${chunk.text}`;
		}

		return {
			content: enhancedContent,
			title: metadata.title,
			sourceUrl: metadata.sourceUrl,
			chunkIndex: index,
			headingPath,
			contentType,
			estimatedTokens,
		};
	});
}
