import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'shanyuhai2024') return res.status(403).json({ error: '禁止访问' }); // 改

    // GET 列表
    if (req.method === 'GET') {
        const keys = await kv.keys('merchant:*');
        const merchants = [];
        for (const key of keys) {
            const data = await kv.get(key);
            if (data) merchants.push({ id: key.replace('merchant:', ''), ...data });
        }
        return res.status(200).json({ merchants });
    }

    // POST 新增
    if (req.method === 'POST') {
        const { id, name, password, balance } = req.body;
        if (!id || !password) return res.status(400).json({ error: '缺少参数' });
        await kv.set(`merchant:${id}`, { name: name||'', password, balance: balance||100 });
        return res.status(200).json({ success: true });
    }

    // PUT 修改余额
    if (req.method === 'PUT') {
        const { id, balance } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if (!merchant) return res.status(404).json({ error: '商家不存在' });
        merchant.balance = balance;
        await kv.set(`merchant:${id}`, merchant);
        return res.status(200).json({ success: true });
    }

    // DELETE 删除
    if (req.method === 'DELETE') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        await kv.del(`merchant:${id}`);
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: '方法不允许' });
}
