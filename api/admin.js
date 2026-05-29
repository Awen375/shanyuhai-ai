import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') {
        return res.status(403).json({ error: '禁止访问' });
    }

    try {
        // 获取所有 log: 开头的键
        const keys = await kv.keys('log:*');
        if (!keys || keys.length === 0) {
            return res.status(200).json({ records: [] });
        }

        const records = [];
        for (const key of keys) {
            try {
                const raw = await kv.get(key);
                if (raw) {
                    records.push(JSON.parse(raw));
                }
            } catch (e) {
                // 忽略解析错误的单条记录
            }
        }

        records.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.status(200).json({ records: records.slice(0, 50) });
    } catch (err) {
        res.status(500).json({ error: '读取记录失败: ' + err.message });
    }
}
