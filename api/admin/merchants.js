import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

    // 商家详情（含密码、设置）
    if (req.method === 'GET' && req.query?.action === 'detail') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: '缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if (!merchant) return res.status(404).json({ error: '商家不存在' });
        const settings = await kv.get(`merchant:${id}:settings`) || {};
        return res.status(200).json({ id, name: merchant.name, password: merchant.password, balance: merchant.balance, status: merchant.status, settings });
    }

    // 流水
    if (req.method === 'GET' && req.query?.action === 'flow') {
        const { merchant } = req.query;
        if (!merchant) return res.status(400).json({ error: '缺少merchant' });
        const keys = await kv.keys(`flow:${merchant}:*`);
        const flows = [];
        for (const key of keys) {
            const raw = await kv.get(key);
            if (raw) { try { flows.push(JSON.parse(raw)); } catch(e){} }
        }
        flows.sort((a,b) => new Date(b.time) - new Date(a.time));
        return res.status(200).json({ flows });
    }

    // 统计
    if (req.method === 'GET' && req.query?.action === 'stats') {
        const { merchant, start, end } = req.query;
        if (!merchant || !start || !end) return res.status(400).json({ error: '参数不全' });
        const keys = await kv.keys('log:*');
        const daily = {}; let total = 0;
        const startD = new Date(start), endD = new Date(end); endD.setHours(23,59,59,999);
        for (const key of keys) {
            const raw = await kv.get(key);
            if (!raw) continue;
            try { const log = JSON.parse(raw); if (log.merchant===merchant) { const d = new Date(log.time); if (d>=startD && d<=endD) { total++; const ds = d.toISOString().slice(0,10); daily[ds] = (daily[ds]||0)+1; } } } catch(e){}
        }
        return res.status(200).json({ total, daily });
    }

    // 列表
    if (req.method === 'GET') {
        const keys = await kv.keys('merchant:*');
        const merchants = [];
        for (const key of keys) {
            const data = await kv.get(key);
            if (data) merchants.push({ id: key.replace('merchant:',''), name: data.name, balance: data.balance, status: data.status || 'active' });
        }
        return res.status(200).json({ merchants });
    }

    // 新增
    if (req.method === 'POST') {
        const { id, name, password, balance } = req.body;
        if (!id || !password) return res.status(400).json({ error: '缺少参数' });
        await kv.set(`merchant:${id}`, { name: name||'', password, balance: balance||100, status: 'active' });
        return res.status(200).json({ success: true });
    }

    // 修改（支持修改余额、密码、状态）
    if (req.method === 'PUT') {
        const { id, amount, type, note, password, status } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if (!merchant) return res.status(404).json({ error: '商家不存在' });

        // 修改密码
        if (password) {
            merchant.password = password;
            await kv.set(`merchant:${id}`, merchant);
            return res.status(200).json({ success: true });
        }

        // 调整算力
        if (amount !== undefined && type) {
            let newBalance = merchant.balance || 0;
            if (type === 'add') newBalance += Number(amount);
            else if (type === 'subtract') newBalance -= Number(amount);
            else return res.status(400).json({ error: '无效类型' });
            if (newBalance < 0) return res.status(400).json({ error: '余额不能为负' });
            merchant.balance = newBalance;
            await kv.set(`merchant:${id}`, merchant);
            await kv.set(`flow:${id}:${Date.now()}`, JSON.stringify({ type: type==='add'?'admin_add':'admin_subtract', amount: Number(amount), balanceAfter: newBalance, time: new Date().toISOString(), note: note||'' }));
            return res.status(200).json({ success: true });
        }

        // 修改状态
        if (status) {
            merchant.status = status;
            await kv.set(`merchant:${id}`, merchant);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: '无效请求' });
    }

    // 删除
    if (req.method === 'DELETE') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        await kv.del(`merchant:${id}`);
        return res.status(200).json({ success: true });
    }

    res.status(405).json({ error: '方法不允许' });
}
