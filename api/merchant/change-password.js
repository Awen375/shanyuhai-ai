import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

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

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '缺少参数' });

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) return res.status(401).json({ error: '当前登录已失效' });

    if (merchant.password !== oldPassword) return res.status(400).json({ error: '原密码错误' });

    merchant.password = newPassword;
    await kv.set(`merchant:${id}`, merchant);

    res.status(200).json({ success: true });
}
