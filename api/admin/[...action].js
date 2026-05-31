const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// 直接发请求，不做额外的 JSON.stringify 嵌套
async function redisGet(key) {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    let val = data.result !== undefined ? data.result : (data.value || null);
    if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch (e) {}
    }
    return val;
}

async function redisSet(key, value) {
    // 将 value 转为字符串，然后直接放在 body 的 value 字段里
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    const body = JSON.stringify({ value: strValue });
    await fetch(`${REDIS_URL}/set/${key}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${REDIS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body
    });
}

async function redisDel(key) {
    await fetch(`${REDIS_URL}/del/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
}

async function redisKeys(pattern) {
    const res = await fetch(`${REDIS_URL}/keys/${pattern}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    return data.result || [];
}

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

        // 联系方式读取
        if (action === 'contact' && req.method === 'GET') {
            const data = await redisGet('config:contact') || {};
            return res.status(200).json(data);
        }

        // 日志
        if (action === '' || action === 'logs') {
            if (!checkAdmin()) return;
            const keys = await redisKeys('log:*');
            const records = [];
            for (const key of keys) {
                const raw = await redisGet(key);
                if (raw) records.push(raw);
            }
            records.sort((a, b) => new Date(b.time) - new Date(a.time));
            return res.status(200).json({ records: records.slice(0, 50) });
        }

        // 商家管理
        if (action === 'merchants') {
            if (!checkAdmin()) return;

            // 详情
            if (req.method === 'GET' && req.query?.action === 'detail') {
                const { id } = req.query;
                if (!id) return res.status(400).json({ error: '缺少id' });
                const merchant = await redisGet(`merchant:${id}`);
                if (!merchant) return res.status(404).json({ error: '商家不存在' });
                const settings = await redisGet(`merchant:${id}:settings`) || {};
                return res.status(200).json({
                    id,
                    name: merchant.name || '未命名',
                    password: merchant.password || '',
                    balance: merchant.balance || 0,
                    status: merchant.status || 'active',
                    settings
                });
            }
            // 流水、统计等保留（此处省略，与之前相同）
            // 列表
            if (req.method === 'GET') {
                const keys = await redisKeys('merchant:*');
                const merchants = [];
                for (const key of keys) {
                    if (key.includes(':settings')) continue;
                    const m = await redisGet(key);
                    if (m && typeof m === 'object') {
                        merchants.push({
                            id: key.replace('merchant:', ''),
                            name: m.name || '未命名商家',
                            balance: m.balance || 0,
                            status: m.status || 'active',
                            password: m.password || '',
                        });
                    }
                }
                return res.status(200).json({ merchants });
            }
            // 新增商家（核心修复）
            if (req.method === 'POST') {
                const { id, name, password, balance } = req.body;
                if (!id || !password) return res.status(400).json({ error: 'ID和密码必填' });
                const existing = await redisGet(`merchant:${id}`);
                if (existing) return res.status(400).json({ error: '商家ID已存在' });

                const newMerchant = {
                    name: name || '未命名商家',
                    password,
                    balance: Number(balance) || 100,
                    status: 'active',
                };

                // 直接存储（redisSet 会自动转为 JSON 字符串，并正确放入 body）
                await redisSet(`merchant:${id}`, newMerchant);

                // 立即读取验证
                const saved = await redisGet(`merchant:${id}`);
                console.log('写入验证:', JSON.stringify(saved));

                return res.status(200).json({ success: true, saved });
            }
            // 修改、删除等保持原样（省略，但需完整）
        }

        // 配置管理、联系方式、价目表等保持原样（省略，但需完整）

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误：' + err.message });
    }
}
