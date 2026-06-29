'use client'

import { ReactNode } from 'react'
import { Card } from './ui'
import { CardProps } from './ui'

interface PageCardProps extends Omit<CardProps, 'children'> {
  children: ReactNode
}

/**
 * PageCard 組件 - 使用統一的 Card 組件
 * @deprecated 建議直接使用 Card 組件
 */
export default function PageCard({ children, className = '', noPadding = false, ...props }: PageCardProps) {
  return (
    <Card noPadding={noPadding} className={className} {...props}>
      {children}
    </Card>
  )
}
