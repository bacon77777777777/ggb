'use client'

import AdminLayout from '@/components/AdminLayout'
import DateRangePicker from '@/components/DateRangePicker'
import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { format } from 'date-fns'

// Types
interface DashboardStats {
  totalRevenue: number
  totalOrders: number
  totalUsers: number
  avgOrderValue: number
  revenueTrend: number
  ordersTrend: number
  usersTrend: number
  avgOrderTrend: number
}

interface ChartData {
  date: string
  value: number
  [key: string]: string | number
}

interface TopProduct {
  id: number
  name: string
  sales: number
  revenue: number
  image_url: string
}

interface RecentOrder {
  id: number
  order_number: string
  user: {
    name: string
    email: string
  }
  status: string
  created_at: string
  items_count: number
}

// 自適應寬度 hook
function useContainerWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    setWidth(ref.current.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return width
}

// Y軸智能格式化
function fmtY(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (Math.abs(v) >= 10) return String(Math.round(v))
  return String(Math.round(v * 10) / 10)
}

// 小型圖表組件（用於卡片內）
function MiniChart({ data, type, color, id }: { data: number[], type: 'line' | 'bar', color: string, id: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const width = 200
  const height = 50
  const padding = 2
  const maxValue = Math.max(...data)
  const minValue = Math.min(...data)
  const range = maxValue - minValue || 1

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-12 flex items-center justify-center text-neutral-300 text-xs">
        無數據
      </div>
    )
  }

  if (type === 'line') {
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1 || 1)) * (width - padding * 2)
      const y = height - padding - ((value - minValue) / range) * (height - padding * 2)
      return { x, y, value, index }
    })

    const pathData = points.map((point, index) => 
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    ).join(' ')
    
    // 如果只有一個點，無法繪製面積，只繪製線條
    const areaPath = points.length > 1 
      ? `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
      : ''

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      
      // 找到最接近的點
      let closestIndex = 0
      let minDistance = Math.abs(points[0].x - svgX)
      points.forEach((point, index) => {
        const distance = Math.abs(point.x - svgX)
        if (distance < minDistance) {
          minDistance = distance
          closestIndex = index
        }
      })
      
      setHoveredIndex(closestIndex)
      setHoverPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    const handleMouseLeave = () => {
      setHoveredIndex(null)
      setHoverPosition(null)
    }

    return (
      <div ref={containerRef} className="relative w-full h-12">
        <svg 
          width={width} 
          height={height} 
          className="w-full h-12"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {areaPath && (
            <path 
              d={areaPath}
              fill={`url(#gradient-${id})`}
            />
          )}
          <path 
            d={pathData} 
            fill="none" 
            stroke={color} 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          {/* 資料點 */}
          {points.map((point) => (
            <circle
              key={point.index}
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === point.index ? 4 : 0}
              fill={color}
              className="transition-all"
            />
          ))}
          {/* Hover 區域 */}
          {points.map((point, index) => {
            const hoverWidth = index < points.length - 1 
              ? (points[index + 1].x - point.x) / 2 
              : (point.x - (index > 0 ? points[index - 1].x : padding)) / 2
            const hoverX = index === 0 
              ? point.x 
              : point.x - (point.x - (index > 0 ? points[index - 1].x : padding)) / 2
            return (
              <rect
                key={`hover-${index}`}
                x={hoverX}
                y={0}
                width={hoverWidth}
                height={height}
                fill="transparent"
                onMouseEnter={() => {
                  setHoveredIndex(index)
                }}
                onMouseLeave={handleMouseLeave}
              />
            )
          })}
        </svg>
        {/* Hover 提示框 */}
        {hoveredIndex !== null && hoverPosition && (
          <div
            className="absolute bg-neutral-900 text-white text-xs rounded px-2 py-1 shadow-lg z-10 pointer-events-none whitespace-nowrap"
            style={{
              left: `${hoverPosition.x}px`,
              top: `${hoverPosition.y - 30}px`,
              transform: 'translateX(-50%)'
            }}
          >
            {data[hoveredIndex].toLocaleString()}
          </div>
        )}
      </div>
    )
  } else {
    const barWidth = (width - padding * 2) / data.length * 0.6
    const barGap = (width - padding * 2) / data.length * 0.4

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const svgX = e.clientX - rect.left
      
      // 找到對應的柱子
      const index = data.findIndex((_, i) => {
        const x = padding + i * (barWidth + barGap) + barGap / 2
        return svgX >= x && svgX <= x + barWidth
      })
      
      if (index !== -1) {
        setHoveredIndex(index)
        setHoverPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }
    }

    const handleMouseLeave = () => {
      setHoveredIndex(null)
      setHoverPosition(null)
    }

    return (
      <div ref={containerRef} className="relative w-full h-12">
        <svg 
          width={width} 
          height={height} 
          className="w-full h-12"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {data.map((value, index) => {
            const x = padding + index * (barWidth + barGap) + barGap / 2
            const barHeight = ((value - minValue) / range) * (height - padding * 2)
            const y = height - padding - barHeight
            return (
              <rect
                key={index}
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx="1"
                opacity={hoveredIndex === index ? 0.8 : 1}
                className="transition-opacity"
              />
            )
          })}
        </svg>
        {/* Hover 提示框 */}
        {hoveredIndex !== null && hoverPosition && (
          <div
            className="absolute bg-neutral-900 text-white text-xs rounded px-2 py-1 shadow-lg z-10 pointer-events-none whitespace-nowrap"
            style={{
              left: `${hoverPosition.x}px`,
              top: `${hoverPosition.y - 30}px`,
              transform: 'translateX(-50%)'
            }}
          >
            {data[hoveredIndex].toLocaleString()}
          </div>
        )}
      </div>
    )
  }
}

