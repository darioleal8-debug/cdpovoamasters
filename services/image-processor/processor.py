"""
Processamento de imagens de folhas de jogo com OpenCV.

Pipeline:
  1. PDF → JPEG (via pdf2image/poppler)
  2. Deteção de qualidade (blur, brilho)
  3. Correção de perspetiva (deteção dos 4 cantos do documento)
  4. Melhoria CLAHE + unsharp mask (para manuscritos)
  5. Deteção de zonas da folha FIBA (coordenadas normalizadas)

A correção de perspetiva é conservadora: só aplica se os cantos formarem
um quadrilátero que cobre ≥30% da imagem e tiver inclinação ≥5°.
"""

import io
import logging
import base64
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Folha FIBA INATEL — zonas por omissão (normalizadas 0–1)
# Landscape e portrait têm proporções diferentes.
_ZONES_LANDSCAPE = {
    "header":          {"x": 0.00, "y": 0.00, "w": 1.00, "h": 0.10},
    "roster_a":        {"x": 0.00, "y": 0.10, "w": 0.20, "h": 0.74},
    "running_score_a": {"x": 0.20, "y": 0.10, "w": 0.30, "h": 0.74},
    "running_score_b": {"x": 0.50, "y": 0.10, "w": 0.30, "h": 0.74},
    "roster_b":        {"x": 0.80, "y": 0.10, "w": 0.20, "h": 0.74},
    "period_scores":   {"x": 0.00, "y": 0.84, "w": 1.00, "h": 0.10},
    "final_score":     {"x": 0.00, "y": 0.94, "w": 1.00, "h": 0.06},
}

_ZONES_PORTRAIT = {
    "header":          {"x": 0.00, "y": 0.00, "w": 1.00, "h": 0.12},
    "roster_a":        {"x": 0.00, "y": 0.12, "w": 0.25, "h": 0.68},
    "running_score_a": {"x": 0.25, "y": 0.12, "w": 0.25, "h": 0.68},
    "running_score_b": {"x": 0.50, "y": 0.12, "w": 0.25, "h": 0.68},
    "roster_b":        {"x": 0.75, "y": 0.12, "w": 0.25, "h": 0.68},
    "period_scores":   {"x": 0.00, "y": 0.80, "w": 1.00, "h": 0.12},
    "final_score":     {"x": 0.00, "y": 0.92, "w": 1.00, "h": 0.08},
}


