export interface DialogueContext {
  participants: { id: string; name: string; role: string }[];
  situation: string;
  history: string[];
}
export type DialogueGenerator = (context: DialogueContext) => Promise<string[] | null>;

/** Short alternating turns that fit the in-world speech bubbles. */
export function dialogueLines(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return null;
  if (!value.every(line => typeof line === 'string' && line.trim().length > 0 && line.length <= 60 && !/[\r\n\x00-\x1f]/.test(line))) return null;
  return value.map(line => (line as string).trim());
}
