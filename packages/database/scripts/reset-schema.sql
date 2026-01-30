-- Reset database schema for fresh migration
-- This drops all tables and recreates the public schema

-- Drop all tables by dropping and recreating the schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Restore default grants
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

