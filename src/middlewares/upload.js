/**
 * src/middlewares/upload.js
 * ---------------------------------------------------------
 * Configuração do multer para upload de fotografias de
 * jogadores. Guarda os ficheiros localmente em disco, em
 * uploads/players, com nome único por jogador+temporada.
 *
 * Nota: para produção a larga escala, o mesmo padrão de
 * "destination + filename" pode ser substituído por um
 * storage engine para S3 (multer-s3) sem alterar o resto
 * da aplicação — os controladores só dependem de
 * req.file.filename / req.file.path.
 * ---------------------------------------------------------
 */
 
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');
 
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads/players';
const MAX_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB) || 5;
 
// Garante que a pasta de destino existe
const absoluteUploadDir = path.join(process.cwd(), UPLOAD_DIR);
if (!fs.existsSync(absoluteUploadDir)) {
  fs.mkdirSync(absoluteUploadDir, { recursive: true });
}
 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, absoluteUploadDir);
  },
  filename: (req, file, cb) => {
    // Nome único: userId-seasonId-timestamp.ext, evita colisões e
    // permite identificar a que jogador/temporada pertence o ficheiro.
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.params.userId || req.user?.id || 'utilizador';
    const seasonId = req.params.seasonId || 'temporada';
    const uniqueName = `${userId}_${seasonId}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});
 
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
 
function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError('Apenas são permitidas imagens JPEG, PNG ou WEBP.', 400));
  }
  cb(null, true);
}
 
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});
 
module.exports = upload;
