'use client';

import { Rocket, Heart, Shield, Users, Trophy, Gift, Star } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-20 transition-colors">
      <div className="max-w-3xl mx-auto md:pt-6 md:px-4">
        
        {/* Header */}
        <div className="px-4 py-4 md:hidden bg-white dark:bg-neutral-900 sticky top-0 z-10 shadow-sm">
           <h1 className="text-lg font-bold text-neutral-900 dark:text-white text-center">關於我們</h1>
        </div>

        <div className="hidden md:flex items-baseline gap-4 mb-6">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">關於我們</h1>
          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            ABOUT US
          </span>
        </div>

        <div className="space-y-4 px-4 md:px-0 mt-4 md:mt-0">
          
          {/* Hero / Intro Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6 md:p-8 text-center relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
              <Gift className="w-8 h-8 text-primary" />
            </div>
            
            <h2 className="text-xl md:text-2xl font-black text-neutral-900 dark:text-white mb-4 relative z-10">
              打造最公平、有趣的<br/>線上抽獎平台
            </h2>
            <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium max-w-lg mx-auto relative z-10">
              讓每一次的抽獎，都充滿期待與驚喜。我們致力於打破時間與空間的限制，讓動漫愛好者隨時隨地享受一番賞的樂趣。
            </p>
          </div>

          {/* Mission Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-100 dark:border-neutral-800">
              <Trophy className="w-5 h-5 text-primary" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">我們的使命</h3>
            </div>
            <div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              <p>
                一番賞線上抽成立於 2024 年，我們是一群熱愛動漫與收藏的團隊。我們深知每位收藏家對於喜愛角色的熱情，因此建立了這個平台。
              </p>
              <p>
                我們堅持 <span className="text-primary font-bold">公開透明的機率</span> 與 <span className="text-primary font-bold">公平的機制</span>，確保每一次的抽獎都是真實且公正的。所有的抽獎過程都經過嚴格驗證，讓您玩得安心。
              </p>
            </div>
          </div>

          {/* Values Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mb-3 text-blue-500">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">公平公正</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">機率透明，絕無後台操控</p>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mb-3 text-green-500">
                <Rocket className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">快速出貨</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">專業倉儲，安全送達</p>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mb-3 text-red-500">
                <Heart className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">優質服務</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">貼心客服，溫暖體驗</p>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-5 shadow-sm border border-neutral-100 dark:border-neutral-800 flex flex-col items-center text-center">
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mb-3 text-purple-500">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-1">社群互動</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">同好交流，分享喜悅</p>
            </div>
          </div>

          {/* Why Choose Us */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-sm border border-neutral-100 dark:border-neutral-800 p-6">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-neutral-100 dark:border-neutral-800">
              <Star className="w-5 h-5 text-yellow-500" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-white">為什麼選擇我們？</h3>
            </div>
            <div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-medium">
              <p>
                我們不僅僅是一個抽獎平台，更是一個連結收藏家與夢想的橋樑。我們與日本各大廠商緊密合作，確保提供最新、最豐富的正版商品。
              </p>
              <p>
                從網站的流暢體驗到收到商品的開箱驚喜，我們在意每一個細節。您的滿意與信任，是我們持續進步的最大動力。
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
