/**
 * src/services/chat.service.js
 * ---------------------------------------------------------
 * Lógica de negócio para o chat interno simples.
 * ---------------------------------------------------------
 */

const chatMessageModel = require('../models/chatMessage.model');

async function sendMessage(authorId, content) {
  return chatMessageModel.create({ authorId, content });
}

async function listMessages({ limit, before }) {
  return chatMessageModel.findAll({ limit, before });
}

module.exports = { sendMessage, listMessages };
