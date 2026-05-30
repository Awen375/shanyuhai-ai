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
  async keys(pattern) {
    const res = await fetch(`${this.baseUrl}/keys/${pattern}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    const data = await res.json();
    return data.result || [];
  }
};

export default async function handler(req, res) {
    const url = new URL(req.url);
    const path = url.pathname.replace('/api/merchant/', '');
    const action = path || '';

    // 登录
    if (req.method === 'POST' && action === 'login') {
        const { id, password } = req.body || {};
        if (!id || !password) return res.status(400).json({ error: '缺少参数' });
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '账号或密码错误' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '账号或密码错误' });

        if (!merchant.token_val) {
            merchant.token_val = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
            await redis.set(`merchant:${id}`, JSON.stringify(merchant));
        }
        const token = Buffer.from(`${id}:${password}`).toString('base64');
        return res.status(200).json({ token, name: merchant.name, balance: merchant.balance, token_val: merchant.token_val });
    }

    // 信息
    if (action === 'info') {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
        const token = auth.split(' ')[1];
        let id, password;
        try { const decoded = Buffer.from(token, 'base64').toString(); [id, password] = decoded.split(':'); } catch (e) { return res.status(401).json({ error: '无效token' }); }
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '登录信息失效' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

        const settingsStr = await redis.get(`merchant:${id}:settings`);
        const settings = settingsStr ? JSON.parse(settingsStr) : {};
        return res.status(200).json({ id, name: merchant.name, balance: merchant.balance, token_val: merchant.token_val || '', settings });
    }

    // 刷新二维码
    if (req.method === 'POST' && action === 'refresh') {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
        const token = auth.split(' ')[1];
        let id, password;
        try { const decoded = Buffer.from(token, 'base64').toString(); [id, password] = decoded.split(':'); } catch (e) { return res.status(401).json({ error: '无效token' }); }
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '登录信息失效' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

        const newToken = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
        merchant.token_val = newToken;
        await redis.set(`merchant:${id}`, JSON.stringify(merchant));
        return res.status(200).json({ success: true, token_val: newToken });
    }

    // 流水
    if (action === 'flow') {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
        const token = auth.split(' ')[1];
        let id, password;
        try { const decoded = Buffer.from(token, 'base64').toString(); [id, password] = decoded.split(':'); } catch (e) { return res.status(401).json({ error: '无效token' }); }
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '登录信息失效' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

        const keys = await redis.keys(`flow:${id}:*`);
        const flows = [];
        for (const key of keys) {
            const raw = await redis.get(key);
            if (raw) { try { flows.push(JSON.parse(raw)); } catch (e) {} }
        }
        flows.sort((a, b) => new Date(b.time) - new Date(a.time));
        return res.status(200).json({ flows });
    }

    // 修改密码
    if (req.method === 'POST' && action === 'change-password') {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
        const token = auth.split(' ')[1];
        let id, password;
        try { const decoded = Buffer.from(token, 'base64').toString(); [id, password] = decoded.split(':'); } catch (e) { return res.status(401).json({ error: '无效token' }); }
        const { oldPassword, newPassword } = req.body || {};
        if (!oldPassword || !newPassword) return res.status(400).json({ error: '缺少参数' });
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '当前登录已失效' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '当前登录已失效' });
        if (merchant.password !== oldPassword) return res.status(400).json({ error: '原密码错误' });

        merchant.password = newPassword;
        await redis.set(`merchant:${id}`, JSON.stringify(merchant));
        return res.status(200).json({ success: true });
    }

    // 保存设置
    if (req.method === 'POST' && action === 'save-settings') {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
        const token = auth.split(' ')[1];
        let id, password;
        try { const decoded = Buffer.from(token, 'base64').toString(); [id, password] = decoded.split(':'); } catch (e) { return res.status(401).json({ error: '无效token' }); }
        const merchantStr = await redis.get(`merchant:${id}`);
        if (!merchantStr) return res.status(401).json({ error: '登录信息失效' });
        const merchant = JSON.parse(merchantStr);
        if (merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

        const { industry, keywords, product, extraNote, styles } = req.body || {};
        await redis.set(`merchant:${id}:settings`, JSON.stringify({
            industry: industry || '',
            keywords: keywords || '',
            product: product || '',
            extraNote: extraNote || '',
            styles: Array.isArray(styles) ? styles : []
        }));
        return res.status(200).json({ success: true });
    }

    // 风格（公开）
    if (action === 'styles') {
        const { merchant } = req.query;
        if (!merchant) return res.status(400).json({ error: '缺少 merchant 参数' });
        const settingsStr = await redis.get(`merchant:${merchant}:settings`);
        const settings = settingsStr ? JSON.parse(settingsStr) : {};
        const styles = settings.styles || [];
        return res.status(200).json({ styles });
    }

    // 价目（公开）
    if (action === 'pricing') {
        const pricingStr = await redis.get('config:pricing');
        const pricing = pricingStr ? JSON.parse(pricingStr) : {
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

    res.status(404).json({ error: '接口不存在' });
}
