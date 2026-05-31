import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
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

        // ===== 公开接口：联系方式读取 =====
        if (action === 'contact' && req.method === 'GET') {
            const data = await redis.get('config:contact') || {};
            return res.status(200).json(data);
        }

        // ===== 日志 =====
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

        // ===== 商家管理 =====
        if (action === 'merchants') {
            if (!checkAdmin()) return;

            // 详情
            if (req.method === 'GET' && req.query?.action === 'detail') {
                const { id } = req.query;
                if (!id) return res.status(400).json({ error: '缺少id' });
                const merchant = await redis.get(`merchant:${id}`);
                if (!merchant) return res.status(404).json({ error: '商家不存在' });
                const settings = await redis.get(`merchant:${id}:settings`) || {};
                return res.status(200).json({
                    id,
                    name: merchant.name || '未命名',
                    password: merchant.password || '',
                    balance: merchant.balance || 0,
                    status: merchant.status || 'active',
                    settings
                });
            }
            // 流水
            if (req.method === 'GET' && req.query?.action === 'flow') {
                const { merchant } = req.query;
                if (!merchant) return res.status(400).json({ error: '缺少merchant' });
                const keys = await redis.keys(`flow:${merchant}:*`);
                const flows = [];
                for (const key of keys) {
                    const raw = await redis.get(key);
                    if (raw) flows.push(raw);
                }
                flows.sort((a, b) => new Date(b.time) - new Date(a.time));
                return res.status(200).json({ flows });
            }
            // 统计
            if (req.method === 'GET' && req.query?.action === 'stats') {
                const { merchant, start, end } = req.query;
                if (!merchant || !start || !end) return res.status(400).json({ error: '参数不全' });
                const keys = await redis.keys('log:*');
                const daily = {}; let total = 0;
                const sd = new Date(start), ed = new Date(end); ed.setHours(23, 59, 59, 999);
                for (const key of keys) {
                    const raw = await redis.get(key);
                    if (!raw) continue;
                    if (raw.merchant === merchant) {
                        const d = new Date(raw.time);
                        if (d >= sd && d <= ed) {
                            total++;
                            const ds = d.toISOString().slice(0, 10);
                            daily[ds] = (daily[ds] || 0) + 1;
                        }
                    }
                }
                return res.status(200).json({ total, daily });
            }
            // 列表（★ 新增行业字段）
            if (req.method === 'GET') {
                const keys = await redis.keys('merchant:*');
                const merchants = [];
                for (const key of keys) {
                    if (key.includes(':settings')) continue;
                    const m = await redis.get(key);
                    if (m && typeof m === 'object') {
                        const settings = await redis.get(`${key}:settings`) || {};
                        merchants.push({
                            id: key.replace('merchant:', ''),
                            name: m.name || '未命名商家',
                            industry: settings.industry || '',   // 行业
                            balance: m.balance || 0,
                            status: m.status || 'active',
                            password: m.password || '',
                        });
                    }
                }
                return res.status(200).json({ merchants });
            }
            // 新增商家
            if (req.method === 'POST') {
                const { id, name, password, balance } = req.body;
                if (!id || !password) return res.status(400).json({ error: 'ID和密码必填' });
                const existing = await redis.get(`merchant:${id}`);
                if (existing) return res.status(400).json({ error: '商家ID已存在' });

                const newMerchant = {
                    name: name || '未命名商家',
                    password,
                    balance: Number(balance) || 100,
                    status: 'active',
                };

                await redis.set(`merchant:${id}`, newMerchant);
                const saved = await redis.get(`merchant:${id}`);
                return res.status(200).json({ success: true, saved });
            }
            // 修改（支持修改ID、密码、余额、状态）
            if (req.method === 'PUT') {
                const { id, newId, amount, type, note, password, status } = req.body;
                if (!id) return res.status(400).json({ error: '缺少id' });

                // ★ 修改商家ID
                if (newId && newId !== id) {
                    const existingNew = await redis.get(`merchant:${newId}`);
                    if (existingNew) return res.status(400).json({ error: '新ID已存在' });
                    const merchant = await redis.get(`merchant:${id}`);
                    if (!merchant) return res.status(404).json({ error: '商家不存在' });

                    // 复制到新ID
                    await redis.set(`merchant:${newId}`, merchant);
                    // 复制设置
                    const settings = await redis.get(`merchant:${id}:settings`);
                    if (settings) await redis.set(`merchant:${newId}:settings`, settings);
                    // 删除旧ID
                    await redis.del(`merchant:${id}`);
                    await redis.del(`merchant:${id}:settings`);

                    return res.status(200).json({ success: true });
                }

                const merchant = await redis.get(`merchant:${id}`);
                if (!merchant) return res.status(404).json({ error: '商家不存在' });

                if (password) {
                    merchant.password = password;
                    await redis.set(`merchant:${id}`, merchant);
                    return res.status(200).json({ success: true });
                }
                if (amount !== undefined && type) {
                    let newBalance = Number(merchant.balance) || 0;
                    if (type === 'add') newBalance += Number(amount);
                    else if (type === 'subtract') newBalance -= Number(amount);
                    else return res.status(400).json({ error: '无效类型' });
                    if (newBalance < 0) return res.status(400).json({ error: '余额不能为负' });
                    merchant.balance = newBalance;
                    await redis.set(`merchant:${id}`, merchant);

                    await redis.set(`flow:${id}:${Date.now()}`, {
                        type: type === 'add' ? 'admin_add' : 'admin_subtract',
                        amount: Number(amount),
                        balanceAfter: newBalance,
                        time: new Date().toISOString(),
                        note: note || '',
                    });
                    return res.status(200).json({ success: true });
                }
                if (status) {
                    merchant.status = status;
                    await redis.set(`merchant:${id}`, merchant);
                    return res.status(200).json({ success: true });
                }
                return res.status(400).json({ error: '无效请求' });
            }
            // 删除
            if (req.method === 'DELETE') {
                const { id } = req.body;
                if (!id) return res.status(400).json({ error: '缺少id' });
                await redis.del(`merchant:${id}`);
                return res.status(200).json({ success: true });
            }
        }

        // ===== 配置管理 =====
        if (action === 'config') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const rateConfig = await redis.get('config:rate_limit') || { defaultLimit: 5, unlimitedIPs: [], customLimits: {} };
                const banned = await redis.get('config:banned_ips') || [];
                return res.status(200).json({ rateConfig, banned });
            }
            if (req.method === 'POST') {
                const { rateConfig, banned } = req.body;
                if (rateConfig) await redis.set('config:rate_limit', rateConfig);
                if (Array.isArray(banned)) await redis.set('config:banned_ips', banned);
                return res.status(200).json({ success: true });
            }
        }

        // ===== 联系方式设置 =====
        if (action === 'contact' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { qrcode_url, phone, wechat, extra } = req.body;
            await redis.set('config:contact', { qrcode_url, phone, wechat, extra });
            return res.status(200).json({ success: true });
        }

        // ===== 价目表管理 =====
        if (action === 'pricing') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const pricing = await redis.get('config:pricing') || {
                    items: [
                        { amount: 10, price: '¥1' },
                        { amount: 50, price: '¥5' },
                        { amount: 100, price: '¥9' },
                        { amount: 200, price: '¥16' }
                    ],
                    note: '请联系管理员充值'
                };
                return res.status(200).json(pricing);
            }
            if (req.method === 'POST') {
                const { items, note } = req.body;
                if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
                await redis.set('config:pricing', { items, note: note || '' });
                return res.status(200).json({ success: true });
            }
        }

        // ===== 直接登录商家后台 =====
        if (action === 'login-as-merchant') {
            if (!checkAdmin()) return;
            if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少id' });
            const merchant = await redis.get(`merchant:${id}`);
            if (!merchant) return res.status(404).json({ error: '商家不存在' });
            const loginToken = Buffer.from(`${id}:${merchant.password}`).toString('base64');
            const url = `/merchant.html?auto_token=${encodeURIComponent(loginToken)}`;
            return res.status(200).json({ url });
        }

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误：' + err.message });
    }
}
