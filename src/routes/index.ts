import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errors';
import * as repo from '../repositories/relationalRepo';
import * as messages from '../services/messageService';

const id = z.string().uuid();
const text = z.string().trim().min(1).max(4000);

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Helper (not in the spec) so the API can be tried end-to-end
router.post('/users', asyncHandler(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  res.status(201).json(await repo.createUser(name));
}));

// 1. Create or get chat
router.post('/chat/create', asyncHandler(async (req, res) => {
  const { userAId, userBId } = z.object({ userAId: id, userBId: id }).parse(req.body);
  const { chatId, created } = await repo.createOrGetDirectChat(userAId, userBId);
  res.status(created ? 201 : 200).json({ chatId });
}));

// 2. Send message
router.post('/chat/:chatId/message/send', asyncHandler(async (req, res) => {
  const { chatId } = z.object({ chatId: id }).parse(req.params);
  const { senderId, text: body } = z.object({ senderId: id, text }).parse(req.body);
  res.status(201).json(await messages.sendMessage(chatId, senderId, body));
}));

// 3. Get messages
router.get('/chat/:chatId/messages', asyncHandler(async (req, res) => {
  const { chatId } = z.object({ chatId: id }).parse(req.params);
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
  res.json({ messages: await messages.getMessages(chatId, limit) });
}));

// 4. Mark message read
router.post('/chat/:chatId/message/:messageId/read', asyncHandler(async (req, res) => {
  const { chatId, messageId } = z.object({ chatId: id, messageId: z.string().min(1) }).parse(req.params);
  const { userId } = z.object({ userId: id }).parse(req.body);
  res.json(await messages.markRead(chatId, messageId, userId));
}));

// 5. Update last seen message
router.post('/chat/:chatId/lastseen', asyncHandler(async (req, res) => {
  const { chatId } = z.object({ chatId: id }).parse(req.params);
  const { userId, messageId } = z.object({ userId: id, messageId: z.string().min(1) }).parse(req.body);
  res.json(await messages.updateLastSeen(chatId, userId, messageId));
}));

// 6. List user chats
router.get('/user/:userId/chats', asyncHandler(async (req, res) => {
  const { userId } = z.object({ userId: id }).parse(req.params);
  const chats = await repo.listUserChats(userId);
  res.json({
    chats: chats.map((c) => ({ chatId: c.id, type: c.type, memberIds: c.member_ids, createdAt: c.created_at })),
  });
}));

// Bonus: edit / delete message
router.patch('/chat/:chatId/message/:messageId', asyncHandler(async (req, res) => {
  const { chatId, messageId } = z.object({ chatId: id, messageId: z.string().min(1) }).parse(req.params);
  const { userId, text: body } = z.object({ userId: id, text }).parse(req.body);
  res.json(await messages.editMessage(chatId, messageId, userId, body));
}));

router.delete('/chat/:chatId/message/:messageId', asyncHandler(async (req, res) => {
  const { chatId, messageId } = z.object({ chatId: id, messageId: z.string().min(1) }).parse(req.params);
  const { userId } = z.object({ userId: id }).parse(req.body);
  await messages.deleteMessage(chatId, messageId, userId);
  res.status(204).end();
}));

export default router;
