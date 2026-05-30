import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

    // ---------- 统计接口 ----------
    if (req.method === 'GET' && req.query?.action === 'stats') {
        const { merchant, start, end } = req.query;
        if (!merchant || !start || !end) return res.status(400).json({ error: '参数不全' });

        const keys = await kv.keys('log:*');
        const daily = {};
        let total = 0;

        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999); // 包含结束日整天

        for (const key of keys) {
            const raw = await kv.get(key);
            if (!raw) continue;
            try {
                const log = JSON.parse(raw);
                if (log.merchant === merchant) {
                    const logDate = new Date(log.time);
                    if (logDate >= startDate && logDate <= endDate) {
                        total++;
                        const dateStr = logDate.toISOString().slice(0, 10);
                        daily[dateStr] = (daily[dateStr] || 0) + 1;
                    }
                }
            } catch (e) { /* skip */ }
        }

        return res.status(200).json({ total, daily });
    }

    // ---------- 列表 ----------
    if (req.method === 'GET') {
        const keys = await kv.keys('merchant:*');
        const merchants = [];
        for (const key of keys) {
            const data = await kv.get(key);
            if (data) merchants.push({
                id: key.replace('merchant:', ''),
                name: data.name || '',
                balance: data.balance || 0,
                status: data.status || 'active'
            });
        }
        return res.status(200).json({ merchants });
    }

    // ---------- 新增 ----------
    if (req.method === 'POST') {
        const { id, name, password, balance } = req.body;
        if (!id || !password) return res.status(400).json({ error: '缺少ID或密码' });
        // 检查是否存在
        const exists = await kv.get(`merchant:${id}`);
        if (exists) return res.status(400).json({ error: '商家ID已存在' });

        await kv.set(`merchant:${id}`, {
            name: name || '',
            password,
            balance: balance || 100,
            status: 'active'
        });
        return res.status(200).json({ success: true });
    }

    // ---------- 修改（余额或状态） ----------
    if (req.method === 'PUT') {
        const { id, balance, status } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if (!merchant) return res.status(404).json({ error: '商家不存在' });
        if (balance !== undefined) merchant.balance = Number(balance);
        if (status) merchant.status = status;   // 'active' 或 'banned'
        await kv.set(`merchant:${id}`, merchant);
        return res.status(200).json({ success: true });
    }

    // ---------- 删除 ----------
    if (req.method === 'DELETE') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        await kv.del(`merchant:${id}`);
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: '方法不允许' });
}
