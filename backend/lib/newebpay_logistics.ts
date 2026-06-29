import { encryptTradeInfo, generateTradeSha } from './newebpay';

export interface LogisticsOrder {
  MerchantOrderNo: string;
  Amount: number;
  LogisticsType: 'CVS' | 'HOME';
  LogisticsSubType: 'UNIMART' | 'FAMI' | 'HILIFE' | 'OKMART' | 'TCAT' | 'HCT' | 'POST';
  ReceiverName: string;
  ReceiverCellPhone: string;
  ReceiverEmail?: string;
  ReceiverAddress?: string; // Required for HOME
  ReceiverStoreID?: string; // Required for CVS
  ReturnURL?: string; // Callback URL
  ClientReplyURL?: string; // Client redirect URL
  ServerReplyURL?: string; // Server callback
}

export function generateLogisticsForm(order: LogisticsOrder) {
  const MerchantID = process.env.NEWEBPAY_MERCHANT_ID || '';
  const HashKey = process.env.NEWEBPAY_HASH_KEY || '';
  const HashIV = process.env.NEWEBPAY_HASH_IV || '';
  const Version = '1.1'; // Standard version

  const tradeInfo = {
    MerchantID,
    MerchantOrderNo: order.MerchantOrderNo,
    Amount: Math.floor(order.Amount),
    LogisticsType: order.LogisticsType,
    LogisticsSubType: order.LogisticsSubType,
    ReceiverName: order.ReceiverName,
    ReceiverCellPhone: order.ReceiverCellPhone,
    ReceiverEmail: order.ReceiverEmail || '',
    ReceiverAddress: order.ReceiverAddress || '',
    ReceiverStoreID: order.ReceiverStoreID || '',
    ReturnURL: order.ReturnURL || `${process.env.NEXT_PUBLIC_API_URL}/api/logistics/callback`,
    ClientReplyURL: order.ClientReplyURL || '',
    ServerReplyURL: order.ServerReplyURL || '',
    TimeStamp: Math.floor(Date.now() / 1000).toString(),
    Status: '1' // 1: Create order immediately
  };

  // Filter undefined values
  const cleanTradeInfo: any = {};
  Object.entries(tradeInfo).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      cleanTradeInfo[key] = value;
    }
  });

  const TradeInfo = encryptTradeInfo(cleanTradeInfo, HashKey, HashIV);
  const TradeSha = generateTradeSha(TradeInfo, HashKey, HashIV);

  return {
    MerchantID,
    TradeInfo,
    TradeSha,
    Version,
    ActionURL: process.env.NEWEBPAY_LOGISTICS_API_URL || 'https://ccore.newebpay.com/API/mpl/orders/create' // Default to test environment
  };
}

export function generateMapForm(returnUrl: string, logisticsSubType: string = 'UNIMART') {
  const MerchantID = process.env.NEWEBPAY_MERCHANT_ID || '';
  const HashKey = process.env.NEWEBPAY_HASH_KEY || '';
  const HashIV = process.env.NEWEBPAY_HASH_IV || '';
  
  const tradeInfo = {
    MerchantID,
    MerchantTradeNo: 'M' + Date.now(), // Unique ID
    LogisticsType: 'CVS',
    LogisticsSubType: logisticsSubType,
    IsCollection: 'N', // No payment at pickup
    ServerReplyURL: returnUrl,
  };

  const TradeInfo = encryptTradeInfo(tradeInfo as any, HashKey, HashIV);
  const TradeSha = generateTradeSha(TradeInfo, HashKey, HashIV);

  return {
    MerchantID,
    TradeInfo,
    TradeSha,
    Version: '1.0',
    ActionURL: process.env.NEWEBPAY_LOGISTICS_MAP_URL || 'https://ccore.newebpay.com/API/Logistic/map'
  };
}
