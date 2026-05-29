import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    const ADMIN_PASSWORD = 'zjm1314520';
    if (token !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: '禁止访问' });
    }

    try {
        const keys = await kv.keys('log:*');
        if (keys.length === 0) {
            return res.status(200).json({ records: [] });
        }

        const records = [];
        for (const key of keys) {
            const raw = await kv.get(key);
            if (raw) {
                records.push(JSON.parse(raw));
            }
        }

        records.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.status(200).json({ records: records.slice(0, 50) });
    } catch (err) {
        res.status(500).json({ error: '读取记录失败' });
    }
}
