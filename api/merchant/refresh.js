import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });

    const token = auth.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString();
    const [id, password] = decoded.split(':');

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

    // 生成新 token，旧 token 立即失效
    const newToken = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    merchant.token_val = newToken;
    await kv.set(`merchant:${id}`, merchant);

    res.status(200).json({ success: true, token_val: newToken });
}
