import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });

    const token = auth.split(' ')[1];
    let id, password;
    try {
        const decoded = Buffer.from(token, 'base64').toString();
        [id, password] = decoded.split(':');
    } catch (e) {
        return res.status(401).json({ error: '无效token' });
    }

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

    const { industry, keywords, product, extraNote } = req.body;

    await kv.set(`merchant:${id}:settings`, {
        industry: industry || '',
        keywords: keywords || '',
        product: product || '',
        extraNote: extraNote || ''
    });

    res.status(200).json({ success: true });
}
