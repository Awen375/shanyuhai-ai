import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') {
        return res.status(403).json({ error: '禁止访问' });
    }

    try {
        const allKeys = await kv.keys('*');
        const logKeys = Array.isArray(allKeys) ? allKeys.filter(key => key.startsWith('log:')) : [];

        if (logKeys.length === 0) {
            return res.status(200).json({ records: [] });
        }

        const records = [];
        for (const key of logKeys) {
            try {
                const raw = await kv.get(key);
                if (!raw) continue;
                // 兼容：如果已经是对象，直接使用；如果是字符串，则解析
                const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (record && record.time) {
                    records.push(record);
                }
            } catch (e) {
                // 忽略单条问题，并输出日志便于排查
                console.error('跳过异常记录', key, e.message);
            }
        }

        records.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.status(200).json({ records: records.slice(0, 50) });
    } catch (err) {
        console.error('admin.js 全局错误:', err);
        res.status(500).json({ error: '服务器内部错误: ' + err.message });
    }
}
