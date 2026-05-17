-- Originium core Graph Wiki schema.
-- The graph database is canonical; projections are derived from these records.

DEFINE TABLE OVERWRITE source_document SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON source_document TYPE string;
DEFINE FIELD IF NOT EXISTS kind ON source_document TYPE string ASSERT $value IN ["pdf", "web"];
DEFINE FIELD IF NOT EXISTS file ON TABLE source_document TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS sha256 ON source_document TYPE string;
DEFINE FIELD IF NOT EXISTS mime_type ON source_document TYPE string;
DEFINE FIELD IF NOT EXISTS page_count ON source_document TYPE option<int>;
DEFINE FIELD IF NOT EXISTS source_uri ON source_document TYPE option<string>;
DEFINE FIELD IF NOT EXISTS extraction_status ON source_document TYPE string DEFAULT "imported";
DEFINE FIELD IF NOT EXISTS created_at ON source_document TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON source_document TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS source_document_sha256 ON source_document FIELDS sha256 UNIQUE;

DEFINE ANALYZER IF NOT EXISTS originium_text TOKENIZERS blank, class FILTERS lowercase, ascii;

DEFINE TABLE OVERWRITE source_heading SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS source_document ON source_heading TYPE record<source_document>;
DEFINE FIELD IF NOT EXISTS title ON source_heading TYPE string;
DEFINE FIELD IF NOT EXISTS heading_path ON source_heading TYPE array<string>;
DEFINE FIELD IF NOT EXISTS level ON source_heading TYPE int;
DEFINE FIELD IF NOT EXISTS start_page ON source_heading TYPE int;
DEFINE FIELD IF NOT EXISTS end_page ON source_heading TYPE option<int>;
DEFINE FIELD IF NOT EXISTS order ON source_heading TYPE int;
DEFINE FIELD IF NOT EXISTS destination ON TABLE source_heading TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS extraction_method ON source_heading TYPE string;
DEFINE INDEX IF NOT EXISTS source_heading_document_order ON source_heading FIELDS source_document, order UNIQUE;

DEFINE TABLE OVERWRITE source_text_projection SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS source_document ON source_text_projection TYPE record<source_document>;
DEFINE FIELD IF NOT EXISTS source_heading ON source_text_projection TYPE record<source_heading>;
DEFINE FIELD IF NOT EXISTS start_page ON source_text_projection TYPE int;
DEFINE FIELD IF NOT EXISTS end_page ON source_text_projection TYPE int;
DEFINE FIELD IF NOT EXISTS text ON source_text_projection TYPE string;
DEFINE FIELD IF NOT EXISTS text_hash ON source_text_projection TYPE string;
DEFINE FIELD IF NOT EXISTS extraction_method ON source_text_projection TYPE string;
DEFINE FIELD IF NOT EXISTS extraction_version ON source_text_projection TYPE string;
DEFINE FIELD IF NOT EXISTS projection_status ON source_text_projection TYPE string ASSERT $value IN ["ready", "failed", "stale"];
DEFINE FIELD IF NOT EXISTS embedding ON source_text_projection TYPE option<array<float>>;
DEFINE FIELD IF NOT EXISTS embedding_provider ON source_text_projection TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedding_model ON source_text_projection TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedding_dimensions ON source_text_projection TYPE option<int>;
DEFINE FIELD IF NOT EXISTS embedded_text_hash ON source_text_projection TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedded_at ON source_text_projection TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at ON source_text_projection TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON source_text_projection TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS source_text_projection_heading ON source_text_projection FIELDS source_heading UNIQUE;
DEFINE INDEX IF NOT EXISTS source_text_projection_text ON TABLE source_text_projection FIELDS text FULLTEXT ANALYZER originium_text BM25;
DEFINE INDEX IF NOT EXISTS source_text_projection_embedding ON TABLE source_text_projection FIELDS embedding HNSW DIMENSION 768 DIST COSINE;

DEFINE TABLE OVERWRITE wiki_page SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON wiki_page TYPE string;
DEFINE FIELD IF NOT EXISTS slug ON wiki_page TYPE string;
DEFINE FIELD IF NOT EXISTS body ON wiki_page TYPE string;
DEFINE FIELD IF NOT EXISTS aliases ON wiki_page TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS scope_note ON wiki_page TYPE option<string>;
DEFINE FIELD IF NOT EXISTS page_kind ON wiki_page TYPE option<string> ASSERT $value = NONE OR $value IN ["concept", "workflow", "evidence", "decision", "question"];
DEFINE FIELD IF NOT EXISTS embedding ON wiki_page TYPE option<array<float>>;
DEFINE FIELD IF NOT EXISTS embedding_provider ON wiki_page TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedding_model ON wiki_page TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedding_dimensions ON wiki_page TYPE option<int>;
DEFINE FIELD IF NOT EXISTS embedded_text_hash ON wiki_page TYPE option<string>;
DEFINE FIELD IF NOT EXISTS embedded_at ON wiki_page TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at ON wiki_page TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON wiki_page TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS wiki_page_slug ON wiki_page FIELDS slug UNIQUE;
DEFINE INDEX IF NOT EXISTS wiki_page_title_text ON TABLE wiki_page FIELDS title FULLTEXT ANALYZER originium_text BM25;
DEFINE INDEX IF NOT EXISTS wiki_page_body_text ON TABLE wiki_page FIELDS body FULLTEXT ANALYZER originium_text BM25;
DEFINE INDEX IF NOT EXISTS wiki_page_aliases ON wiki_page FIELDS aliases;
DEFINE INDEX IF NOT EXISTS wiki_page_embedding ON TABLE wiki_page FIELDS embedding HNSW DIMENSION 768 DIST COSINE;

