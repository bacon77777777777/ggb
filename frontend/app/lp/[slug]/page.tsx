'use client'

import { useParams, redirect } from 'next/navigation'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LpRedirectPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  useEffect(() => { router.replace(`/events/${slug}`) }, [slug, router])
  return null
}
