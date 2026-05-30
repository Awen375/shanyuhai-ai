const redis = {
  baseUrl: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
  async get(key) {
    const res = await fetch(`${this.baseUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const data = await res.json();
    return data.result;
  },
  async set(key, value) {
    await fetch(`${this.baseUrl}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
  },
  async del(key) {
    await fetch(`${this.baseUrl}/del/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` }
    });
  },
  async keys(pattern) {
    const res = await fetch(`${this.baseUrl}/keys/${pattern}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const data = await res.json();
    return data.result || [];
  }
};

export default async function handler(req, res) {
    try {
        // 安全提取 action，避免使用 new URL
        const pathOnly = req.url.split('?')[0];                     // /api/admin/merchants 或 /api/admin
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

        // ========== 公开接口 ==========
        // 联系信息读取
        if (action === 'contact' && req.method === 'GET') {
            const dataStr = await redis.get('config:contact');
            const data = dataStr ? JSON.parse(dataStr) : {};
            return res.status(200).json(data);
        }

        // ========== 日志列表（/api/admin 或 /api/admin/logs）==========
        if (action === '' || action === 'logs') {
            if (!checkAdmin()) return;
            const keys = await redis.keys('log:*');
            const records = [];
            for (const key of keys) {
                const raw = await redis.get(key);
                if (raw) {
                    try { records.push(JSON.parse(raw)); } catch (e) {}
                }
            }
            records.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ records: records.slice(0, 50) });
        }

        // ========== 商家管理 ==========
        if (action === 'merchants') {
            if (!checkAdmin()) return;

            // 详情
            if (req.method === 'GET' && req.query?.action === 'detail') {
                const { id } = req.query;
                if (!id) return res.status(400).json({ error: '缺少id' });
                const merchantStr = await redis.get(`merchant:${id}`);
                if (!merchantStr) return res.status(404).json({ error: '商家不存在' });
                const merchant = JSON.parse(merchantStr);
                const settingsStr = await redis.get(`merchant:${id}:settings`);
                const settings = settingsStr ? JSON.parse(settingsStr) : {};
                return res.status(200).json({
                    id,
                    name: merchant.name,
                    password: merchant.password,
                    balance: merchant.balance,
                    status: merchant.status,
                    settings,
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
                    if (raw) {
                        try { flows.push(JSON.parse(raw)); } catch (e) {}
                    }
                }
                flows.sort((a, b) => new Date(b.time) - new Date(a.time));
                return res.status(200).json({ flows });
            }
            // 统计
            if (req.method === 'GET' && req.query?.action === 'stats') {
                const { merchant, start, end } = req.query;
                if (!merchant || !start || !end) return res.status(400).json({ error: '参数不全' });
                const keys = await redis.keys('log:*');
                const daily = {};
                let total = 0;
                const sd = new Date(start), ed = new Date(end);
                ed.setHours(23, 59, 59, 999);
                for (const key of keys) {
                    const raw = await redis.get(key);
                    if (!raw) continue;
                    try {
                        const log = JSON.parse(raw);
                        if (log.merchant === merchant) {
                            const d = new Date(log.time);
                            if (d >= sd && d <= ed) {
                                total++;
                                const ds = d.toISOString().slice(0, 10);
                                daily[ds] = (daily[ds] || 0) + 1;
                            }
                        }
                    } catch (e) {}
                }
                return res.status(200).json({ total, daily });
            }
            // 列表
            if (req.method === 'GET') {
                const keys = await redis.keys('merchant:*');
                const merchants = [];
                for (const key of keys) {
                    if (key.includes(':settings')) continue;
                    const data = await redis.get(key);
                    if (data) {
                        const m = JSON.parse(data);
                        merchants.push({
                            id: key.replace('merchant:', ''),
                            name: m.name,
                            balance: m.balance,
                            status: m.status || 'active',
                        });
                    }
                }
                return res.status(200).json({ merchants });
            }
            // 新增
            if (req.method === 'POST') {
                const { id, name, password, balance } = req.body;
                if (!id || !password) return res.status(400).json({ error: '缺少参数' });
                const existing = await redis.get(`merchant:${id}`);
                if (existing) return res.status(400).json({ error: '商家ID已存在' });
                await redis.set(`merchant:${id}`, JSON.stringify({
                    name: name || '',
                    password,
                    balance: balance || 100,
                    status: 'active',
                }));
                return res.status(200).json({ success: true });
            }
            // 修改
            if (req.method === 'PUT') {
                const { id, amount, type, note, password, status } = req.body;
                if (!id) return res.status(400).json({ error: '缺少id' });
                const merchantStr = await redis.get(`merchant:${id}`);
                if (!merchantStr) return res.status(404).json({ error: '商家不存在' });
                const merchant = JSON.parse(merchantStr);
                if (password) {
                    merchant.password = password;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));
                    return res.status(200).json({ success: true });
                }
                if (amount !== undefined && type) {
                    let newBalance = merchant.balance || 0;
                    if (type === 'add') newBalance += Number(amount);
                    else if (type === 'subtract') newBalance -= Number(amount);
                    else return res.status(400).json({ error: '无效类型' });
                    if (newBalance < 0) return res.status(400).json({ error: '余额不能为负' });
                    merchant.balance = newBalance;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));
                    await redis.set(`flow:${id}:${Date.now()}`, JSON.stringify({
                        type: type === 'add' ? 'admin_add' : 'admin_subtract',
                        amount: Number(amount),
                        balanceAfter: newBalance,
                        time: new Date().toISOString(),
                        note: note || '',
                    }));
                    return res.status(200).json({ success: true });
                }
                if (status) {
                    merchant.status = status;
                    await redis.set(`merchant:${id}`, JSON.stringify(merchant));
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

        // ========== 配置管理 ==========
        if (action === 'config') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const rateConfigStr = await redis.get('config:rate_limit');
                const rateConfig = rateConfigStr ? JSON.parse(rateConfigStr) : {
                    defaultLimit: 5,
                    unlimitedIPs: [],
                    customLimits: {},
                };
                const bannedStr = await redis.get('config:banned_ips');
                const banned = bannedStr ? JSON.parse(bannedStr) : [];
                return res.status(200).json({ rateConfig, banned });
            }
            if (req.method === 'POST') {
                const { rateConfig, banned } = req.body;
                if (rateConfig) await redis.set('config:rate_limit', JSON.stringify(rateConfig));
                if (Array.isArray(banned)) await redis.set('config:banned_ips', JSON.stringify(banned));
                return res.status(200).json({ success: true });
            }
        }

        // ========== 联系方式设置 ==========
        if (action === 'contact' && req.method === 'POST') {
            if (!checkAdmin()) return;
            const { qrcode_url, phone, wechat, extra } = req.body;
            await redis.set('config:contact', JSON.stringify({ qrcode_url, phone, wechat, extra }));
            return res.status(200).json({ success: true });
        }

        // ========== 价目表管理 ==========
        if (action === 'pricing') {
            if (!checkAdmin()) return;
            if (req.method === 'GET') {
                const pricingStr = await redis.get('config:pricing');
                const pricing = pricingStr ? JSON.parse(pricingStr) : { items: [], note: '' };
                return res.status(200).json(pricing);
            }
            if (req.method === 'POST') {
                const { items, note } = req.body;
                if (!Array.isArray(items)) return res.status(400).json({ error: 'items 必须是数组' });
                await redis.set('config:pricing', JSON.stringify({ items, note: note || '' }));
                return res.status(200).json({ success: true });
            }
        }

        // ========== 直接登录商家后台 ==========
        if (action === 'login-as-merchant') {
            if (!checkAdmin()) return;
            if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: '缺少id' });
            const merchantStr = await redis.get(`merchant:${id}`);
            if (!merchantStr) return res.status(404).json({ error: '商家不存在' });
            const merchant = JSON.parse(merchantStr);
            const loginToken = Buffer.from(`${id}:${merchant.password}`).toString('base64');
            const url = `/merchant.html?auto_token=${encodeURIComponent(loginToken)}`;
            return res.status(200).json({ url });
        }

        // 未匹配任何路由
        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误：' + err.message });
    }
}
