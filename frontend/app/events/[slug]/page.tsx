'use client'

import { useParams } from 'next/navigation'
import LpRenderer from '@/components/lp/LpRenderer'

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>()
  return <LpRenderer slug={slug} />
}
