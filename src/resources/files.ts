import type { HttpClient } from '../http.js';

/**
 * File → text, nothing stored. Mirrors POST /v1/files/parse (see openapi.yaml).
 * Images and scanned PDF pages are transcribed through the workspace's model
 * routing on paid plans. Workflow runs can take files directly instead — see
 * WorkflowAttachment.
 */
export interface ParseFileInput {
  fileName: string;
  /** Base64-encoded file content (a data: URL is accepted). Max 15 MB decoded. */
  fileBase64: string;
}

export type ParsedFileFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'pptx' | 'text' | 'json' | 'image';

export interface ParsedFile {
  file_name: string;
  format: ParsedFileFormat;
  /** PDF pages or PPTX slides read. */
  pages?: number;
  text: string;
  warnings: string[];
  /** Pages (or 1 for an image) read by AI transcription. */
  transcribed_pages?: number[];
  /** Scanned pages whose text is missing. */
  textless_pages?: number[];
}

export class FilesResource {
  constructor(private readonly http: HttpClient) {}

  async parse(input: ParseFileInput): Promise<ParsedFile> {
    return this.http.post<ParsedFile>('/v1/files/parse', { file_name: input.fileName, file_base64: input.fileBase64 });
  }
}
