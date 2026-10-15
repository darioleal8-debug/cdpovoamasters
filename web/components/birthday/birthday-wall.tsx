"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Send, Pencil, Trash2, EyeOff, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { useBirthdayMessages } from "@/hooks/use-birthday-messages";
import { getInitials, relativeTime, getYearLisbon, isWithinBirthdayWindow } from "@/lib/birthday-utils";

const MAX_CHARS = 280;
const PREVIEW_COUNT = 3;

interface BirthdayWallProps {
  playerId:    string;
  playerName:  string;
  birthDate:   string;
  isAdmin?:    boolean;
  /** user_id of the celebrant (to block self-posting regular messages) */
  celebrantUserId: string;
}

export function BirthdayWall({
  playerId,
  playerName,
  birthDate,
  isAdmin = false,
  celebrantUserId,
}: BirthdayWallProps) {
  const year = getYearLisbon();
  const { messages, currentUserId, loading, sending, error, sendMessage, editMessage, deleteMessage, hideMessage } =
    useBirthdayMessages(playerId, year);

  const [text,      setText]      = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText,  setEditText]  = useState("");
  const [expanded,  setExpanded]  = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const windowOpen    = isWithinBirthdayWindow(birthDate);
  const isCelebrant   = currentUserId === celebrantUserId;
  const myMessage     = messages.find((m) => m.author_user_id === currentUserId && !m.is_thank_you);
  const thankYouMsg   = messages.find((m) => m.is_thank_you);
  const otherMessages = messages.filter((m) => !m.is_thank_you);
  const visibleMessages = expanded ? otherMessages : otherMessages.slice(0, PREVIEW_COUNT);
  const hiddenCount     = otherMessages.length - PREVIEW_COUNT;

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    await sendMessage(trimmed);
    setText("");
  }

  async function handleEdit(id: string) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    await editMessage(id, trimmed);
    setEditingId(null);
    setEditText("");
  }

  function startEdit(msg: { id: string; message: string }) {
    setEditingId(msg.id);
    setEditText(msg.message);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const firstName = playerName.split(" ")[0];

  return (
    <div className="space-y-4">
      {/* ── Thank-you message (celebrant, pinned top) ────────────────── */}
      {thankYouMsg && (
        <div
          className="flex gap-3 rounded-xl p-3"
          style={{ background: "rgba(249,115,22,.07)", border: "1px solid rgba(249,115,22,.2)" }}
        >
          <AuthorAvatar name={thankYouMsg.author_name} photoUrl={thankYouMsg.author_photo_url} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold" style={{ color: "var(--action,#F97316)" }}>
                {thankYouMsg.author_name}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ background: "rgba(249,115,22,.15)", color: "var(--action,#F97316)" }}
              >
                Obrigado ♥
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto">
                {relativeTime(thankYouMsg.created_at)}
              </span>
            </div>
            <p className="text-sm mt-0.5" style={{ color: "var(--text,#0F1729)" }}>
              {thankYouMsg.message}
            </p>
          </div>
        </div>
      )}

      {/* ── Message form / own message ────────────────────────────────── */}
      {windowOpen && (
        <div>
          {/* Celebrant: write thank-you */}
          {isCelebrant && !thankYouMsg && (
            <div className="space-y-2">
              <label
                htmlFor={`thankyou-${playerId}`}
                className="block text-[13px] font-medium"
                style={{ color: "var(--muted-text,#5A6478)" }}
              >
                Deixa um "Obrigado" à tua equipa — fica guardado para sempre
              </label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <textarea
                    id={`thankyou-${playerId}`}
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                    placeholder="Obrigado a todos…"
                    rows={2}
                    className="w-full resize-none rounded-xl border px-4 py-3 pr-14 text-sm focus:outline-none focus:ring-2"
                    style={{
                      borderColor:  "var(--line,#E4E7EE)",
                      background:   "var(--paper,#F6F7F9)",
                      color:        "var(--text,#0F1729)",
                      fontSize:     "max(16px,1rem)",
                    }}
                  />
                  <span className="absolute bottom-2 right-3 text-[11px] text-muted-foreground tabular-nums">
                    {text.length}/{MAX_CHARS}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => sendMessage(text.trim(), true)}
                  disabled={!text.trim() || sending}
                  className="self-end flex items-center gap-2 rounded-xl px-5 h-[46px] text-sm font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: "var(--action,#F97316)", color: "#fff" }}
                >
                  <Send className="h-4 w-4" />
                  Enviar Obrigado
                </button>
              </div>
            </div>
          )}

          {/* Non-celebrant: write or edit own message */}
          {!isCelebrant && (
            <div className="space-y-2">
              {myMessage ? (
                /* Own message: show with edit/delete */
                <OwnMessageRow
                  msg={myMessage}
                  isEditing={editingId === myMessage.id}
                  editText={editText}
                  sending={sending}
                  textareaRef={editingId === myMessage.id ? textareaRef : undefined}
                  onEditStart={() => startEdit(myMessage)}
                  onEditChange={setEditText}
                  onEditSave={() => handleEdit(myMessage.id)}
                  onEditCancel={() => { setEditingId(null); setEditText(""); }}
                  onDelete={() => deleteMessage(myMessage.id)}
                />
              ) : (
                /* Form to write */
                <div className="space-y-2">
                  <label
                    htmlFor={`msg-${playerId}`}
                    className="block text-[13px] font-medium"
                    style={{ color: "var(--muted-text,#5A6478)" }}
                  >
                    Deixa uma mensagem ao {firstName} — fica guardada no mural da equipa
                  </label>
                  <div className="relative">
                    <textarea
                      id={`msg-${playerId}`}
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                      placeholder={`Escreve ao ${firstName}…`}
                      rows={2}
                      className="w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2"
                      style={{
                        borderColor: "var(--line,#E4E7EE)",
                        background:  "var(--paper,#F6F7F9)",
                        color:       "var(--text,#0F1729)",
                        fontSize:    "max(16px,1rem)",
                      }}
                    />
                    <span className="absolute bottom-2 right-3 text-[11px] text-muted-foreground tabular-nums">
                      {text.length}/{MAX_CHARS}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!text.trim() || sending}
                      className="flex items-center gap-2 rounded-xl px-5 h-[46px] text-sm font-semibold transition-opacity disabled:opacity-40"
                      style={{ background: "var(--ink,#0A1220)", color: "#fff" }}
                    >
                      <Send className="h-4 w-4" />
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "rgba(217,45,32,.08)", color: "var(--bad,#D92D20)" }}>
          {error}
        </p>
      )}

      {/* ── Message list ───────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: "var(--paper,#F6F7F9)" }} />
          ))}
        </div>
      ) : otherMessages.length === 0 ? (
        !isCelebrant && windowOpen ? null : (
          <p className="text-center text-sm py-4" style={{ color: "var(--muted-text,#5A6478)" }}>
            Sê o primeiro a dar os parabéns ao {firstName}!
          </p>
        )
      ) : (
        <div className="space-y-2">
          {visibleMessages.map((msg) => (
            <MessageRow
              key={msg.id}
              msg={msg}
              isOwn={msg.author_user_id === currentUserId}
              isAdmin={isAdmin}
              isEditing={editingId === msg.id}
              editText={editText}
              sending={sending}
              windowOpen={windowOpen}
              textareaRef={editingId === msg.id ? textareaRef : undefined}
              onEditStart={() => startEdit(msg)}
              onEditChange={setEditText}
              onEditSave={() => handleEdit(msg.id)}
              onEditCancel={() => { setEditingId(null); setEditText(""); }}
              onDelete={() => deleteMessage(msg.id)}
              onHide={(hide) => hideMessage(msg.id, hide)}
            />
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-semibold transition-colors"
              style={{
                background:  "var(--paper,#F6F7F9)",
                color:       "var(--muted-text,#5A6478)",
                border:      "1px solid var(--line,#E4E7EE)",
              }}
            >
              {expanded
                ? <><ChevronUp className="h-4 w-4" /> Mostrar menos</>
                : <><ChevronDown className="h-4 w-4" /> Ver todas as {otherMessages.length} mensagens</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AuthorAvatar({
  name, photoUrl, size = 32,
}: { name: string; photoUrl: string | null; size?: number }) {
  if (photoUrl) {
    return (
      <div
        className="shrink-0 rounded-full overflow-hidden"
        style={{ width: size, height: size, border: "2px solid var(--line,#E4E7EE)" }}
      >
        <Image
          src={photoUrl}
          alt={`Foto de ${name}`}
          width={size}
          height={size}
          className="object-cover w-full h-full"
        />
      </div>
    );
  }
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center text-white font-bold"
      style={{
        width:      size,
        height:     size,
        background: "var(--ink,#0A1220)",
        fontSize:   size * 0.38,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

interface MessageRowProps {
  msg:         ReturnType<typeof useBirthdayMessages>["messages"][number];
  isOwn:       boolean;
  isAdmin:     boolean;
  isEditing:   boolean;
  editText:    string;
  sending:     boolean;
  windowOpen:  boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onEditStart: () => void;
  onEditChange:(v: string) => void;
  onEditSave:  () => void;
  onEditCancel:() => void;
  onDelete:    () => void;
  onHide:      (hide: boolean) => void;
}

function MessageRow({
  msg, isOwn, isAdmin, isEditing, editText, sending, windowOpen,
  textareaRef, onEditStart, onEditChange, onEditSave, onEditCancel, onDelete, onHide,
}: MessageRowProps) {
  return (
    <div
      className="flex gap-3 rounded-xl px-3 py-2.5"
      style={{
        background:  msg.is_hidden ? "rgba(217,45,32,.04)" : "var(--paper,#F6F7F9)",
        opacity:     msg.is_hidden ? 0.7 : 1,
        border:      `1px solid ${msg.is_hidden ? "rgba(217,45,32,.15)" : "var(--line,#E4E7EE)"}`,
      }}
    >
      <AuthorAvatar name={msg.author_name} photoUrl={msg.author_photo_url} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-[13px] font-semibold" style={{ color: "var(--text,#0F1729)" }}>
            {msg.author_name}
          </span>
          {msg.is_hidden && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(217,45,32,.12)", color: "var(--bad,#D92D20)" }}>
              Oculto
            </span>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {relativeTime(msg.created_at)}
          </span>
        </div>

        {isEditing ? (
          <div className="space-y-1.5">
            <textarea
              ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
              value={editText}
              onChange={(e) => onEditChange(e.target.value.slice(0, MAX_CHARS))}
              rows={2}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
              style={{ borderColor: "var(--line,#E4E7EE)", background: "#fff", fontSize: "max(16px,1rem)" }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onEditSave}
                disabled={!editText.trim() || sending}
                className="text-[12px] font-semibold px-3 h-8 rounded-lg disabled:opacity-40"
                style={{ background: "var(--ink,#0A1220)", color: "#fff" }}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={onEditCancel}
                className="text-[12px] font-semibold px-3 h-8 rounded-lg"
                style={{ background: "var(--line,#E4E7EE)", color: "var(--muted-text,#5A6478)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text,#0F1729)" }}>
            {msg.message}
          </p>
        )}
      </div>

      {/* Action buttons */}
      {!isEditing && (
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isOwn && windowOpen && (
            <>
              <button
                type="button"
                onClick={onEditStart}
                aria-label="Editar mensagem"
                className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
              >
                <Pencil className="h-3.5 w-3.5" style={{ color: "var(--muted-text,#5A6478)" }} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="Apagar mensagem"
                className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--bad,#D92D20)" }} />
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onHide(!msg.is_hidden)}
              aria-label={msg.is_hidden ? "Mostrar mensagem" : "Ocultar mensagem"}
              className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            >
              {msg.is_hidden
                ? <Eye    className="h-3.5 w-3.5" style={{ color: "var(--muted-text,#5A6478)" }} />
                : <EyeOff className="h-3.5 w-3.5" style={{ color: "var(--muted-text,#5A6478)" }} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OwnMessageRow({
  msg, isEditing, editText, sending, textareaRef,
  onEditStart, onEditChange, onEditSave, onEditCancel, onDelete,
}: {
  msg:         ReturnType<typeof useBirthdayMessages>["messages"][number];
  isEditing:   boolean;
  editText:    string;
  sending:     boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onEditStart: () => void;
  onEditChange:(v: string) => void;
  onEditSave:  () => void;
  onEditCancel:() => void;
  onDelete:    () => void;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--paper,#F6F7F9)", border: "1px solid var(--line,#E4E7EE)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold" style={{ color: "var(--muted-text,#5A6478)" }}>
          A tua mensagem
        </span>
        <span className="text-[11px] text-muted-foreground">{relativeTime(msg.created_at)}</span>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
            value={editText}
            onChange={(e) => onEditChange(e.target.value.slice(0, MAX_CHARS))}
            rows={2}
            className="w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: "var(--line,#E4E7EE)", background: "#fff", fontSize: "max(16px,1rem)" }}
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onEditSave}
              disabled={!editText.trim() || sending}
              className="text-[12px] font-semibold px-3 h-8 rounded-lg disabled:opacity-40"
              style={{ background: "var(--ink,#0A1220)", color: "#fff" }}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={onEditCancel}
              className="text-[12px] font-semibold px-3 h-8 rounded-lg"
              style={{ background: "var(--line,#E4E7EE)", color: "var(--muted-text,#5A6478)" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm mb-2" style={{ color: "var(--text,#0F1729)" }}>{msg.message}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onEditStart}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 h-8 rounded-lg transition-colors"
              style={{ background: "var(--line,#E4E7EE)", color: "var(--muted-text,#5A6478)" }}
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 h-8 rounded-lg transition-colors"
              style={{ background: "rgba(217,45,32,.08)", color: "var(--bad,#D92D20)" }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Apagar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
