import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') {
        return res.status(403).json({ error: '禁止访问' });
    }

    try {
        // 获取所有 log: 键
        const allKeys = await kv.keys('*');
        const logKeys = Array.isArray(allKeys) ? allKeys.filter(k => k.startsWith('log:')) : [];

        const ipCountMap = {};

        for (const key of logKeys) {
            try {
                const raw = await kv.get(key);
                if (!raw) continue;
                const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
                const ip = record.ip || '未知';
                ipCountMap[ip] = (ipCountMap[ip] || 0) + 1;
            } catch (e) {
                // 跳过损坏记录
            }
        }

        // 转换为数组并按次数降序
        const stats = Object.entries(ipCountMap).map(([ip, count]) => ({ ip, count }));
        stats.sort((a, b) => b.count - a.count);

        res.status(200).json({ stats });
    } catch (err) {
        res.status(500).json({ error: '统计失败: ' + err.message });
    }
}
