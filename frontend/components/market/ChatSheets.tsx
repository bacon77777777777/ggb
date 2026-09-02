'use client';

/*
 * 交易所聊聊。
 *
 * 老闆 2026-09-01：「最右邊箱子圖標移除，改聊聊」。
 * `marketplace_messages` 這張表從 migration 175 就存在、RLS 也對，但全站沒有任何
 * 程式碼碰過它 —— 買家想問賣家「這件有盒損嗎」一直沒有地方問。
 * 這裡把它接起來（RPC 見 migration 672）。
 *
 * 版型照商城的聊聊彈層（.chatbox / .bub / .chatbar / .sendbtn / .chatctx），
 * 一樣不重畫，只輸出對應 class。
 *
 * 目前**沒有未讀標記**：marketplace_messages 沒有 read_at 欄位，
 * 硬要標未讀就得改表 —— 等老闆說要再做。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { asset } from '@/lib/asset';
import { useAuth } from '@/contexts/AuthContext';
import { CommentInput } from '@/components/ui/CommentInput';
import { Sheet, gnum, ago } from './ui';
import { fetchChats, fetchChatThread, sendChatMessage, type Chat, type ChatMessage } from '@/app/market/data';

const FALLBACK = asset('/images/item_defaulet.webp');
const AVATAR_FALLBACK = '/images/avatar/01.webp';

/** 聊天泡泡旁的頭像：吃 DB 的 avatar_url（老闆 2026-09-02，不再用暱稱染色圓點） */
function ChatAvatar({ src }: { src: string | null }) {
  return (
    <span style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#EEE' }}>
      <Image src={asset(src || AVATAR_FALLBACK)} alt="" width={26} height={26} className="w-full h-full object-cover" unoptimized />
    </span>
  );
}

/** 對話列表 */
export function ChatListSheet({ open, onClose, onPick, loggedIn }: {
  open: boolean;
  onClose: () => void;
  onPick: (listingId: number, otherId: string, otherName: string, otherAvatar: string | null) => void;
  loggedIn: boolean;
}) {
  const [rows, setRows] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !loggedIn) return;
    setLoading(true);
    fetchChats().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [open, loggedIn]);

  return (
    <Sheet open={open} title="聊聊" onClose={onClose}>
      <div className="blk first">
        {!loggedIn ? (
          <div className="empty">登入之後才看得到對話</div>
        ) : loading ? (
          <div className="empty">載入中…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            還沒有任何對話
            <div style={{ marginTop: 8, fontSize: 12 }}>
              在商品頁按「聊聊」就能問賣家問題
            </div>
          </div>
        ) : (
          rows.map(c => (
            <button
              key={`${c.listingId}-${c.otherId}`}
              className="mrowi"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => onPick(c.listingId, c.otherId, c.otherName, c.otherAvatar)}
            >
              <span className="mth" style={{ background: '#F2F2F2', overflow: 'hidden' }}>
                <Image src={c.prizeImage || FALLBACK} alt="" width={52} height={52} className="object-contain" unoptimized />
              </span>
              <span className="mmeta">
                <span className="mt" style={{ fontWeight: 700 }}>{c.otherName}</span>
                <span className="ms">
                  {c.lastFromMe ? '你：' : ''}{c.lastBody}
                </span>
                <span className="ms" style={{ opacity: .8 }}>
                  {c.prizeName} · {gnum(c.price)} G
                  {c.listingStatus !== 'active' && (c.listingStatus === 'sold' ? ' · 已售出' : ' · 已下架')}
                </span>
              </span>
              <span className="mact" style={{ fontSize: 10.5, color: 'var(--sub)' }}>{ago(c.lastAt)}</span>
            </button>
          ))
        )}
      </div>
    </Sheet>
  );
}

/** 單一對話 */
export function ChatThreadSheet({ open, onClose, listingId, otherId, otherName, otherAvatar = null, context, loggedIn, onSent }: {
  open: boolean;
  onClose: () => void;
  listingId: number | null;
  otherId: string | null;
  otherName: string;
  /** 對方的 avatar_url（詳情頁給 sellerAvatar、聊聊列表給 other_avatar） */
  otherAvatar?: string | null;
  /** 這件商品的小卡，讓對話有上下文（商城的 .chatctx.item） */
  context?: { name: string; image: string | null; price: number } | null;
  loggedIn: boolean;
  onSent?: () => void;
}) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!listingId || !otherId) return;
    try { setMsgs(await fetchChatThread(listingId, otherId)); } catch { setMsgs([]); }
  }, [listingId, otherId]);

  useEffect(() => { if (open && loggedIn) load(); }, [open, loggedIn, load]);

  // 新訊息進來捲到底 —— 聊天視窗停在最舊的訊息上等於沒開
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async () => {
    if (!listingId || !otherId) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const res = await sendChatMessage(listingId, otherId, body);
    setSending(false);
    if (!res.success) { setErr(res.message || '送出失敗'); return; }
    setErr('');
    setDraft('');
    await load();
    onSent?.();
  };

  return (
    <Sheet
      open={open}
      title={otherName || '聊聊'}
      onClose={onClose}
      footer={
        <div className="chatbar" style={{ width: '100%', padding: 0 }}>
          {/* 輸入框統一用情報頁留言那組元件（老闆 2026-09-02） */}
          <CommentInput
            value={draft}
            onChange={setDraft}
            onSend={send}
            canType={loggedIn && !sending}
            sending={sending}
            maxLength={500}
            placeholder="想問賣家什麼？"
            placeholderLoggedOut="登入後才能發訊息"
          />
        </div>
      }
    >
      <div style={{ padding: '12px 12px 0' }}>
        {context && (
          <div className="chatctx item">
            <div className="cchd">正在聊這件</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: '#F2F2F2', flexShrink: 0 }}>
                <Image src={context.image || FALLBACK} alt="" width={44} height={44} className="object-contain" unoptimized />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{context.name}</div>
                <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700, marginTop: 2 }}>{gnum(context.price)} G</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chatbox" ref={boxRef}>
        {!loggedIn ? (
          <div className="empty">登入之後才能聊</div>
        ) : msgs.length === 0 ? (
          <div className="empty">
            還沒有訊息
            <div style={{ marginTop: 8, fontSize: 12 }}>
              交易所是站內 G 幣交易，成交後東西直接進倉庫 —— 不用談運費也不用留地址
            </div>
          </div>
        ) : (
          msgs.map(m => (
            <div className={`bub${m.fromMe ? ' me' : ''}`} key={m.id}>
              <ChatAvatar src={m.fromMe ? (user?.avatar_url ?? null) : otherAvatar} />
              <span className="tx">{m.body}</span>
            </div>
          ))
        )}
      </div>

      {err && <p className="hint" style={{ padding: '0 14px', color: 'var(--red)' }}>{err}</p>}
    </Sheet>
  );
}
