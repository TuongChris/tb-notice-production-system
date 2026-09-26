// The prompt template identifier (P4E design decision). No accepted template or template version
// existed before P4E; this is the first one.
//
// It names the renderer in prompt-renderer.ts exactly as written: its header, its five parts and
// their wording, the task and mode instructions, the quoting of the recorded gaps and conflicts, and
// the case-data block (the context's semantic content as sorted-key JSON between two marker lines
// carrying the SHA-256 of that JSON). It is an implementation identifier: not a wire-contract
// release (TB-SCHEMA-API stays as it is), not a Production Form Contract version (PFC-YT-EMAIL-v1.1
// stays as it is), and no policy, legal or platform review or approval. The template contains no
// legal declaration text. Any change to the rendered structure or meaning needs a new identifier;
// the renderer's unit test pins the rendered bytes of fixed inputs to this one.

export const PROMPT_TEMPLATE_VERSION = 'TB-PROMPT-TEMPLATE-v1';
