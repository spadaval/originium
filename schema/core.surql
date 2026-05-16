-- Originium core Graph Wiki schema.
-- The graph database is canonical; projections are derived from these records.

DEFINE TABLE source_document SCHEMAFULL;
DEFINE FIELD title ON source_document TYPE string;
DEFINE FIELD kind ON source_document TYPE string ASSERT $value IN ["pdf", "web"];
DEFINE FIELD file ON source_document TYPE option<object> FLEXIBLE;
DEFINE FIELD sha256 ON source_document TYPE string;
DEFINE FIELD mime_type ON source_document TYPE string;
DEFINE FIELD page_count ON source_document TYPE option<int>;
DEFINE FIELD source_uri ON source_document TYPE option<string>;
DEFINE FIELD extraction_status ON source_document TYPE string DEFAULT "imported";
DEFINE FIELD created_at ON source_document TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON source_document TYPE datetime DEFAULT time::now();
DEFINE INDEX source_document_sha256 ON source_document FIELDS sha256 UNIQUE;

DEFINE TABLE source_heading SCHEMAFULL;
DEFINE FIELD source_document ON source_heading TYPE record<source_document>;
DEFINE FIELD title ON source_heading TYPE string;
DEFINE FIELD heading_path ON source_heading TYPE array<string>;
DEFINE FIELD level ON source_heading TYPE int;
DEFINE FIELD start_page ON source_heading TYPE int;
DEFINE FIELD end_page ON source_heading TYPE option<int>;
DEFINE FIELD order ON source_heading TYPE int;
DEFINE FIELD destination ON source_heading TYPE option<object> FLEXIBLE;
DEFINE FIELD extraction_method ON source_heading TYPE string;
DEFINE INDEX source_heading_document_order ON source_heading FIELDS source_document, order UNIQUE;

DEFINE TABLE wiki_page SCHEMAFULL;
DEFINE FIELD title ON wiki_page TYPE string;
DEFINE FIELD slug ON wiki_page TYPE string;
DEFINE FIELD body ON wiki_page TYPE string;
DEFINE FIELD created_at ON wiki_page TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON wiki_page TYPE datetime DEFAULT time::now();
DEFINE INDEX wiki_page_slug ON wiki_page FIELDS slug UNIQUE;

DEFINE TABLE agent_session SCHEMAFULL;
DEFINE FIELD purpose ON agent_session TYPE string;
DEFINE FIELD created_at ON agent_session TYPE datetime DEFAULT time::now();

DEFINE TABLE change_log SCHEMAFULL;
DEFINE FIELD agent_session ON change_log TYPE option<record<agent_session>>;
DEFINE FIELD operation ON change_log TYPE string;
DEFINE FIELD target ON change_log TYPE string;
DEFINE FIELD summary ON change_log TYPE string;
DEFINE FIELD before ON change_log TYPE option<object> FLEXIBLE;
DEFINE FIELD after ON change_log TYPE option<object> FLEXIBLE;
DEFINE FIELD created_at ON change_log TYPE datetime DEFAULT time::now();

DEFINE TABLE cites TYPE RELATION IN wiki_page OUT source_heading SCHEMAFULL;
DEFINE FIELD key ON cites TYPE string;
DEFINE FIELD label ON cites TYPE string;
DEFINE FIELD quote ON cites TYPE option<string>;
DEFINE FIELD created_at ON cites TYPE datetime DEFAULT time::now();
DEFINE INDEX cites_page_key ON cites FIELDS in, key UNIQUE;

DEFINE TABLE manual_link TYPE RELATION SCHEMAFULL;
DEFINE FIELD reason ON manual_link TYPE string;
DEFINE FIELD label ON manual_link TYPE option<string>;
DEFINE FIELD created_session ON manual_link TYPE option<record<agent_session>>;
DEFINE FIELD created_at ON manual_link TYPE datetime DEFAULT time::now();

DEFINE TABLE edited_in TYPE RELATION SCHEMAFULL;
DEFINE FIELD created_at ON edited_in TYPE datetime DEFAULT time::now();

DEFINE TABLE ingestion_chunk SCHEMAFULL;
DEFINE FIELD source_document ON ingestion_chunk TYPE record<source_document>;
DEFINE FIELD source_heading ON ingestion_chunk TYPE record<source_heading>;
DEFINE FIELD start_page ON ingestion_chunk TYPE int;
DEFINE FIELD end_page ON ingestion_chunk TYPE int;
DEFINE FIELD token_estimate ON ingestion_chunk TYPE int;
DEFINE FIELD extraction_method ON ingestion_chunk TYPE string;
DEFINE FIELD created_at ON ingestion_chunk TYPE datetime DEFAULT time::now();
