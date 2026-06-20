/**
 * src/config/constants.js
 * ---------------------------------------------------------
 * Constantes partilhadas: níveis de conta, estados, etc.
 * Mantidas num único ficheiro para evitar strings "mágicas"
 * espalhadas pelo código.
 * ---------------------------------------------------------
 */
 
const ROLES = Object.freeze({
  ADMIN: 'admin',
  TREINADOR: 'treinador',
  JOGADOR: 'jogador',
});
 
const USER_STATUS = Object.freeze({
  PENDENTE: 'pendente',
  ATIVO: 'ativo',
  REJEITADO: 'rejeitado',
  INATIVO: 'inativo',
});
 
const SEASON_STATUS = Object.freeze({
  ATIVA: 'ativa',
  ARQUIVADA: 'arquivada',
});
 
const EVENT_TYPE = Object.freeze({
  JOGO: 'jogo',
  TREINO: 'treino',
  OUTRO: 'outro',
});
 
const PAYMENT_STATUS = Object.freeze({
  PAGO: 'pago',
  PENDENTE: 'pendente',
});
 
const PLAYER_POSITION = Object.freeze({
  BASE: 'base',
  EXTREMO: 'extremo',
  POSTE: 'poste',
});
 
// Papéis com permissão para gerir calendário e plantel
const STAFF_ROLES = [ROLES.ADMIN, ROLES.TREINADOR];
 
module.exports = {
  ROLES,
  USER_STATUS,
  SEASON_STATUS,
  EVENT_TYPE,
  PAYMENT_STATUS,
  PLAYER_POSITION,
  STAFF_ROLES,
};
