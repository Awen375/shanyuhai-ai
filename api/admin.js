import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'shanyuhai2024') return res.status(403).json({ error: '禁止访问' }); // 改密码

    const keys = await kv.keys('log:*');
    if (keys.length === 0) return res.status(200).json({ records: [] });

    const records = [];
    for (const key of keys) {
        const raw = await kv.get(key);
        if (raw) records.push(JSON.parse(raw));
    }
    records.sort((a,b)=> new Date(b.time) - new Date(a.time));
    res.status(200).json({ records: records.slice(0, 50) });
}
