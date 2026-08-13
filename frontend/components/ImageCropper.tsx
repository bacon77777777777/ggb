'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  src: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

const OUTPUT_SIZE = 400
const CROP_RATIO  = 0.78  // crop box = 78% of shorter canvas dimension

export default function ImageCropper({ src, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const imgRef    = useRef<HTMLImageElement | null>(null)
  const [ready, setReady]   = useState(false)
  const [shape, setShape]   = useState<'circle' | 'square'>('circle')
  const shapeRef = useRef<'circle' | 'square'>('circle')

  // Transform: center of image on canvas (canvas px, already DPR-scaled)
  const tx  = useRef(0)
  const ty  = useRef(0)
  const tsc = useRef(1)

  // Drag state
  const drag = useRef<{ lx: number; ly: number; ls: number; touches: { clientX: number; clientY: number }[] } | null>(null)

  // ── helpers ──────────────────────────────────────────────────────────
  /**
   * 畫布的 **CSS 尺寸**（不是 backing store 的裝置像素）。
   *
   * ⚠️ 這裡一定要除以 dpr。canvas 的 `width/height` 屬性是裝置像素
   * （CSS 尺寸 × dpr），而 context 掛載時已經 `scale(dpr, dpr)` ——
   * 直接拿裝置像素當座標，等於再放大一次 dpr 倍：
   * Retina Mac（dpr 2）與 iPhone（dpr 3）上裁切框與圖片會整個爆出可視範圍，
   * 只有 dpr = 1 的螢幕看起來正常（2026-08-13 老闆回報）。
   *
   * 整份檔案的座標（tx / ty / cropBox / 拖曳量）統一用 CSS 像素。
   */
  function canvasPx() {
    const c = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    return { w: c.width / dpr, h: c.height / dpr }
  }
  function cropBox() {
    const { w, h } = canvasPx()
    const size = Math.min(w, h) * CROP_RATIO
    return { x: (w - size) / 2, y: (h - size) / 2, size }
  }
  function clamp(v: number, lo: number, hi: number) {
    return Math.min(Math.max(v, lo), hi)
  }
  function constrain() {
    const img = imgRef.current!
    const crop = cropBox()
    const minSc = Math.max(crop.size / img.naturalWidth, crop.size / img.naturalHeight)
    tsc.current = Math.max(tsc.current, minSc)
    const iw = img.naturalWidth  * tsc.current
    const ih = img.naturalHeight * tsc.current
    tx.current = clamp(tx.current, crop.x + crop.size - iw / 2, crop.x + iw / 2)
    ty.current = clamp(ty.current, crop.y + crop.size - ih / 2, crop.y + ih / 2)
  }

  // ── draw ─────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img    = imgRef.current
    if (!canvas || !img) return
    const ctx  = canvas.getContext('2d')!
    const { w, h } = canvasPx()
    const crop = cropBox()
    const iw   = img.naturalWidth  * tsc.current
    const ih   = img.naturalHeight * tsc.current

    ctx.clearRect(0, 0, w, h)

    // 1. draw image
    ctx.drawImage(img, tx.current - iw / 2, ty.current - ih / 2, iw, ih)

    // 2. dark overlay with crop hole (even-odd)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    if (shapeRef.current === 'circle') {
      ctx.arc(crop.x + crop.size / 2, crop.y + crop.size / 2, crop.size / 2, 0, Math.PI * 2, true)
    } else {
      // rect in opposite winding via moveTo trick
      ctx.moveTo(crop.x + crop.size, crop.y)
      ctx.lineTo(crop.x, crop.y)
      ctx.lineTo(crop.x, crop.y + crop.size)
      ctx.lineTo(crop.x + crop.size, crop.y + crop.size)
      ctx.closePath()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill('evenodd')

    // 3. crop border
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth   = 2
    if (shapeRef.current === 'circle') {
      ctx.beginPath()
      ctx.arc(crop.x + crop.size / 2, crop.y + crop.size / 2, crop.size / 2, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.strokeRect(crop.x, crop.y, crop.size, crop.size)
      // grid lines
      ctx.lineWidth = 0.5
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      const third = crop.size / 3
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(crop.x + third * i, crop.y); ctx.lineTo(crop.x + third * i, crop.y + crop.size); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(crop.x, crop.y + third * i); ctx.lineTo(crop.x + crop.size, crop.y + third * i); ctx.stroke()
      }
    }
  }, [])

  // ── init canvas & image ───────────────────────────────────────────────
  /** 依外層容器目前的大小重設畫布，並把圖片重新置中鋪滿裁切框 */
  const fitCanvas = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const dpr  = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    canvas.width  = rect.width  * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)   // 改過 width/height 之後 transform 會被重設，但保險起見先歸零
    ctx.scale(dpr, dpr)

    const img = imgRef.current
    if (!img) return
    const crop  = cropBox()
    tsc.current = Math.max(crop.size / img.naturalWidth, crop.size / img.naturalHeight)
    tx.current  = crop.x + crop.size / 2
    ty.current  = crop.y + crop.size / 2
    draw()
  }, [draw])

  useEffect(() => {
    fitCanvas()
    const img = new Image()
    img.src = src
    img.onload = () => {
      imgRef.current = img
      fitCanvas()
      setReady(true)
    }
  }, [src, fitCanvas])

  /*
   * 容器大小變了要重算。
   *
   * 原本只在掛載時量一次 —— 開關 DevTools、旋轉手機、Safari 的網址列收合，
   * 畫布都還停在舊尺寸，裁切框跟著跑掉。
   * 重新 fit 會把圖片重新置中（使用者拖過的位置會歸位），
   * 但尺寸變了本來就得重新框，比留著一個對不上的框好。
   */
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => fitCanvas())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fitCanvas])

  useEffect(() => { if (ready) draw() }, [ready, draw])

  // sync shape ref and redraw
  useEffect(() => { shapeRef.current = shape; if (ready) draw() }, [shape, ready, draw])

  // ── touch / mouse events ──────────────────────────────────────────────
  function getPos(e: MouseEvent | Touch) {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    // 不乘 dpr：內部座標是 CSS 像素（見 canvasPx 的說明）
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') return
    const p = getPos(e.nativeEvent)
    drag.current = { lx: p.x, ly: p.y, ls: tsc.current, touches: [] }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || e.pointerType === 'touch') return
    const p  = getPos(e.nativeEvent)
    tx.current += p.x - drag.current.lx
    ty.current += p.y - drag.current.ly
    drag.current.lx = p.x
    drag.current.ly = p.y
    constrain(); draw()
  }
  function onPointerUp() { drag.current = null }

  function onTouchStart(e: React.TouchEvent) {
    e.preventDefault()
    drag.current = {
      lx: e.touches[0].clientX,
      ly: e.touches[0].clientY,
      ls: tsc.current,
      touches: Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY })),
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    if (!drag.current) return

    if (e.touches.length === 1) {
      // pan（位移量同樣是 CSS 像素，不乘 dpr）
      const dx = e.touches[0].clientX - drag.current.lx
      const dy = e.touches[0].clientY - drag.current.ly
      tx.current += dx; ty.current += dy
      drag.current.lx = e.touches[0].clientX
      drag.current.ly = e.touches[0].clientY
    } else if (e.touches.length === 2 && drag.current.touches.length === 2) {
      // pinch zoom
      const prev = drag.current.touches
      const prevDist = Math.hypot(prev[0].clientX - prev[1].clientX, prev[0].clientY - prev[1].clientY)
      const nowDist  = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      const ratio = nowDist / prevDist
      tsc.current = drag.current.ls * ratio
      drag.current.ls = tsc.current
      drag.current.touches = Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }))
    }
    constrain(); draw()
  }
  function onTouchEnd() { drag.current = null }

  // ── confirm ───────────────────────────────────────────────────────────
  function handleConfirm() {
    const img  = imgRef.current!
    const crop = cropBox()
    const iw   = img.naturalWidth  * tsc.current
    const ih   = img.naturalHeight * tsc.current

    const srcX = (crop.x - (tx.current - iw / 2)) / tsc.current
    const srcY = (crop.y - (ty.current - ih / 2)) / tsc.current
    const srcS = crop.size / tsc.current

    const out = document.createElement('canvas')
    out.width = out.height = OUTPUT_SIZE
    const ctx = out.getContext('2d')!
    ctx.drawImage(img, srcX, srcY, srcS, srcS, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
    out.toBlob(b => { if (b) onConfirm(b) }, 'image/webp', 0.9)
  }

  /*
   * 手機吃滿螢幕、電腦上收成一個有邊界的面板。
   *
   * 原本一律 `fixed inset-0`，在桌機就是一整片全螢幕黑幕 —— 裁一張頭像不需要
   * 佔掉整個視窗。手機仍維持全螢幕（小螢幕要留給裁切框），所以斷點以上才收。
   *
   * canvas 是掛載時依外層容器的 boundingRect 算尺寸的，容器變小它自己會跟著小，
   * 裁切框（短邊的 78%）也照比例縮，不用另外調。
   */
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black md:bg-black/70">
      <div className="relative flex h-full w-full select-none flex-col bg-black
                      md:h-[600px] md:max-h-[88vh] md:w-[420px] md:rounded-2xl md:shadow-modal md:overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={onCancel}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white active:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-white font-bold text-[15px]">裁切頭像</span>
        <button
          onClick={handleConfirm}
          className="bg-primary text-white text-sm font-bold px-4 py-1.5 rounded-full active:opacity-80"
        >
          完成
        </button>
      </div>

      {/* Canvas area */}
      <div ref={wrapRef} className="flex-1 relative overflow-hidden"
        style={{ cursor: 'grab' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Shape toggle + hint */}
      <div className="flex-shrink-0 pb-safe">
        <p className="text-white/50 text-xs text-center mt-3 mb-2">拖曳移動・雙指縮放</p>
        <div className="flex items-center justify-center gap-3 pb-6 md:pb-4">
          {(['circle', 'square'] as const).map(s => (
            <button
              key={s}
              onClick={() => setShape(s)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                shape === s ? 'bg-white text-black' : 'bg-white/15 text-white'
              }`}
            >
              {s === 'circle' ? '圓形' : '正方形'}
            </button>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}