// 統計卡片組件
function StatCard({ title, value, unit, trend, trendValue, trendPeriod, chartData, chartType, chartColor, cardId, selectedPeriod }: {
  title: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down'
  trendValue?: number
  trendPeriod?: string
  chartData?: number[]
  chartType?: 'line' | 'bar'
  chartColor?: string
  cardId?: string
  selectedPeriod?: string
}) {
  // 根據選擇的時間段顯示對應的文字
  const getPeriodText = (period: string) => {
    const periodMap: { [key: string]: string } = {
      '日': '同日',
      '週': '同週',
      '月': '同月',
      '年': '同年'
    }
    return periodMap[period] || '同日'
  }
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4 hover:bg-neutral-50 transition-all h-full min-h-[100px] flex flex-col">
      <div className="flex items-start justify-between mb-1.5">
        <p className="text-sm text-neutral-600">
          {title}{unit && <span className="text-neutral-500">({unit})</span>}
        </p>
      </div>
      <p className="text-xl font-bold text-neutral-900 whitespace-nowrap font-mono mb-3">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <div className="mb-4 h-10 flex-shrink-0">
        {chartData && chartType && chartColor && cardId && (
          <MiniChart data={chartData} type={chartType} color={chartColor} id={cardId} />
        )}
      </div>
      {trend && trendValue && selectedPeriod && (
        <div className="flex items-center gap-1 text-xs text-neutral-600 mt-auto">
          <span>{getPeriodText(selectedPeriod)}相比 {trendValue}%</span>
          <svg className={`w-3 h-3 ${trend === 'up' ? 'text-emerald-600' : 'text-red-500'}`} fill="currentColor" viewBox="0 0 20 20">
            {trend === 'up' ? (
              <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
            )}
          </svg>
        </div>
      )}
    </div>
  )
}

