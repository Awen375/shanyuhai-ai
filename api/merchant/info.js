import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });

    const token = auth.split(' ')[1];
    let id, password;
    try {
        const decoded = Buffer.from(token, 'base64').toString();
        [id, password] = decoded.split(':');
    } catch (e) {
        return res.status(401).json({ error: '无效token' });
    }

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) return res.status(401).json({ error: '登录信息失效' });

    // 读取设置
    const settings = await kv.get(`merchant:${id}:settings`) || {};

    res.status(200).json({
        id,
        name: merchant.name,
        balance: merchant.balance,
        token_val: merchant.token_val || '',
        settings
    });
}