class DocumentProcessor:

    def process(self, content: bytes, mime: str) -> dict:
        """Ponto de entrada principal. Devolve dict com image (base64) e metadados."""
        # 1. Converter PDF se necessário
        if "pdf" in mime.lower():
            content = self._pdf_to_jpeg(content)

        # 2. Descodificar imagem
        arr = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Não foi possível descodificar a imagem — formato inválido ou corrompido")

        # 3. Medir qualidade antes de qualquer transformação
        quality = self._measure_quality(img)

        # 4. Corrigir perspetiva (conservador)
        corrected, perspective_applied = self._correct_perspective(img)

        # 5. Melhorar contraste e nitidez para manuscritos
        enhanced = self._enhance_document(corrected)

        # 6. Detetar zonas da folha
        zones = self._detect_zones(enhanced)

        # 7. Codificar resultado em JPEG
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 92]
        ok, buf = cv2.imencode(".jpg", enhanced, encode_params)
        if not ok:
            raise ValueError("Falha ao codificar a imagem de saída")

        return {
            "image": base64.b64encode(buf.tobytes()).decode(),
            "perspective_applied": perspective_applied,
            "quality": quality,
            "zones": zones,
        }

    # ─── PDF ──────────────────────────────────────────────────────────────────

    def _pdf_to_jpeg(self, pdf_bytes: bytes) -> bytes:
        try:
            from pdf2image import convert_from_bytes
        except ImportError:
            raise RuntimeError("pdf2image não instalado — instale com: pip install pdf2image")
        images = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=300)
        if not images:
            raise ValueError("O PDF não tem páginas")
        buf = io.BytesIO()
        images[0].save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    # ─── Qualidade ────────────────────────────────────────────────────────────

    def _measure_quality(self, img: np.ndarray) -> dict:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(gray.mean())

        issues = []
        if laplacian_var < 80:
            issues.append("desfocada")
        if brightness < 45:
            issues.append("subexposta")
        if brightness > 225:
            issues.append("sobreexposta")

        # Legibilidade normalizada 0–1 (500 = nitidez excelente para um documento)
        legibility = round(min(1.0, laplacian_var / 500), 3)

        return {
            "sharpness": round(laplacian_var, 1),
            "brightness": round(brightness, 1),
            "is_blurry": laplacian_var < 80,
            "issues": issues,
            "legibility": legibility,
        }

    # ─── Perspetiva ───────────────────────────────────────────────────────────

    def _correct_perspective(self, img: np.ndarray) -> tuple:
        h, w = img.shape[:2]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return img, False

        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        doc_contour = None
        for c in contours[:8]:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            area = cv2.contourArea(approx)
            if len(approx) == 4 and area >= 0.30 * h * w:
                doc_contour = approx
                break

        if doc_contour is None:
            return img, False

        pts = doc_contour.reshape(4, 2).astype(np.float32)
        ordered = self._order_points(pts)
        tl, tr, br, bl = ordered

        # Ângulo da borda superior — só corrige se ≥5°
        top_angle = abs(np.degrees(np.arctan2(tr[1] - tl[1], tr[0] - tl[0])))
        left_angle = abs(np.degrees(np.arctan2(bl[0] - tl[0], bl[1] - tl[1])))
        if max(top_angle, left_angle) < 5.0:
            return img, False

        max_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
        max_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
        if max_w < 100 or max_h < 100:
            return img, False

        dst = np.array([
            [0, 0],
            [max_w - 1, 0],
            [max_w - 1, max_h - 1],
            [0, max_h - 1],
        ], dtype=np.float32)

        M = cv2.getPerspectiveTransform(ordered, dst)
        warped = cv2.warpPerspective(img, M, (max_w, max_h))
        return warped, True

    def _order_points(self, pts: np.ndarray) -> np.ndarray:
        """Ordena: canto superior-esquerdo, sup-dir, inf-dir, inf-esq."""
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]
        rect[2] = pts[np.argmax(s)]
        diff = np.diff(pts, axis=1).flatten()
        rect[1] = pts[np.argmin(diff)]
        rect[3] = pts[np.argmax(diff)]
        return rect

    # ─── Melhoria ─────────────────────────────────────────────────────────────

    def _enhance_document(self, img: np.ndarray) -> np.ndarray:
        """CLAHE na luminância + unsharp mask leve. Não destrói marcações manuscritas."""
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        enhanced = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        # Unsharp mask conservador (sigma=1.5, peso=0.25) para preservar traços
        gaussian = cv2.GaussianBlur(enhanced, (0, 0), 1.5)
        return cv2.addWeighted(enhanced, 1.25, gaussian, -0.25, 0)

    # ─── Zonas ────────────────────────────────────────────────────────────────

    def _detect_zones(self, img: np.ndarray) -> dict:
        """
        Tenta refinar as zonas por omissão com deteção de linhas horizontais.
        Se falhar, devolve as zonas por omissão (landscape ou portrait).
        """
        h, w = img.shape[:2]
        default = _ZONES_LANDSCAPE if w > h else _ZONES_PORTRAIT

        try:
            return self._refine_zones(img, default)
        except Exception as e:
            logger.warning(f"Refinamento de zonas falhou: {e}")
            return default

    def _refine_zones(self, img: np.ndarray, default: dict) -> dict:
        """Usa morfologia para detetar linhas horizontais e ajustar limites das zonas."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        h, w = img.shape[:2]

        # Detetar linhas horizontais com morfologia
        horiz_len = max(w // 4, 50)
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (horiz_len, 1))
        horiz = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel_h)

        # Projeção vertical: onde estão as linhas horizontais?
        proj = np.mean(horiz, axis=1)
        line_rows = np.where(proj > 15)[0]

        groups = self._group_lines(line_rows, threshold=h * 0.04)
        if len(groups) < 2:
            return default

        # Duas linhas principais: fim do cabeçalho e início dos parciais
        top_line = groups[0] / h
        bottom_line = groups[-1] / h

        if not (0.05 < top_line < 0.25 and 0.65 < bottom_line < 0.95):
            return default

        zones = {k: dict(v) for k, v in default.items()}
        mid_h = bottom_line - top_line

        zones["header"]["h"] = top_line
        for z in ("roster_a", "running_score_a", "running_score_b", "roster_b"):
            zones[z]["y"] = top_line
            zones[z]["h"] = mid_h
        tail = 1.0 - bottom_line
        zones["period_scores"]["y"] = bottom_line
        zones["period_scores"]["h"] = tail * 0.65
        zones["final_score"]["y"] = bottom_line + tail * 0.65
        zones["final_score"]["h"] = tail * 0.35

        return zones

    def _group_lines(self, rows: np.ndarray, threshold: float) -> list:
        if len(rows) == 0:
            return []
        groups, current = [], [int(rows[0])]
        for r in rows[1:]:
            if r - current[-1] < threshold:
                current.append(int(r))
            else:
                groups.append(float(np.mean(current)))
                current = [int(r)]
        groups.append(float(np.mean(current)))
        return groups
