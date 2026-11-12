import { pool } from '../config/db';
import { HttpError } from '../middleware/errors';

export interface UserRow {
  id: string;
  name: string;
  created_at: Date;
}

export interface ChatSummary {
  id: string;
  type: 'direct' | 'group';
  created_at: Date;
  member_ids: string[];
}

export async function createUser(name: string): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>('INSERT INTO users(name) VALUES ($1) RETURNING *', [name]);
  return rows[0]!;
}

export async function userExists(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  return (rowCount ?? 0) > 0;
}

export async function chatExists(chatId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM chats WHERE id = $1', [chatId]);
  return (rowCount ?? 0) > 0;
}

export async function isMember(chatId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
  return (rowCount ?? 0) > 0;
}

/** Throws 404 if chat missing, 403 if the user is not part of it. */
export async function assertMember(chatId: string, userId: string): Promise<void> {
  if (!(await chatExists(chatId))) throw new HttpError(404, 'Chat not found');
  if (!(await isMember(chatId, userId))) throw new HttpError(403, 'User is not a member of this chat');
}

export async function createOrGetDirectChat(userAId: string, userBId: string): Promise<{ chatId: string; created: boolean }> {
  if (userAId === userBId) throw new HttpError(400, 'Cannot create a chat with yourself');
  const [a, b] = await Promise.all([userExists(userAId), userExists(userBId)]);
  if (!a || !b) throw new HttpError(404, 'One or both users not found');

  const key = [userAId, userBId].sort().join(':');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query<{ id: string }>(
      `INSERT INTO chats(type, direct_key) VALUES ('direct', $1)
       ON CONFLICT (direct_key) DO NOTHING RETURNING id`,
      [key],
    );
    if ((ins.rowCount ?? 0) > 0) {
      const chatId = ins.rows[0]!.id;
      await client.query('INSERT INTO chat_members(chat_id, user_id) VALUES ($1, $2), ($1, $3)', [chatId, userAId, userBId]);
      await client.query('COMMIT');
      return { chatId, created: true };
    }
    const existing = await client.query<{ id: string }>('SELECT id FROM chats WHERE direct_key = $1', [key]);
    await client.query('COMMIT');
    return { chatId: existing.rows[0]!.id, created: false };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listUserChats(userId: string): Promise<ChatSummary[]> {
  if (!(await userExists(userId))) throw new HttpError(404, 'User not found');
  const { rows } = await pool.query<ChatSummary>(
    `SELECT c.id, c.type, c.created_at, array_agg(m2.user_id ORDER BY m2.joined_at) AS member_ids
       FROM chat_members m1
       JOIN chats c ON c.id = m1.chat_id
       JOIN chat_members m2 ON m2.chat_id = c.id
      WHERE m1.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows;
}
