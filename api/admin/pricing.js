import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

    if (req.method === 'GET') {
        const pricing = await kv.get('config:pricing') || {
            items: [
                { amount: 10, price: '¥1' },
                { amount: 50, price: '¥5' },
                { amount: 100, price: '¥9' },
                { amount: 200, price: '¥16' }
            ],
            note: '请联系管理员充值'
        };
        return res.status(200).json(pricing);
    }

    if (req.method === 'POST') {
        const { items, note } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
        await kv.set('config:pricing', { items, note: note || '' });
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: '方法不允许' });
}
