import { FieldValue, Timestamp, DocumentReference } from 'firebase-admin/firestore';
import { firestore } from '../config/firebase';
import { HttpError } from '../middleware/errors';
import { assertMember, chatExists } from '../repositories/relationalRepo';

/*
 * Firestore layout
 *   chats/{chatId}/messages/{messageId}                    { senderId, text, createdAt, editedAt?, deleted }
 *   chats/{chatId}/messages/{messageId}/readReceipts/{uid} { userId, readAt }
 *   chats/{chatId}/members/{userId}                        { lastSeenMessageId, updatedAt }
 */

export interface MessageDto {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  editedAt: string | null;
  deleted: boolean;
}

const messagesCol = (chatId: string) => firestore.collection('chats').doc(chatId).collection('messages');

const iso = (t: unknown): string | null => (t instanceof Timestamp ? t.toDate().toISOString() : null);

function toDto(chatId: string, id: string, d: FirebaseFirestore.DocumentData): MessageDto {
  return {
    id,
    chatId,
    senderId: d.senderId as string,
    text: d.deleted ? '' : (d.text as string),
    createdAt: iso(d.createdAt),
    editedAt: iso(d.editedAt),
    deleted: Boolean(d.deleted),
  };
}

async function getMessageRef(chatId: string, messageId: string): Promise<{ ref: DocumentReference; data: FirebaseFirestore.DocumentData }> {
  const ref = messagesCol(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'Message not found');
  return { ref, data: snap.data()! };
}

export async function sendMessage(chatId: string, senderId: string, text: string): Promise<MessageDto> {
  await assertMember(chatId, senderId);
  const ref = messagesCol(chatId).doc();
  await ref.set({ senderId, text, createdAt: FieldValue.serverTimestamp(), deleted: false });
  const snap = await ref.get(); // read back to resolve the server timestamp
  return toDto(chatId, ref.id, snap.data()!);
}

export async function getMessages(chatId: string, limit: number): Promise<MessageDto[]> {
  if (!(await chatExists(chatId))) throw new HttpError(404, 'Chat not found');
  // newest N, then flipped so the response is oldest -> newest
  const snap = await messagesCol(chatId).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => toDto(chatId, d.id, d.data())).reverse();
}

export async function markRead(chatId: string, messageId: string, userId: string): Promise<{ readAt: string | null; alreadyRead: boolean }> {
  await assertMember(chatId, userId);
  const { ref, data } = await getMessageRef(chatId, messageId);
  if (data.senderId === userId) throw new HttpError(400, 'Cannot mark your own message as read');

  const receiptRef = ref.collection('readReceipts').doc(userId);
  // transaction keeps the first readAt and makes the call idempotent
  const result = await firestore.runTransaction(async (tx) => {
    const existing = await tx.get(receiptRef);
    if (existing.exists) return { alreadyRead: true };
    tx.set(receiptRef, { userId, readAt: FieldValue.serverTimestamp() });
    return { alreadyRead: false };
  });
  const snap = await receiptRef.get();
  return { readAt: iso(snap.data()?.readAt), alreadyRead: result.alreadyRead };
}

export async function updateLastSeen(chatId: string, userId: string, messageId: string): Promise<{ lastSeenMessageId: string }> {
  await assertMember(chatId, userId);
  await getMessageRef(chatId, messageId);
  await firestore
    .collection('chats').doc(chatId).collection('members').doc(userId)
    .set({ lastSeenMessageId: messageId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { lastSeenMessageId: messageId };
}

// ---- Bonus: edit / delete (sender only; delete is a soft delete) ----

export async function editMessage(chatId: string, messageId: string, userId: string, text: string): Promise<MessageDto> {
  await assertMember(chatId, userId);
  const { ref, data } = await getMessageRef(chatId, messageId);
  if (data.senderId !== userId) throw new HttpError(403, 'Only the sender can edit a message');
  if (data.deleted) throw new HttpError(409, 'Message was deleted');
  await ref.update({ text, editedAt: FieldValue.serverTimestamp() });
  return toDto(chatId, messageId, (await ref.get()).data()!);
}

export async function deleteMessage(chatId: string, messageId: string, userId: string): Promise<void> {
  await assertMember(chatId, userId);
  const { ref, data } = await getMessageRef(chatId, messageId);
  if (data.senderId !== userId) throw new HttpError(403, 'Only the sender can delete a message');
  await ref.update({ deleted: true, text: '', editedAt: FieldValue.serverTimestamp() });
}
