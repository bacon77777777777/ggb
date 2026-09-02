'use client';

/*
 * 交易所的商品卡 —— 商城 .pcard 的交易所版。
 *
 * ⚠️ 這裡刻意**不用** components/ProductCard：那張卡是抽獎商品用的
 * （價格、剩餘籤數、機台類型），交易所賣的是「別人抽到的單一品項」，
 * 要顯示的是賞等、賣家與 G 幣價格。老闆 2026-09-01 指定照商城的卡片語言。
 */

import Image from 'next/image';
import { asset } from '@/lib/asset';
import { gradeRank } from '@/lib/prizeGrade';
import type { Listing } from '@/app/market/data';
import { gnum, hue } from './ui';

const FALLBACK = asset('/images/item_defaulet.webp');

export default function PrizeCard({ item, onClick }: { item: Listing; onClick: () => void }) {
  return (
    <button type="button" className="pcard" onClick={onClick}>
      <div className="pimg" style={{ background: '#F7F7F7' }}>
        <Image
          src={item.prizeImage || FALLBACK}
          alt=""
          fill
          sizes="(max-width: 768px) 50vw, 240px"
          className="object-contain"
          unoptimized
        />
        {/* 大獎（最後賞／隱藏／A／SP）紅標搶眼，B賞以下黑標（老闆 2026-09-02） */}
        {item.prizeLevel && (
          <span className={`lvbadge${gradeRank(item.prizeLevel) > 2 ? ' lvbadge--minor' : ''}`}>
            {item.prizeLevel}
          </span>
        )}
      </div>
      <div className="pbody">
        <div className="ptitle">{item.prizeName}</div>
        {/* 金額照首頁 ProductCard：14px 的 G 幣圖標 + 24px/900 的金額紅（老闆 2026-09-01） */}
        <div className="gprice">
          <Image src={asset('/images/gcoin.webp')} alt="G" width={14} height={14} className="gc object-contain" unoptimized />
          <b>{gnum(item.price)}</b>
        </div>
        <div className="pshop">
          <span className="dot" style={{ background: hue(item.sellerName) }} />
          <span className="nm">{item.sellerName}</span>
        </div>
        <div className="tags">
          {item.productName && <span className="tg tg--pay">{item.productName}</span>}
        </div>
      </div>
    </button>
  );
}
