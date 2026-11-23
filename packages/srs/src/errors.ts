/** A refusal the model can correct. `code` is the token in the tool contract. */
export class GraphError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.name = "GraphError";
  }
}
