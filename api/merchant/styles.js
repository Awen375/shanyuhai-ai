import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const { merchant } = req.query;
    if (!merchant) return res.status(400).json({ error: '缺少 merchant 参数' });

    const settings = await kv.get(`merchant:${merchant}:settings`) || {};
    const styles = settings.styles || [];
    res.status(200).json({ styles });
}
