import { signAdminSession } from './lib/adminSession'
const exp = Math.floor(Date.now()/1000)+3600
console.log(signAdminSession({adminId:'1',exp,role:'super_admin',permissions:['*']}))
