import React from 'react';
import { Modal } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Image from 'next/image';

export interface WarehouseItem {
  id: string;
  name: string;
  series: string;
  grade: string;
  status: string;
  image: string;
  date: string;
  ticketNo: string;
  recycleValue: number;
}

interface WarehouseItemDetailModalProps {
  item: WarehouseItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function WarehouseItemDetailModal({ item, isOpen, onClose }: WarehouseItemDetailModalProps) {
  if (!item) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="獎項詳情" 
      className="max-w-md w-full"
    >
      <div className="space-y-6">
        {/* Image Section */}
        <div className="relative aspect-square w-full bg-item-bg rounded-2xl overflow-hidden shadow-inner">
          <Image 
            src={item.image || '/images/item.png'} 
            alt={item.name} 
            fill
            className="object-cover"
            unoptimized
          />
          <div className="absolute top-3 left-3">
             <span className="px-3 py-1 bg-neutral-900 text-white text-sm font-black rounded-lg shadow-sm border border-white/10 uppercase tracking-wider">
               {item.grade}賞
             </span>
          </div>
          {item.ticketNo && (
            <div className="absolute bottom-3 right-3">
              <span className="px-2 py-1 bg-white/90 backdrop-blur-sm text-neutral-900 text-xs font-black rounded-xl shadow-sm border border-neutral-200">
                No.{item.ticketNo}
              </span>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-black text-neutral-900 dark:text-white leading-tight">{item.name}</h3>
            <p className="text-sm text-neutral-400 font-bold mt-1 uppercase tracking-wider">{item.series}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
            <div className="space-y-1">
              <span className="text-xs text-neutral-400 font-bold block">獲得日期</span>
              <span className="text-sm font-black text-neutral-700 block">{item.date}</span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-neutral-400 font-bold block">回收價值</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black text-accent-red block">+{item.recycleValue}</span>
                <Image
                  src="/images/gcoin.png"
                  alt="G"
                  width={14}
                  height={14}
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
            <Button 
                variant="secondary" 
                fullWidth 
                onClick={onClose}
            >
                關閉
            </Button>
        </div>
      </div>
    </Modal>
  );
}
