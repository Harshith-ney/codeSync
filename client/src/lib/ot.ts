export interface Operation {
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
  revision: number;
  userId: string;
  roomId: string;
}

export function applyOperation(content: string, op: Pick<Operation, 'type' | 'position' | 'content' | 'length'>): string {
  if (op.type === 'insert' && op.content) {
    return content.slice(0, op.position) + op.content + content.slice(op.position);
  }

  if (op.type === 'delete' && op.length) {
    return content.slice(0, op.position) + content.slice(op.position + op.length);
  }

  return content;
}

export function transform(op: Operation, appliedOp: Operation): Operation {
  if (op.type === 'insert' && appliedOp.type === 'insert') {
    if (appliedOp.position <= op.position) {
      return { ...op, position: op.position + appliedOp.content!.length };
    }
  }

  if (op.type === 'insert' && appliedOp.type === 'delete') {
    if (appliedOp.position < op.position) {
      return { ...op, position: Math.max(appliedOp.position, op.position - appliedOp.length!) };
    }
  }

  if (op.type === 'delete' && appliedOp.type === 'insert') {
    if (appliedOp.position <= op.position) {
      return { ...op, position: op.position + appliedOp.content!.length };
    }
  }

  if (op.type === 'delete' && appliedOp.type === 'delete') {
    if (appliedOp.position < op.position) {
      return { ...op, position: Math.max(appliedOp.position, op.position - appliedOp.length!) };
    }
  }

  return op;
}
