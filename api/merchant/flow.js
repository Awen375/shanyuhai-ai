import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });

    const token = auth.split(' ')[1];
    const decoded = Buffer.from(token, 'base64').toString();
    const [id, password] = decoded.split(':');

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

    const keys = await kv.keys(`flow:${id}:*`);
    const flows = [];
    for (const key of keys) {
        const raw = await kv.get(key);
        if (raw) {
            try { flows.push(JSON.parse(raw)); } catch (e) {}
        }
    }
    flows.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.status(200).json({ flows });
}
