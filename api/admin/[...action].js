import Redis from 'ioredis';

const redis = new Redis('redis://:Cjw1314520%40@127.0.0.1:6379');

export default async function handler(req, res) {
    if (!res.status) {
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    }

    try {
        const pathOnly = req.url.split('?')[0];
        const rawAction = pathOnly.replace('/api/admin/', '').replace('/api/admin', '');
        const action = rawAction || '';

        const adminToken = req.headers['x-admin-token'];
        const ADMIN_PASSWORD = 'zjm1314520';
        const checkAdmin = () => {
            if (adminToken !== ADMIN_PASSWORD) {
                res.status(403).json({ error: '禁止访问' });
                return false;
            }
            return true;
        };

        if (action === 'contact' && req.method === 'GET') {
            const data = await redis.get('config:contact') || {};
            return res.status(200).json(data);
        }

        if (action === '' || action === 'logs') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('log:*');
            const records = [];
            for (const key of keys) {
                const raw = await redis.get(key);
                if (raw) records.push(raw);
            }
            records.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ records: records.slice(0, 50) });
        }

        if (action === 'merchants') {
            if (!checkAdmin()) return;

            if (req.method === 'GET' && req.query?.action === 'detail') {
                const { id } = req.query;
                if (!id) return res.status(400).json({ error: '缺少id' });
                const raw = await redis.get(`merchant:${id}`);
                if (!raw) return res.status(404).json({ error: '商家不存在' });
                const merchant = typeof raw === 'string' ? JSON.parse(raw) : raw;
                const settings = await redis.get(`merchant:${id}:settings`) || {};
                return res.status(200).json({ id, name: merchant.name || '未命名', password: merchant.password || '', balance: merchant.balance || 0, status: merchant.status || 'active', settings });
            }

            if (req.method === 'GET' && req.query?.action === 'flow') {
                const { merchant } = req.query;
                if (!merchant) return res.status(400).json({ error: '缺少merchant' });
                const keys = await redis.keys(`flow:${merchant}:*`);
                const flows = [];
                for (const key of keys) {
                    const raw = await redis.get(key);
                    if (raw) {
                        const f = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        flows.push(f);
                    }
                }
                flows.sort((a, b) => new Date(b.time) - new Date(a.time));
                return res.status(200).json({ flows });
            }

            if (req.method === 'GET') {
                const keys = await redis.keys('merchant:*');
                const merchants = [];
                for (const key of keys) {
                    if (key.includes(':settings')) continue;
                    const raw = await redis.get(key);
                    if (raw) {
                        const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        const settings = await redis.get(`${key}:settings`) || {};
                        merchants.push({ id: key.replace('merchant:', ''), name: m.name || '未命名商家', industry: settings.industry || '', balance: m.balance || 0, status: m.status || 'active', password: m.password || '' });
                    }
                }
                return res.status(200).json({ merchants });
            }

            if (req.method === 'POST') {
                const { id, name, password, balance } = req.body;
                if (!id || !password) return res.status(400).json({ error: 'ID和密码必填' });
                const existing = await redis.get(`merchant:${id}`);
                if (existing) return res.status(400).json({ error: '商家ID已存在' });
                await redis.set(`merchant:${id}`, JSON.stringify({ name: name || '未命名商家', password, balance: Number(balance) || 100, status: 'active' }));
                await redis.set(`merchant:${id}:settings`, JSON.stringify({}));
                return res.status(200).json({ success: true });
            }

            if (req.method === 'PUT') {
                const { id, newId, amount, type, note, password, status } = req.body;
                if (!id) return res.status(400).json({ error: '缺少id' });

                if (newId && newId !== id) {
                    const existingNew = await redis.get(`merchant:${newId}`);
                    if (existingNew) return res.status(400).json({ error: '新ID已存在' });
                    const raw = await redis.get(`merchant:${id}`);
                    if (!raw) return res.status(404).json({ error: '商家不存在' });
                    const merchant = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    await redis.set(`merchant:${newId}`, JSON.stringify(merchant));
                    const settings = await redis.get(`merchant:${id}:settings`);
                    if (settings) await redis.set(`merchant:${newId}:settings`, settings);
                    await redis.del(`merchant:${id}`);
                    await redis.del(`merchant:${id}:settings`);
                    return res.status(200).json({ success: true });
                }

                const raw = await redis.get(`merchant:${id}`);
                if (!raw) return res.status(404).json({ error: '商家不存在' });
                const merchant = typeof raw === 'string' ? JSON.parse(raw) : raw;

                if (password) {
                    merchant.password = password;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));
                    return res.status(200).json({ success: true });
                }
                if (amount !== undefined && type) {
                    const oldBalance = Number(merchant.balance) || 0;
                    let newBalance = oldBalance;
                    if (type === 'add') newBalance += Number(amount);
                    else if (type === 'subtract') newBalance -= Number(amount);
                    else return res.status(400).json({ error: '无效类型' });
                    if (newBalance < 0) return res.status(400).json({ error: '余额不能为负' });
                    merchant.balance = newBalance;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));

                    const flowKey = `flow:${id}:${Date.now()}`;
                    await redis.set(flowKey, JSON.stringify({ time: new Date().toISOString(), type: type === 'add' ? 'admin_add' : 'admin_subtract', amount: Number(amount), balanceAfter: newBalance, note: note || (type === 'add' ? '管理员充值' : '管理员扣除') }));
                    return res.status(200).json({ success: true });
                }
                if (status) {
                    merchant.status = status;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));
                    return res.status(200).json({ success: true });
                }
                return res.status(400).json({ error: '无效请求' });
            }

            if (req.method === 'DELETE') {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: '缺少id' });
                await redis.del(`merchant:${id}`);
                await redis.del(`merchant:${id}:settings`);
                return res.status(200).json({ success: true });
            }
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (action === 'pricing') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const raw = await redis.get('config:pricing');
                let pricing = { items: [], note: '' };
                if (raw) {
                    try {
                        pricing = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    } catch (e) {
                        pricing = { items: [], note: '' };
                    }
                }
                if (!Array.isArray(pricing.items)) pricing.items = [];
                return res.status(200).json(pricing);
            }
            if (req.method === 'POST') {
                const { items, note } = req.body;
                if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
                await redis.set('config:pricing', JSON.stringify({ items, note: note || '' }));
                return res.status(200).json({ success: true });
            }
        }

        if (action === 'contact' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { qrcode_url, phone, wechat, extra } = req.body;
            await redis.set('config:contact', { qrcode_url, phone, wechat, extra });
            return res.status(200).json({ success: true });
        }

        if (action === 'login-as-merchant') {
            if (!checkAdmin()) return;
            if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少id' });
            const raw = await redis.get(`merchant:${id}`);
            if (!raw) return res.status(404).json({ error: '商家不存在' });
            const merchant = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const loginToken = Buffer.from(`${id}:${merchant.password}`).toString('base64');
            const url = `/wenan/merchant.html?auto_token=${encodeURIComponent(loginToken)}`;
            return res.status(200).json({ url });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        console.error('API Error:', err);
        if (!res.writableEnded) {
            return res.status(500).json({ error: '服务器内部错误：' + err.message });
        }
    }
}
