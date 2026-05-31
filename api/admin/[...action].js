const REDIS_URL = process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

// 封装更稳定的 Redis 请求
async function redisRequest(path, options = {}) {
    const url = `${REDIS_URL}${path}`;
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${REDIS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Redis error: ${data.error || res.status}`);
    }
    return data;
}

const redis = {
    async get(key) {
        const data = await redisRequest(`/get/${key}`);
        let val = data.result !== undefined ? data.result : (data.value || null);
        if (typeof val === 'string') {
            try { val = JSON.parse(val); } catch (e) {}
        }
        return val;
    },
    async set(key, value) {
        // 确保 value 是字符串（Upstash 要求）
        const val = typeof value === 'string' ? value : JSON.stringify(value);
        await redisRequest(`/set/${key}`, {
            method: 'POST',
            body: JSON.stringify({ value: val }),
        });
    },
    async del(key) {
        await redisRequest(`/del/${key}`, { method: 'POST' });
    },
    async keys(pattern) {
        const data = await redisRequest(`/keys/${pattern}`);
        return data.result || [];
    },
};

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
            const data = await redis.get('config:contact') || {};
            return res.status(200).json(data);
        }

        // 日志
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

        // 商家管理
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
                    settings,
                });
            }

            // 流水、统计等保持原样...
            // ...（此处省略，但与之前相同）

            // 列表
            if (req.method === 'GET') {
                const keys = await redis.keys('merchant:*');
                const merchants = [];
                for (const key of keys) {
                    if (key.includes(':settings')) continue;
                    const m = await redis.get(key);
                    if (m && typeof m === 'object') {
                        merchants.push({
                            id: key.replace('merchant:', ''),
                            name: m.name || '未命名商家',
                            balance: m.balance || 0,
                            status: m.status || 'active',
                            password: m.password || '',   // 返回密码供调试
                        });
                    }
                }
                console.log('商家列表:', JSON.stringify(merchants));
                return res.status(200).json({ merchants });
            }

            // 新增商家（★★★ 重点修复）
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

                // 写入 Redis
                await redis.set(`merchant:${id}`, newMerchant);

                // 立即读取验证
                const saved = await redis.get(`merchant:${id}`);
                console.log('新商家写入验证:', JSON.stringify(saved));

                return res.status(200).json({ success: true, merchant: saved });
            }

            // 修改、删除等（不变）
            // ...
        }

        // 配置、联系方式、价目表、登录为商家等保持原样
        // ...

        return res.status(404).json({ error: '接口不存在' });
    } catch (err) {
        return res.status(500).json({ error: '服务器内部错误：' + err.message });
    }
}
