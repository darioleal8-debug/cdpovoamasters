"""
HoopHub Image Processor — microserviço FastAPI para pré-processamento de folhas de jogo.

Endpoints:
  GET  /health        — verificação de disponibilidade
  POST /preprocess    — pré-processamento de imagem ou PDF

Autenticação: Bearer token via variável de ambiente SERVICE_SECRET.
Se SERVICE_SECRET estiver vazio, a autenticação é desativada (uso local/dev).
"""

import os
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from processor import DocumentProcessor

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

SERVICE_SECRET = os.getenv("SERVICE_SECRET", "")
ALLOWED_MIMES = {
    "image/jpeg", "image/png", "image/webp",
    "application/pdf", "application/octet-stream",  # octet-stream como fallback
}
MAX_BYTES = 20 * 1024 * 1024  # 20 MB (PDFs e imagens de alta resolução)

app = FastAPI(
    title="HoopHub Image Processor",
    description="Pré-processamento de folhas de jogo com OpenCV",
    version="1.0.0",
)
security = HTTPBearer(auto_error=False)


def verify_token(credentials: HTTPAuthorizationCredentials | None = Depends(security)):
    if not SERVICE_SECRET:
        return  # autenticação desativada em dev
    if credentials is None or credentials.credentials != SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Token inválido ou ausente")


@app.get("/health")
def health():
    return {"status": "ok", "service": "hoophub-image-processor"}


@app.post("/preprocess")
async def preprocess(
    file: UploadFile = File(...),
    _: None = Depends(verify_token),
):
    """
    Pré-processa uma imagem ou PDF de folha de jogo.

    Devolve JSON:
    {
      "image": "<base64 JPEG>",
      "perspective_applied": bool,
      "quality": { "sharpness": float, "brightness": float, "is_blurry": bool,
                   "issues": [str], "legibility": float },
      "zones": { "header": {x,y,w,h}, "roster_a": ..., "running_score_a": ...,
                 "running_score_b": ..., "roster_b": ..., "period_scores": ...,
                 "final_score": ... }
    }
    """
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Ficheiro vazio")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Ficheiro demasiado grande (máx. {MAX_BYTES // 1024 // 1024} MB)")

    mime = (file.content_type or "").lower()
    # Sniff PDF por magic bytes se o MIME não for fiável
    if content[:4] == b"%PDF":
        mime = "application/pdf"
    elif not mime or mime == "application/octet-stream":
        mime = "image/jpeg"  # presunção razoável para binários de imagem

    logger.info(f"preprocess mime={mime} size={len(content)}")

    try:
        processor = DocumentProcessor()
        result = processor.process(content, mime)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Erro inesperado no processamento")
        raise HTTPException(status_code=500, detail="Erro interno no processamento da imagem")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