DEFINE TABLE OVERWRITE agent_session SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS purpose ON agent_session TYPE string;
DEFINE FIELD IF NOT EXISTS workspace_key ON agent_session TYPE option<string>;
DEFINE FIELD IF NOT EXISTS codex_thread_id ON agent_session TYPE option<string>;
DEFINE FIELD IF NOT EXISTS codex_model ON agent_session TYPE option<string>;
DEFINE FIELD IF NOT EXISTS codex_model_provider ON agent_session TYPE option<string>;
DEFINE FIELD IF NOT EXISTS codex_cwd ON agent_session TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at ON agent_session TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON agent_session TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS agent_session_workspace_key ON agent_session FIELDS workspace_key;

DEFINE TABLE OVERWRITE source_anchor SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS title ON source_anchor TYPE string;
DEFINE FIELD IF NOT EXISTS source_document ON source_anchor TYPE record<source_document>;
DEFINE FIELD IF NOT EXISTS source_heading ON source_anchor TYPE record<source_heading>;
DEFINE FIELD IF NOT EXISTS start_page ON source_anchor TYPE option<int>;
DEFINE FIELD IF NOT EXISTS end_page ON source_anchor TYPE option<int>;
DEFINE FIELD IF NOT EXISTS location_hint ON source_anchor TYPE option<string>;
DEFINE FIELD IF NOT EXISTS reason ON source_anchor TYPE string;
DEFINE FIELD IF NOT EXISTS created_session ON source_anchor TYPE option<record<agent_session>>;
DEFINE FIELD IF NOT EXISTS created_at ON source_anchor TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at ON source_anchor TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE change_log SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS agent_session ON change_log TYPE option<record<agent_session>>;
DEFINE FIELD IF NOT EXISTS command ON change_log TYPE string;
DEFINE FIELD IF NOT EXISTS operation ON change_log TYPE string;
DEFINE FIELD IF NOT EXISTS target ON change_log TYPE string;
DEFINE FIELD IF NOT EXISTS target_records ON change_log TYPE array<string>;
DEFINE FIELD IF NOT EXISTS summary ON change_log TYPE string;
DEFINE FIELD IF NOT EXISTS before ON TABLE change_log TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS after ON TABLE change_log TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS created_at ON change_log TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE agent_activity SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS agent_session ON agent_activity TYPE record<agent_session>;
DEFINE FIELD IF NOT EXISTS source ON agent_activity TYPE string ASSERT $value IN ["codex_app_server", "cli", "web"];
DEFINE FIELD IF NOT EXISTS kind ON agent_activity TYPE string ASSERT $value IN ["message", "command", "tool", "file_change", "graph_mutation", "status", "error"];
DEFINE FIELD IF NOT EXISTS status ON agent_activity TYPE string ASSERT $value IN ["started", "streaming", "completed", "failed"];
DEFINE FIELD IF NOT EXISTS summary ON agent_activity TYPE string;
DEFINE FIELD IF NOT EXISTS operation ON agent_activity TYPE option<string>;
DEFINE FIELD IF NOT EXISTS target_records ON agent_activity TYPE array<string>;
DEFINE FIELD IF NOT EXISTS metadata ON TABLE agent_activity TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS created_at ON agent_activity TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS agent_activity_session_created_at ON agent_activity FIELDS agent_session, created_at;

DEFINE TABLE OVERWRITE cites TYPE RELATION IN wiki_page OUT source_heading SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS key ON cites TYPE string;
DEFINE FIELD IF NOT EXISTS label ON cites TYPE string;
DEFINE FIELD IF NOT EXISTS quote ON cites TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at ON cites TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS cites_page_key ON cites FIELDS in, key UNIQUE;

DEFINE TABLE OVERWRITE manual_link TYPE RELATION SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS reason ON manual_link TYPE string;
DEFINE FIELD IF NOT EXISTS label ON manual_link TYPE string ASSERT $value IN ["depends on", "constrains", "implements", "uses", "applies to", "contrasts with", "supersedes", "related evidence"];
DEFINE FIELD IF NOT EXISTS created_session ON manual_link TYPE option<record<agent_session>>;
DEFINE FIELD IF NOT EXISTS created_at ON manual_link TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE edited_in TYPE RELATION SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS created_at ON edited_in TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE ingestion_chunk SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS source_document ON ingestion_chunk TYPE record<source_document>;
DEFINE FIELD IF NOT EXISTS source_heading ON ingestion_chunk TYPE record<source_heading>;
DEFINE FIELD IF NOT EXISTS start_page ON ingestion_chunk TYPE int;
DEFINE FIELD IF NOT EXISTS end_page ON ingestion_chunk TYPE int;
DEFINE FIELD IF NOT EXISTS token_estimate ON ingestion_chunk TYPE int;
DEFINE FIELD IF NOT EXISTS extraction_method ON ingestion_chunk TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON ingestion_chunk TYPE datetime DEFAULT time::now();
