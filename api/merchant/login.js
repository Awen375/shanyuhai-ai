import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).json({ error: '缺少参数' });

    const merchant = await kv.get(`merchant:${id}`);
    if (!merchant || merchant.password !== password) {
        return res.status(401).json({ error: '账号或密码错误' });
    }

    // 简单token，生产环境建议jwt
    const token = Buffer.from(`${id}:${password}`).toString('base64');
    res.status(200).json({ token, name: merchant.name, balance: merchant.balance });
}
