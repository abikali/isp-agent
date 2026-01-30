-- Add tsvector column for full-text search (BM25-style retrieval)
ALTER TABLE "chatbot_document" ADD COLUMN "searchVector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX "chatbot_document_search_vector_idx" ON "chatbot_document" USING GIN ("searchVector");

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_chatbot_document_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW."searchVector" := setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                          setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search vector on insert/update
CREATE TRIGGER chatbot_document_search_vector_trigger
    BEFORE INSERT OR UPDATE OF content, title ON "chatbot_document"
    FOR EACH ROW
    EXECUTE FUNCTION update_chatbot_document_search_vector();

-- Backfill existing documents with search vectors
UPDATE "chatbot_document"
SET "searchVector" = setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
                     setweight(to_tsvector('english', COALESCE(content, '')), 'B')
WHERE "searchVector" IS NULL;
