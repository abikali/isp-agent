-- Restore the pgvector IVFFlat index that was accidentally dropped
-- in migration 20260113190514_add_org_ai_allowed_models
--
-- This index is critical for efficient vector similarity searches.
-- Without it, every chat message causes a full table scan O(n).
-- With it, searches use approximate nearest neighbor O(log n).

CREATE INDEX IF NOT EXISTS "chatbot_document_embedding_idx"
ON "chatbot_document"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
