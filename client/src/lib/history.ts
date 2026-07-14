export interface HistoryOperation {
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
}

export function applyHistoryOperation(content: string, op: HistoryOperation): string {
  if (op.type === 'insert' && op.content) {
    return content.slice(0, op.position) + op.content + content.slice(op.position);
  }

  if (op.type === 'delete' && op.length) {
    return content.slice(0, op.position) + content.slice(op.position + op.length);
  }

  return content;
}
