import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });

    const token = auth.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString();
    const [id, password] = decoded.split(':');

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) {
        return res.status(401).json({ error: '登录信息失效' });
    }

    res.status(200).json({ id, name: merchant.name, balance: merchant.balance });
}
