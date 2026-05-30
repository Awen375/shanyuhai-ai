import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const token = req.headers['x-admin-token'];
    if (token !== 'zjm1314520') return res.status(403).json({ error: '禁止访问' });

    // ---------- 算力流水 ----------
    if (req.method === 'GET' && req.query?.action === 'flow') {
        const { merchant } = req.query;
        if (!merchant) return res.status(400).json({ error: '缺少 merchant 参数' });

        const keys = await kv.keys(`flow:${merchant}:*`);
        const flows = [];
        for (const key of keys) {
            const raw = await kv.get(key);
            if (raw) {
                try {
                    flows.push(JSON.parse(raw));
                } catch (e) { /* skip */ }
            }
        }
        flows.sort((a, b) => new Date(b.time) - new Date(a.time));
        return res.status(200).json({ flows });
    }

    // ---------- 使用统计 ----------
    if (req.method === 'GET' && req.query?.action === 'stats') {
        const { merchant, start, end } = req.query;
        if (!merchant || !start || !end) return res.status(400).json({ error: '参数不全' });

        const keys = await kv.keys('log:*');
        const daily = {};
        let total = 0;

        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59, 999);

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

    // ---------- 商家列表 ----------
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

    // ---------- 新增商家 ----------
    if (req.method === 'POST') {
        const { id, name, password, balance } = req.body;
        if (!id || !password) return res.status(400).json({ error: '缺少ID或密码' });
        const exists = await kv.get(`merchant:${id}`);
        if (exists) return res.status(400).json({ error: '商家ID已存在' });

        const initialBalance = balance || 100;
        await kv.set(`merchant:${id}`, {
            name: name || '',
            password,
            balance: initialBalance,
            status: 'active'
        });

        // 写流水
        await kv.set(`flow:${id}:${Date.now()}`, JSON.stringify({
            type: 'initial',
            amount: initialBalance,
            balanceAfter: initialBalance,
            time: new Date().toISOString(),
            note: '创建商家'
        }));

        return res.status(200).json({ success: true });
    }

    // ---------- 修改（余额调整、封禁状态） ----------
    if (req.method === 'PUT') {
        const { id, amount, type, note, balance, status } = req.body;
        if (!id) return res.status(400).json({ error: '缺少id' });
        const merchant = await kv.get(`merchant:${id}`);
        if (!merchant) return res.status(404).json({ error: '商家不存在' });

        // 处理余额调整（新逻辑：amount + type）
        if (amount !== undefined && type) {
            const oldBalance = merchant.balance || 0;
            let newBalance = oldBalance;
            let flowType = '';
            if (type === 'add') {
                newBalance = oldBalance + Number(amount);
                flowType = 'admin_add';
            } else if (type === 'subtract') {
                newBalance = oldBalance - Number(amount);
                flowType = 'admin_subtract';
                if (newBalance < 0) return res.status(400).json({ error: '算力不足，扣除后余额不能为负' });
            } else {
                return res.status(400).json({ error: '无效的调整类型' });
            }
            merchant.balance = newBalance;

            // 写流水
            await kv.set(`flow:${id}:${Date.now()}`, JSON.stringify({
                type: flowType,
                amount: Number(amount),
                balanceAfter: newBalance,
                time: new Date().toISOString(),
                note: note || `管理员${type === 'add' ? '充值' : '扣除'}算力`
            }));
        }
        // 兼容旧的覆盖余额逻辑（备用）
        else if (balance !== undefined) {
            const oldBalance = merchant.balance || 0;
            const newBalance = Number(balance);
            merchant.balance = newBalance;

            await kv.set(`flow:${id}:${Date.now()}`, JSON.stringify({
                type: 'recharge',
                amount: newBalance - oldBalance,
                balanceAfter: newBalance,
                time: new Date().toISOString(),
                note: note || `管理员直接设置算力`
            }));
        }

        // 处理状态
        if (status) {
            merchant.status = status;
        }

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
