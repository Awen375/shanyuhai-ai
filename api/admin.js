import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') {
        return res.status(403).json({ error: '禁止访问' });
    }
    try {
        await kv.set('test_connection', 'ok');
        const val = await kv.get('test_connection');
        return res.status(200).json({ success: true, value: val });
    } catch (err) {
        return res.status(500).json({ error: 'KV连接失败: ' + err.message });
    }
}
