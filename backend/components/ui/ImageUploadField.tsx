'use client'

/**
 * 圖片上傳欄位
 *
 * 取代「請貼上圖片 URL」這種要求管理員自己想辦法把圖弄到某個網址的欄位。
 * 上傳走既有的 /api/admin/upload（R2 + WebP 壓縮），回傳的公開網址存進原本的欄位，
 * 所以資料格式完全不變 —— 既有資料照樣顯示，只是輸入方式從「貼網址」變成「選檔案」。
 *
 * 仍然保留手動輸入：外部素材（例如廠商給的 CDN 連結）不該被迫先下載再上傳。
 * 預設收在「或直接貼網址」後面，不佔版面。
 */

import { useRef, useState } from 'react'
import Image from 'next/image'
import Input from './Input'
import { useToast } from '@/contexts/ToastContext'

// 後台沒有 lucide-react（那是前台的相依），為三個圖示裝一包不划算，直接內嵌
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const IconX = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
       strokeLinecap="round" className="w-2.5 h-2.5">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

interface Props {
  value: string
  onChange: (url: string) => void
  /** R2 上的資料夾，例如 'events'。同一類素材放一起才好清 */
  folder?: string
  label?: string
  /** 影片封面之類的可選欄位，標示一下 */
  hint?: string
  /** 原圖直傳不壓縮（像素精度素材用） */
  raw?: boolean
}

export default function ImageUploadField({
  value, onChange, folder = 'events', label, hint, raw = false,
}: Props) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showUrl, setShowUrl] = useState(false)

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('只能上傳圖片檔', 'error')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('bucket', folder)
      // 檔名帶時間戳避免覆蓋；副檔名交給後端決定（壓縮後一律 webp）
      form.append('path', `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`)
      if (raw) form.append('raw', '1')

      const res = await fetch('/api/admin/upload', { method: 'POST', body: form, credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '上傳失敗')
      onChange(json.publicUrl)
      toast('已上傳')
    } catch (e: any) {
      toast(e?.message || '上傳失敗', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-neutral-500">
          {label}
          {hint && <span className="ml-1 font-normal text-neutral-400">{hint}</span>}
        </label>
      )}

      <div className="flex items-start gap-2">
        {/* 預覽：有圖才顯示，讓管理員確認上傳到的是對的東西 */}
        {value ? (
          <div className="relative w-16 h-16 rounded-lg border border-neutral-200 overflow-hidden bg-neutral-50 flex-shrink-0">
            <Image src={value} alt="" fill sizes="64px" className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              aria-label="移除圖片"
            >
              <IconX />
            </button>
          </div>
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-60"
            >
              <IconUpload />
              {uploading ? '上傳中…' : value ? '換一張' : '上傳圖片'}
            </button>
            <button
              type="button"
              onClick={() => setShowUrl(v => !v)}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <IconLink />
              或直接貼網址
            </button>
          </div>

          {showUrl && (
            <Input
              className="font-mono text-xs"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="https://... 或 /images/..."
            />
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
      />
    </div>
  )
}
