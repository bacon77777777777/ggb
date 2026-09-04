"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* 原本是 redirect("/orders")（server 端轉址）；搬進來當一般元件用，改成掛上去就轉 */
export default function OpeningsIndexPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/orders"); }, [router]);
  return null;
}
