import crypto from 'crypto';

interface TradeInfo {
  MerchantID: string;
  RespondType: 'JSON' | 'String';
  TimeStamp: string;
  Version: string;
  MerchantOrderNo: string;
  Amt: number;
  ItemDesc: string;
  Email?: string;
  LoginType?: 0 | 1 | 2;
  ReturnURL?: string;
  NotifyURL?: string;
  ClientBackURL?: string;
  [key: string]: any;
}

export function encryptTradeInfo(tradeInfo: TradeInfo, hashKey: string, hashIV: string): string {
  const params = new URLSearchParams();
  Object.entries(tradeInfo).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, value.toString());
    }
  });
  
  const data = params.toString();
  
  const cipher = crypto.createCipheriv('aes-256-cbc', hashKey, hashIV);
  cipher.setAutoPadding(true); // PKCS7 padding is default
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return encrypted;
}

export function decryptTradeInfo(encryptedData: string, hashKey: string, hashIV: string): any {
  const decipher = crypto.createDecipheriv('aes-256-cbc', hashKey, hashIV);
  decipher.setAutoPadding(true);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  // Clean up padding manually if needed, but aes-256-cbc usually handles it with autoPadding
  // Sometimes decrypted string has padding characters at the end if not handled correctly, but node crypto should be fine.
  
  try {
      return JSON.parse(decrypted);
  } catch (e) {
      // If not JSON, try query string parsing
      const result: any = {};
      const params = new URLSearchParams(decrypted);
      params.forEach((value, key) => {
          result[key] = value;
      });
      return result;
  }
}

export function generateTradeSha(tradeInfoAes: string, hashKey: string, hashIV: string): string {
  const raw = `HashKey=${hashKey}&${tradeInfoAes}&HashIV=${hashIV}`;
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  return sha.toUpperCase();
}