// 趨勢圖表組件（單線）— 自適應寬度
function TrendChart({ title, data, colors }: {
  title: string,
  data: Array<{ date: string, value: number }>,
  colors: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgWidth = useContainerWidth(containerRef)
  const [hovered, setHovered] = useState<{ x: number; y: number; date: string; value: number } | null>(null)

  const CH = 180
  const pad = { top: 16, right: 16, bottom: 28, left: 48 }
  const maxV = Math.max(...data.map(d => d.value), 1)
  const range = maxV || 1
  const W = svgWidth || 600

  const pts = data.map((item, i) => {
    const x = pad.left + (i / Math.max(data.length - 1, 1)) * (W - pad.left - pad.right)
    const y = pad.top + (CH - pad.top - pad.bottom) * (1 - item.value / range)
    return { x, y, ...item }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = pts.length > 1
    ? `${linePath} L ${pts[pts.length - 1].x} ${CH - pad.bottom} L ${pts[0].x} ${CH - pad.bottom} Z`
    : ''

  const labelMinGap = 38
  const maxLabels = Math.max(1, Math.floor((W - pad.left - pad.right) / labelMinGap))
  const step = Math.max(1, Math.ceil(data.length / maxLabels))
  const dotR = data.length > 20 ? 2 : 3.5

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h3>
      <div ref={containerRef} className="relative w-full" style={{ height: CH }}>
        {svgWidth > 0 && (
          <svg width={W} height={CH} className="absolute inset-0">
            <defs>
              <linearGradient id={`area-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={colors[0]} stopOpacity="0.15" />
                <stop offset="100%" stopColor={colors[0]} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map(i => {
              const y = pad.top + (i / 4) * (CH - pad.top - pad.bottom)
              const v = maxV * (1 - i / 4)
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{fmtY(v)}</text>
                </g>
              )
            })}
            {areaPath && <path d={areaPath} fill={`url(#area-${title})`} />}
            <path d={linePath} fill="none" stroke={colors[0]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => {
              const showLabel = i % step === 0
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={dotR} fill={colors[0]} />
                  <circle cx={p.x} cy={p.y} r={12} fill="transparent"
                    onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }} />
                  {showLabel && (
                    <text x={p.x} y={CH - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">{p.date}</text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {hovered && (
          <div className="absolute bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg z-10 pointer-events-none whitespace-nowrap"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / CH) * 100}%`, transform: 'translate(-50%, -130%)' }}>
            <div className="font-medium">{hovered.date}</div>
            <div>{hovered.value.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// 多線折線圖組件 — 自適應寬度
function MultiLineChart({ title, data, series, colors }: {
  title: string,
  data: Array<{ date: string, [key: string]: string | number }>,
  series: Array<{ key: string, label: string }>,
  colors: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgWidth = useContainerWidth(containerRef)
  const [hovered, setHovered] = useState<{ x: number; y: number; date: string; values: { [k: string]: number } } | null>(null)

  const CH = 180
  const pad = { top: 16, right: 16, bottom: 28, left: 48 }
  const allVals = data.flatMap(d => series.map(s => Number(d[s.key]) || 0))
  const maxV = Math.max(...allVals, 1)
  const range = maxV || 1
  const W = svgWidth || 600
  const labelMinGap = 38
  const step = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((W - pad.left - pad.right) / labelMinGap))))
  const dotR = data.length > 20 ? 2 : 3.5

  const seriesPts = series.map(s =>
    data.map((item, i) => {
      const x = pad.left + (i / Math.max(data.length - 1, 1)) * (W - pad.left - pad.right)
      const v = Number(item[s.key]) || 0
      const y = pad.top + (CH - pad.top - pad.bottom) * (1 - v / range)
      return { x, y, v, date: item.date, key: s.key }
    })
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h3>
      <div ref={containerRef} className="relative w-full" style={{ height: CH }}>
        {svgWidth > 0 && (
          <svg width={W} height={CH} className="absolute inset-0">
            {[0, 1, 2, 3, 4].map(i => {
              const y = pad.top + (i / 4) * (CH - pad.top - pad.bottom)
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{fmtY(maxV * (1 - i / 4))}</text>
                </g>
              )
            })}
            {seriesPts.map((pts, si) => (
              <path key={si}
                d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                fill="none" stroke={colors[si % colors.length]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            ))}
            {data.map((item, i) => {
              const x = pad.left + (i / Math.max(data.length - 1, 1)) * (W - pad.left - pad.right)
              return (
                <g key={i}>
                  {seriesPts.map((pts, si) => (
                    <circle key={si} cx={pts[i].x} cy={pts[i].y} r={dotR} fill={colors[si % colors.length]} />
                  ))}
                  <rect x={x - 8} y={pad.top} width={16} height={CH - pad.top - pad.bottom} fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => {
                      const vals: { [k: string]: number } = {}
                      seriesPts.forEach(pts => { vals[pts[i].key] = pts[i].v })
                      setHovered({ x, y: seriesPts[0][i].y, date: item.date as string, values: vals })
                    }}
                    onMouseLeave={() => setHovered(null)}
                  />
                  {i % step === 0 && (
                    <text x={x} y={CH - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">{item.date}</text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {hovered && (
          <div className="absolute bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg z-10 pointer-events-none whitespace-nowrap"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / CH) * 100}%`, transform: 'translate(-50%, -130%)' }}>
            <div className="font-medium mb-0.5">{hovered.date}</div>
            {series.map(s => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[series.indexOf(s) % colors.length] }} />
                {s.label}: {(hovered.values[s.key] || 0).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-2">
        {series.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: colors[i % colors.length] }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}

// 柱狀圖組件 — 自適應寬度
function BarChart({ title, data, colors }: {
  title: string,
  data: Array<{ label: string, value: number }>,
  colors: string[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgWidth = useContainerWidth(containerRef)
  const [hovered, setHovered] = useState<{ x: number; y: number; label: string; value: number } | null>(null)

  const CH = 180
  const pad = { top: 16, right: 16, bottom: 28, left: 48 }
  const maxV = Math.max(...data.map(d => d.value), 1)
  const range = maxV || 1
  const W = svgWidth || 600
  const innerW = W - pad.left - pad.right
  const step = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 38))))
  const slotW = innerW / Math.max(data.length, 1)
  const barW = Math.max(slotW * 0.6, 2)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h3>
      <div ref={containerRef} className="relative w-full" style={{ height: CH }}>
        {svgWidth > 0 && (
          <svg width={W} height={CH} className="absolute inset-0">
            <defs>
              <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={colors[0]} stopOpacity="0.85" />
                <stop offset="100%" stopColor={colors[0]} stopOpacity="1" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map(i => {
              const y = pad.top + (i / 4) * (CH - pad.top - pad.bottom)
              return (
                <g key={i}>
                  <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                  <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{fmtY(maxV * (1 - i / 4))}</text>
                </g>
              )
            })}
            {data.map((item, i) => {
              const cx = pad.left + (i + 0.5) * slotW
              const bh = Math.max((item.value / range) * (CH - pad.top - pad.bottom), 1)
              const y = CH - pad.bottom - bh
              return (
                <g key={i}>
                  <rect x={cx - barW / 2} y={y} width={barW} height={bh} fill="url(#barGrad)" rx="2"
                    onMouseEnter={() => setHovered({ x: cx, y, label: item.label, value: item.value })}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'pointer' }}
                    className="hover:opacity-75 transition-opacity"
                  />
                  {i % step === 0 && (
                    <text x={cx} y={CH - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">{item.label}</text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
        {hovered && (
          <div className="absolute bg-neutral-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg z-10 pointer-events-none whitespace-nowrap"
            style={{ left: `${(hovered.x / W) * 100}%`, top: `${(hovered.y / CH) * 100}%`, transform: 'translate(-50%, -130%)' }}>
            <div className="font-medium">{hovered.label}</div>
            <div>{hovered.value.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// 圓餅圖組件
function PieChart({ title, data, colors }: { 
  title: string, 
  data: Array<{ label: string, value: number }>, 
  colors: string[]
}) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null)
  
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const chartSize = 300
  const centerX = chartSize / 2
  const centerY = chartSize / 2
  const radius = 100
  const innerRadius = 0 // 實心圓餅圖，設為 0 可改為甜甜圈圖

  if (total > 0 && data.length === 1) {
    const only = data[0]
    const slice = {
      ...only,
      percentage: 100,
      labelX: centerX,
      labelY: centerY,
      color: colors[0] || '#9333EA',
    }

    return (
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        </div>
        <div className="flex items-center justify-center gap-6">
          <div className="relative">
            <svg width={chartSize} height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`}>
              <circle
                cx={centerX}
                cy={centerY}
                r={radius}
                fill={slice.color}
                stroke="white"
                strokeWidth="2"
                onMouseEnter={() => setHoveredSlice(0)}
                onMouseLeave={() => setHoveredSlice(null)}
                style={{ cursor: 'pointer' }}
                className="transition-opacity"
              />
              {hoveredSlice === 0 ? (
                <text
                  x={slice.labelX}
                  y={slice.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-sm fill-white font-semibold pointer-events-none"
                >
                  100.0%
                </text>
              ) : null}
            </svg>
            {hoveredSlice === 0 ? (
              <div
                className="absolute bg-neutral-900 text-white text-base rounded-lg px-3 py-2 shadow-lg z-10 pointer-events-none"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className="font-semibold whitespace-nowrap">{slice.label}</div>
                <div className="whitespace-nowrap">{slice.value.toLocaleString()} (100.0%)</div>
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onMouseEnter={() => setHoveredSlice(0)}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: slice.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900">{slice.label}</p>
                <p className="text-xs text-neutral-500">{slice.value.toLocaleString()} (100.0%)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  let currentAngle = -90 // 從頂部開始（-90度）
  
  const slices = data.map((item, index) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0
    const angle = total > 0 ? (item.value / total) * 360 : 0
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle
    
    // 計算扇形路徑
    const startAngleRad = (startAngle * Math.PI) / 180
    const endAngleRad = (endAngle * Math.PI) / 180
    
    const x1 = centerX + radius * Math.cos(startAngleRad)
    const y1 = centerY + radius * Math.sin(startAngleRad)
    const x2 = centerX + radius * Math.cos(endAngleRad)
    const y2 = centerY + radius * Math.sin(endAngleRad)
    
    const largeArcFlag = angle > 180 ? 1 : 0
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ')
    
    // 計算標籤位置（在扇形中間）
    const labelAngle = (startAngle + endAngle) / 2
    const labelAngleRad = (labelAngle * Math.PI) / 180
    const labelRadius = radius * 0.7
    const labelX = centerX + labelRadius * Math.cos(labelAngleRad)
    const labelY = centerY + labelRadius * Math.sin(labelAngleRad)
    
    return {
      pathData,
      percentage,
      labelX,
      labelY,
      color: colors[index % colors.length],
      ...item
    }
  })
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      </div>
      <div className="flex items-center justify-center gap-6">
        <div className="relative">
          <svg width={chartSize} height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`}>
            {slices.map((slice, index) => (
              <g key={index}>
                <path
                  d={slice.pathData}
                  fill={slice.color}
                  stroke="white"
                  strokeWidth="2"
                  onMouseEnter={() => setHoveredSlice(index)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  style={{ cursor: 'pointer' }}
                  className="transition-opacity"
                  opacity={hoveredSlice !== null && hoveredSlice !== index ? 0.5 : 1}
                />
                {hoveredSlice === index && (
                  <text
                    x={slice.labelX}
                    y={slice.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm fill-white font-semibold pointer-events-none"
                  >
                    {slice.percentage.toFixed(1)}%
                  </text>
                )}
              </g>
            ))}
          </svg>
          {/* Hover提示框 */}
          {hoveredSlice !== null && (
            <div
              className="absolute bg-neutral-900 text-white text-base rounded-lg px-3 py-2 shadow-lg z-10 pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className="font-semibold whitespace-nowrap">{slices[hoveredSlice].label}</div>
              <div className="whitespace-nowrap">{slices[hoveredSlice].value.toLocaleString()} ({slices[hoveredSlice].percentage.toFixed(1)}%)</div>
            </div>
          )}
        </div>
        {/* 圖例 */}
        <div className="space-y-3">
          {slices.map((slice, index) => (
            <div 
              key={index} 
              className="flex items-center gap-3 cursor-pointer"
              onMouseEnter={() => setHoveredSlice(index)}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              <div 
                className="w-4 h-4 rounded flex-shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900">{slice.label}</p>
                <p className="text-xs text-neutral-500">{slice.value.toLocaleString()} ({slice.percentage.toFixed(1)}%)</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// 排名列表組件
function RankingList({ title, data, limit = 10 }: { title: string, data: Array<{ name: string, value: number | string, change?: number }>, limit?: number }) {
  const displayData = Array(limit).fill(null).map((_, index) => {
    return data[index] || { name: '-', value: '-', change: undefined }
  })

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
      <h3 className="text-lg font-semibold text-neutral-900 mb-3">{title}</h3>
      <div className="space-y-1">
        {displayData.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                index < 3 ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-600'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${item.name === '-' ? 'text-neutral-400' : 'text-neutral-900'}`}>{item.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-10 flex-shrink-0">
              {item.change !== undefined && (
                <div className={`text-xs text-right w-16 ${item.change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {item.change >= 0 ? '+' : ''}{item.change}%
                </div>
              )}
              <div className="text-right w-20">
                <p className={`text-sm font-semibold ${item.value === '-' ? 'text-neutral-400' : 'text-neutral-900'}`}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [cardPeriod, setCardPeriod] = useState('日')
  const [dateRangeStart, setDateRangeStart] = useState('')
  const [dateRangeEnd, setDateRangeEnd] = useState('')
  const [isCustomDateRange, setIsCustomDateRange] = useState(false)
  const [chartPeriods, setChartPeriods] = useState<{ [key: string]: string }>({
    visitTrend: '日',
    rechargeTrend: '日',
    rechargeConsume: '日',
    dailyDraws: '日',
    categoryDraws: '日',
    tokenBalance: '日',
  })

  const [stats, setStats] = useState<any>({
    totalRecharge: { value: 0, trend: 'up', trendValue: 0, title: '總儲值金額', unit: 'TWD', chartData: [], chartType: 'line', chartColor: '#9333EA' },
    tokenConsumed: { value: 0, trend: 'down', trendValue: 0, title: '消耗代幣', unit: 'G', chartData: [], chartType: 'bar', chartColor: '#10b981' },
    totalDraws: { value: 0, trend: 'up', trendValue: 0, title: '抽獎次數', unit: '次', chartData: [], chartType: 'line', chartColor: '#F59E0B' },
  totalTokenBalance: { value: 0, trend: 'down', trendValue: 0, title: '總代幣餘額', unit: 'G', chartData: [], chartType: 'line', chartColor: '#EF4444' },
  abcPrizeCount: { value: 0, trend: 'up', trendValue: 0, title: 'ABC賞已出數量', unit: '個', chartData: [], chartType: 'bar', chartColor: '#9333EA' },
  visitCount: { value: 0, trend: 'down', trendValue: 0, title: '訪問量', unit: '次', chartData: [], chartType: 'line', chartColor: '#9333EA' },
  registeredUsers: { value: 0, trend: 'up', trendValue: 0, title: '註冊量', unit: '人', chartData: [], chartType: 'line', chartColor: '#10b981' },
    conversionRate: { value: '0%', trend: 'down', trendValue: 0, title: '轉化率(已註冊且儲值)', unit: '', chartData: [], chartType: 'line', chartColor: '#F59E0B' },
  })
  
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [topKeywords, setTopKeywords] = useState<any[]>([])
  const [topSeries, setTopSeries] = useState<any[]>([])
  const [behaviorStats, setBehaviorStats] = useState({ clickTotal: 0, converted: 0, conversionRate: 0 })
  const [dauData, setDauData] = useState<Array<{ date: string; value: number }>>([])
  const [mainChartData, setMainChartData] = useState({
    visitTrend: [] as any[],
    rechargeTrend: [] as any[],
    rechargeConsume: [] as any[],
    dailyDraws: [] as any[],
    categoryDraws: [] as any[],
  })

  // Log visit
  useEffect(() => {
    const logVisit = async () => {
      try {
        await fetch('/api/stats/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page_path: '/dashboard',
            user_agent: navigator.userAgent
          })
        })
      } catch (e) {
        console.error('Failed to log visit:', e)
      }
    }
    logVisit()
  }, [])

  // 根據時間段計算日期範圍
  const calculateDateRangeByPeriod = (period: string) => {
    const today = new Date()
    const endDate = new Date(today)
    endDate.setHours(23, 59, 59, 999)
    
    let startDate = new Date(today)
    
    if (period === '日') {
      // 當日
      // startDate is already today
    } else if (period === '週') {
      // 最近7天
      startDate.setDate(today.getDate() - 6)
    } else if (period === '月') {
      // 最近30天
      startDate.setDate(today.getDate() - 29)
    } else if (period === '年') {
      // 最近1年
      startDate.setFullYear(today.getFullYear() - 1)
    }
    
    startDate.setHours(0, 0, 0, 0)
    
    const formatDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    
    return {
      start: formatDate(startDate),
      end: formatDate(endDate)
    }
  }

  // 初始化日期範圍
  useEffect(() => {
    const dateRange = calculateDateRangeByPeriod(cardPeriod)
    setDateRangeStart(dateRange.start)
    setDateRangeEnd(dateRange.end)
  }, [])

  // 當時間段改變時，自動更新日期範圍（如果沒有自訂日期）
  useEffect(() => {
    if (!isCustomDateRange) {
      const dateRange = calculateDateRangeByPeriod(cardPeriod)
      setDateRangeStart(dateRange.start)
      setDateRangeEnd(dateRange.end)
    }
  }, [cardPeriod, isCustomDateRange])

  // Fetch Dashboard Data
  useEffect(() => {
    if (!dateRangeStart || !dateRangeEnd) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const startDate = new Date(dateRangeStart)
        const endDate = new Date(dateRangeEnd)
        // Add one day to end date to include the whole day
        const queryEndDate = new Date(endDate)
        queryEndDate.setDate(queryEndDate.getDate() + 1)

        // Helper to generate date array for charts
        const getDatesArray = (start: Date, end: Date) => {
          const arr = []
          for(let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)){
              arr.push(new Date(dt))
          }
          return arr
        }
        const dates = getDatesArray(startDate, endDate)
        
        // Determine if we are in Daily View (Hourly data) or Range View (Daily data)
        const isDailyView = dates.length === 1
        
        let timeSlots: any[] = []
        let getLabel: (slot: any) => string
        let getFilterFn: (slot: any, createdAt: string) => boolean
        
        if (isDailyView) {
            const targetDate = dates[0]
            const targetYear = targetDate.getFullYear()
            const targetMonth = targetDate.getMonth()
            const targetDay = targetDate.getDate()
            
            timeSlots = Array.from({length: 24}, (_, i) => i) // 0..23
            getLabel = (hour: any) => `${String(hour).padStart(2, '0')}:00`
            getFilterFn = (hour: any, createdAt: string) => {
                 const d = new Date(createdAt)
                 return d.getDate() === targetDay && 
                        d.getMonth() === targetMonth &&
                        d.getFullYear() === targetYear &&
                        d.getHours() === hour
            }
        } else {
            timeSlots = dates
            getLabel = (date: any) => format(date, 'MM/dd')
            getFilterFn = (date: any, createdAt: string) => {
                return createdAt.startsWith(format(date, 'yyyy-MM-dd'))
            }
        }

        const dashboardRes = await fetch(`/api/admin/dashboard?start=${dateRangeStart}&end=${dateRangeEnd}`)
        if (!dashboardRes.ok) {
          const data = await dashboardRes.json().catch(() => null)
          throw new Error(data?.error || 'Dashboard API 載入失敗')
        }
        const { recharges, draws, users } = (await dashboardRes.json()) as {
          recharges: Array<{ amount: number; created_at: string; user_id: string }>
          draws: Array<{ created_at: string; prize_level: string; products?: { id: number; name: string; price: number; type: string | null; category: any } | null }>
          users: Array<{ created_at: string; tokens: number; id: string }>
        }

        // 3.5 Fetch Search & Visit Stats from API (to handle missing tables gracefully)
        let searchStats = { topKeywords: [] }
        let visitStats = { totalVisits: 0, totalVisitsPeriod: 0, trend: 0, chartData: [] as number[] }
        
        try {
          const searchRes = await fetch(`/api/stats/search?period=${cardPeriod === '月' ? '30d' : '7d'}`)
          if (searchRes.ok) searchStats = await searchRes.json()

          const visitRes = await fetch(`/api/stats/visit?start=${dateRangeStart}&end=${dateRangeEnd}`)
          if (visitRes.ok) visitStats = await visitRes.json()
        } catch (e) {
          console.error('Error fetching analytics stats:', e)
        }

        // Filter users by date for registration stats
        const newUsers = users.filter(u => {
          const d = new Date(u.created_at)
          return d >= startDate && d < queryEndDate
        })

        // 4. Calculate Stats
        
        // Total Revenue
        const totalRevenue = recharges?.reduce((sum, r) => sum + r.amount, 0) || 0
        
        // Revenue Chart Data
        const revenueByDay = timeSlots.map(slot => {
          const slotRecharges = recharges?.filter(r => getFilterFn(slot, r.created_at))
          return slotRecharges?.reduce((sum, r) => sum + r.amount, 0) || 0
        })

        const rechargeTrendData = timeSlots.map(slot => ({
          date: getLabel(slot),
          value: recharges?.filter(r => getFilterFn(slot, r.created_at)).reduce((sum, r) => sum + r.amount, 0) || 0
        }))

        // Token Consumed
        const tokenConsumed = draws?.reduce((sum, d: any) => sum + (d.products?.price || 0), 0) || 0
        const tokenConsumedByDay = timeSlots.map(slot => {
          const slotDraws = draws?.filter(d => getFilterFn(slot, d.created_at))
          return slotDraws?.reduce((sum, d: any) => sum + (d.products?.price || 0), 0) || 0
        })

        const consumeTrendData = timeSlots.map(slot => ({
          date: getLabel(slot),
          value: draws?.filter(d => getFilterFn(slot, d.created_at)).reduce((sum, d: any) => sum + (d.products?.price || 0), 0) || 0
        }))

        // Recharge vs Consume Data
        const rechargeConsumeData = timeSlots.map(slot => {
          const dateLabel = getLabel(slot)
          const slotRecharges = recharges?.filter(r => getFilterFn(slot, r.created_at))?.reduce((sum, r) => sum + r.amount, 0) || 0
          const slotConsume = draws?.filter(d => getFilterFn(slot, d.created_at))?.reduce((sum, d: any) => sum + (d.products?.price || 0), 0) || 0
          return {
            date: dateLabel,
            recharge: slotRecharges,
            consume: slotConsume
          }
        })

        // Total Draws
        const totalDraws = draws?.length || 0
        const drawsByDay = timeSlots.map(slot => {
          return draws?.filter(d => getFilterFn(slot, d.created_at)).length || 0
        })

        const dailyDrawsData = timeSlots.map(slot => ({
          label: getLabel(slot),
          value: draws?.filter(d => getFilterFn(slot, d.created_at)).length || 0
        }))

        // Token Balance (Snapshot of current total)
        const totalTokenBalance = users.reduce((sum, u) => sum + (u.tokens || 0), 0)
        // Mocking balance trend since we don't have balance history
        const balanceData = timeSlots.map(() => totalTokenBalance) 

        const isABCPrizeLevel = (level: unknown) => {
          const s = String(level || '').trim()
          if (!s) return false
          if (/^[ABC]$/.test(s)) return true
          if (/^[ABC]賞$/.test(s)) return true
          const upper = s.toUpperCase()
          if (upper === 'A' || upper === 'B' || upper === 'C') return true
          return false
        }

        const abcPrizes = draws?.filter((d: any) => isABCPrizeLevel(d.prize_level)).length || 0
        const abcByDay = timeSlots.map((slot) => {
          return (
            draws?.filter((d: any) => getFilterFn(slot, d.created_at) && isABCPrizeLevel(d.prize_level)).length || 0
          )
        })

        // Registered Users
        const registeredCount = newUsers.length
        const usersByDay = timeSlots.map(slot => {
          return newUsers.filter(u => getFilterFn(slot, u.created_at)).length
        })

        // Conversion Rate
        const payingUserIdsInPeriod = new Set(recharges?.map(r => r.user_id))
        const newPayingUsers = newUsers.filter(u => payingUserIdsInPeriod.has(u.id))
        const conversionVal = newUsers.length > 0 ? (newPayingUsers.length / newUsers.length) * 100 : 0
        const conversionRateData = timeSlots.map(() => conversionVal)

        // Top Products Calculation
        const productStats = new Map<string, {name: string, sales: number, revenue: number}>()
        draws?.forEach((d: any) => {
          if (d.products) {
             const pid = d.products.id
             const current = productStats.get(pid) || { name: d.products.name, sales: 0, revenue: 0 }
             current.sales += 1
             current.revenue += d.products.price || 0
             productStats.set(pid, current)
          }
        })
        const topProductsList = Array.from(productStats.values())
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 15)
          .map(p => ({
            name: p.name,
            value: p.sales,
            change: 0
          }))
        
        setTopProducts(topProductsList)

        // Visit Count Stats
        const visitCountVal = visitStats.totalVisitsPeriod || visitStats.totalVisits || 0
        const visitsByDay = visitStats.chartData || []
        const visitTrendVal = visitStats.trend || 0

        // Category Draws — group by product type (Chinese label)
        const typeLabels: Record<string, string> = {
          gacha: '轉蛋', ichiban: '一番賞', blindbox: '盲盒',
          card: '卡牌', sell: '二手', custom: '客製', exchange: '交換',
        }
        const categoryStats = new Map<string, number>()
        draws?.forEach((d: any) => {
          const raw = d.products?.type || d.products?.category || ''
          const label = typeLabels[raw] || raw || '其他'
          categoryStats.set(label, (categoryStats.get(label) || 0) + 1)
        })
        const categoryDrawsData = Array.from(categoryStats.entries()).map(([label, value]) => ({ label, value }))

        setStats({
          totalRecharge: { 
            value: totalRevenue, 
            trend: 'up', 
            trendValue: 0, 
            title: '總儲值金額', 
            unit: 'TWD', 
            chartData: revenueByDay, 
            chartType: 'line', 
            chartColor: '#9333EA' 
          },
          tokenConsumed: { 
            value: tokenConsumed, 
            trend: 'down', 
            trendValue: 0, 
            title: '消耗代幣', 
            unit: 'G', 
            chartData: tokenConsumedByDay, 
            chartType: 'bar', 
            chartColor: '#10b981' 
          },
          totalDraws: { 
            value: totalDraws, 
            trend: 'up', 
            trendValue: 0, 
            title: '抽獎次數', 
            unit: '次', 
            chartData: drawsByDay, 
            chartType: 'line', 
            chartColor: '#F59E0B' 
          },
          totalTokenBalance: { 
            value: totalTokenBalance, 
            trend: 'down', 
            trendValue: 0, 
            title: '總代幣餘額', 
            unit: 'G', 
            chartData: balanceData, 
            chartType: 'line', 
            chartColor: '#EF4444' 
          },
          abcPrizeCount: { 
            value: abcPrizes, 
            trend: 'up', 
            trendValue: 0, 
            title: 'ABC賞已出數量', 
            unit: '個', 
            chartData: abcByDay, 
            chartType: 'bar', 
            chartColor: '#9333EA' 
          },
          visitCount: { 
            value: visitCountVal, 
            trend: visitTrendVal >= 0 ? 'up' : 'down', 
            trendValue: Math.abs(visitTrendVal), 
            title: '訪問量', 
            unit: '次', 
            chartData: visitsByDay, 
            chartType: 'line', 
            chartColor: '#9333EA' 
          },
          registeredUsers: { 
            value: registeredCount, 
            trend: 'up', 
            trendValue: 0, 
            title: '註冊量', 
            unit: '人', 
            chartData: usersByDay, 
            chartType: 'line', 
            chartColor: '#10b981' 
          },
          conversionRate: { 
            value: conversionVal.toFixed(1) + '%', 
            trend: 'down', 
            trendValue: 0, 
            title: '期間轉化率', 
            unit: '', 
            chartData: conversionRateData, 
            chartType: 'line', 
            chartColor: '#F59E0B' 
          },
        })

        setMainChartData({
          visitTrend: [],
          rechargeTrend: rechargeTrendData,
          rechargeConsume: rechargeConsumeData,
          dailyDraws: dailyDrawsData,
          categoryDraws: categoryDrawsData
        })

        // 用戶行為數據
        try {
          const behaviorRes = await fetch(`/api/admin/reports?tab=behavior&start=${dateRangeStart}&end=${dateRangeEnd}`)
          if (behaviorRes.ok) {
            const b = await behaviorRes.json()
            setBehaviorStats({
              clickTotal: b.clickTotal || 0,
              converted: b.converted || 0,
              conversionRate: b.conversionRate || 0,
            })
            setDauData((b.dailyActiveUsers || []).map((d: any) => ({ date: d.date, value: d.count })))
            setTopSeries((b.topSeries || []).slice(0, 15).map((s: any) => ({ name: s.series, value: s.count })))
            setTopKeywords((b.topSearches || []).slice(0, 15).map((s: any) => ({ name: s.query, value: s.count })))
          }
        } catch (e) {
          console.error('behavior fetch error', e)
        }

      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dateRangeStart, dateRangeEnd])

  // 當用戶手動選擇日期時，標記為自訂日期範圍
  const handleStartDateChange = (value: string) => {
    setDateRangeStart(value)
    setIsCustomDateRange(true)
  }

  const handleEndDateChange = (value: string) => {
    setDateRangeEnd(value)
    setIsCustomDateRange(true)
  }

  // 處理時間段切換
  const handlePeriodChange = (period: string) => {
    setCardPeriod(period)
    setIsCustomDateRange(false)
  }

  const handleChartPeriodChange = (chartKey: string, period: string) => {
    setChartPeriods(prev => ({ ...prev, [chartKey]: period }))
  }

  return (
    <AdminLayout pageTitle="儀表板" breadcrumbs={[{ label: '儀表板', href: '/dashboard' }]}>
      <div className="space-y-4">
        {/* 時間段選擇按鈕 */}
        <div className="flex items-center justify-end gap-3 mb-2">
          <div className="w-64">
            <DateRangePicker
              startDate={dateRangeStart}
              endDate={dateRangeEnd}
              onStartDateChange={handleStartDateChange}
              onEndDateChange={handleEndDateChange}
              placeholder="選擇日期範圍"
            />
          </div>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-1">
            {['日', '週', '月', '年'].map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  !isCustomDateRange && cardPeriod === p
                    ? 'bg-primary text-white'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 主要統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={stats.totalRecharge.title}
            value={stats.totalRecharge.value}
            unit={stats.totalRecharge.unit}
            trend={stats.totalRecharge.trend}
            trendValue={stats.totalRecharge.trendValue}
            chartData={stats.totalRecharge.chartData}
            chartType={stats.totalRecharge.chartType}
            chartColor={stats.totalRecharge.chartColor}
            cardId="totalRecharge"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.tokenConsumed.title}
            value={stats.tokenConsumed.value}
            unit={stats.tokenConsumed.unit}
            trend={stats.tokenConsumed.trend}
            trendValue={stats.tokenConsumed.trendValue}
            chartData={stats.tokenConsumed.chartData}
            chartType={stats.tokenConsumed.chartType}
            chartColor={stats.tokenConsumed.chartColor}
            cardId="tokenConsumed"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.totalDraws.title}
            value={stats.totalDraws.value}
            unit={stats.totalDraws.unit}
            trend={stats.totalDraws.trend}
            trendValue={stats.totalDraws.trendValue}
            chartData={stats.totalDraws.chartData}
            chartType={stats.totalDraws.chartType}
            chartColor={stats.totalDraws.chartColor}
            cardId="totalDraws"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.totalTokenBalance.title}
            value={stats.totalTokenBalance.value}
            unit={stats.totalTokenBalance.unit}
            trend={stats.totalTokenBalance.trend}
            trendValue={stats.totalTokenBalance.trendValue}
            chartData={stats.totalTokenBalance.chartData}
            chartType={stats.totalTokenBalance.chartType}
            chartColor={stats.totalTokenBalance.chartColor}
            cardId="totalTokenBalance"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.abcPrizeCount.title}
            value={stats.abcPrizeCount.value}
            unit={stats.abcPrizeCount.unit}
            trend={stats.abcPrizeCount.trend}
            trendValue={stats.abcPrizeCount.trendValue}
            chartData={stats.abcPrizeCount.chartData}
            chartType={stats.abcPrizeCount.chartType}
            chartColor={stats.abcPrizeCount.chartColor}
            cardId="abcPrizeCount"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.visitCount.title}
            value={stats.visitCount.value}
            unit={stats.visitCount.unit}
            trend={stats.visitCount.trend}
            trendValue={stats.visitCount.trendValue}
            chartData={stats.visitCount.chartData}
            chartType={stats.visitCount.chartType}
            chartColor={stats.visitCount.chartColor}
            cardId="visitCount"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.registeredUsers.title}
            value={stats.registeredUsers.value}
            unit={stats.registeredUsers.unit}
            trend={stats.registeredUsers.trend}
            trendValue={stats.registeredUsers.trendValue}
            chartData={stats.registeredUsers.chartData}
            chartType={stats.registeredUsers.chartType}
            chartColor={stats.registeredUsers.chartColor}
            cardId="registeredUsers"
            selectedPeriod={cardPeriod}
          />
          <StatCard
            title={stats.conversionRate.title}
            value={stats.conversionRate.value}
            unit={stats.conversionRate.unit}
            trend={stats.conversionRate.trend}
            trendValue={stats.conversionRate.trendValue}
            chartData={stats.conversionRate.chartData}
            chartType={stats.conversionRate.chartType}
            chartColor={stats.conversionRate.chartColor}
            cardId="conversionRate"
            selectedPeriod={cardPeriod}
          />
          <StatCard title="點擊商品數（去重）" value={behaviorStats.clickTotal} unit="次" cardId="clickTotal" selectedPeriod={cardPeriod} />
          <StatCard title="點擊後成功抽獎" value={behaviorStats.converted} unit="次" cardId="converted" selectedPeriod={cardPeriod} />
          <StatCard title="點擊→抽轉化率" value={`${behaviorStats.conversionRate}%`} unit="" cardId="clickConversion" selectedPeriod={cardPeriod} />
        </div>

        {/* DAU 每日活躍用戶 */}
        <TrendChart title="每日活躍用戶（DAU）" data={dauData} colors={['#6366f1']} />

        {/* 圖表區域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TrendChart 
            title="儲值金額趨勢" 
            data={mainChartData.rechargeTrend} 
            colors={['#10b981']}
          />
          <MultiLineChart 
            title="儲值與消耗對比" 
            data={mainChartData.rechargeConsume}
            series={[
              { key: 'recharge', label: '儲值金額' },
              { key: 'consume', label: '消耗代幣' }
            ]}
            colors={['#9333EA', '#10b981']}
          />
        </div>

        {/* 多線圖表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
           <BarChart 
            title="抽獎次數" 
            data={mainChartData.dailyDraws}
            colors={['#9333EA', '#A855F7', '#C084FC', '#D8B4FE']}
          />
          <PieChart 
            title="分類抽獎次數對比" 
            data={mainChartData.categoryDraws}
            colors={['#9333EA', '#10b981', '#F59E0B', '#EF4444']}
          />
        </div>

        {/* 排名列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RankingList title="最多點擊系列 TOP 15" data={topSeries} limit={15} />
          <RankingList title="熱門商品 TOP 15" data={topProducts} limit={15} />
          <RankingList title="熱門搜尋字 TOP 15" data={topKeywords} limit={15} />
        </div>
      </div>
    </AdminLayout>
  )
}
