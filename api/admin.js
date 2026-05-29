import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // 验证 token
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') {
        return res.status(403).json({ error: '禁止访问' });
    }

    try {
        // 尝试获取所有键
        const allKeys = await kv.keys('*');
        console.log('获取到的所有键:', allKeys);

        // 过滤出 log: 开头的键
        const logKeys = Array.isArray(allKeys) ? allKeys.filter(key => key.startsWith('log:')) : [];
        console.log('过滤后的日志键数量:', logKeys.length);

        if (logKeys.length === 0) {
            return res.status(200).json({ records: [] });
        }

        // 批量读取
        const records = [];
        for (const key of logKeys) {
            try {
                const raw = await kv.get(key);
                if (raw) {
                    records.push(JSON.parse(raw));
                }
            } catch (e) {
                console.error('解析单条日志失败:', key, e);
            }
        }

        records.sort((a, b) => new Date(b.time) - new Date(a.time));
        res.status(200).json({ records: records.slice(0, 50) });
    } catch (err) {
        console.error('admin.js 全局错误:', err);
        res.status(500).json({ error: '服务器内部错误: ' + err.message });
    }
}
