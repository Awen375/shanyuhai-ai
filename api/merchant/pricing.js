import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const pricing = await kv.get('config:pricing') || {
        items: [
            { amount: 10, price: '¥1' },
            { amount: 50, price: '¥5' },
            { amount: 100, price: '¥9' },
            { amount: 200, price: '¥16' }
        ],
        note: '请联系管理员充值'
    };
    res.status(200).json(pricing);
}
