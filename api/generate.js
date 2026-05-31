import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const defaultStyleGuides = {
    "情绪共鸣型": "你是感情细腻的体验者。",
    "宝藏发现型": "你是乐于分享隐藏好物的博主。",
    "氛围描绘型": "你是擅长描写环境的作家。",
    "干货整理型": "你是信息整理达人。",
    "攻略型": "你是攻略专家。"
};

const platformGuides = {
    xiaohongshu: "请生成一篇小红书风格的好评，使用emoji和热门话题标签，语气亲切活泼。",
    dianping: "请生成一篇大众点评风格的好评，客观描述体验，列出优点和缺点，评分式总结。",
    douyin: "请生成一段抖音风格的口播文案，节奏明快，带有强烈个人感受和网络热词，适合视频配音。"
};

async function generateContent(platform, style, prompt, facts, res) {
    const styleGuide = defaultStyleGuides[style] || '请写一篇热情的好评。';
    const platformGuide = platformGuides[platform] || platformGuides.xiaohongshu;
    
    const system = `${facts}\n\n${styleGuide}\n${platformGuide}\n要求：包含emoji和话题标签，真诚生动。`;
    const user = prompt ? `请按上面要求写好评，并注意补充：${prompt}` : '请直接生成好评文案';
    
    try {
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                temperature: 0.9
            })
        });
        const data = await response.json();
        res.status(200).json({ result: data.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: 'AI生成失败，请稍后重试' });
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: '只支持POST' });

    const { platform = 'xiaohongshu', style, prompt, merchant: merchantId, token: qrToken } = req.body;
    if (!style) return res.status(400).json({ error: '请选择写作风格' });

    if (!merchantId) {
        return res.status(400).json({ error: '请通过商家二维码访问' });
    }

    const merchant = await redis.get(`merchant:${merchantId}`);
    if (!merchant) return res.status(400).json({ error: '无效商家' });
    if (merchant.status === 'banned') return res.status(403).json({ error: '该商家已被封禁' });
    if (merchant.token_val && merchant.token_val !== qrToken) {
        return res.status(400).json({ error: '二维码已失效，请获取最新二维码' });
    }
    if (merchant.balance < 2) return res.status(402).json({ error: '商家算力不足' });

    const settings = await redis.get(`merchant:${merchantId}:settings`) || {};

    if (!settings.industry && !settings.product) {
        return res.status(400).json({ error: '该商家尚未设置行业和产品信息，请联系商家完善' });
    }

    let facts = '你是一位专业的好评写手。请为以下产品/服务写一篇好评：\n';
    if (settings.industry) facts += `行业：${settings.industry}\n`;
    if (settings.product) facts += `产品/服务名称：${settings.product}\n`;
    if (settings.keywords) facts += `关键词：${settings.keywords}\n`;
    if (settings.extraNote) facts += `补充信息：${settings.extraNote}\n`;

    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '未知';
    merchant.balance -= 2;
    await redis.set(`merchant:${merchantId}`, merchant);

    const flowKey = `flow:${merchantId}:${Date.now()}`;
    await redis.set(flowKey, {
        type: 'consume',
        amount: 2,
        balanceAfter: merchant.balance,
        time: new Date().toISOString(),
        note: `生成好评消耗 - 使用者IP: ${userIP}`
    });
    await redis.expire(flowKey, 60 * 60 * 24 * 30);

    const logEntry = {
        time: new Date().toISOString(),
        ip: userIP,
        merchant: merchantId,
        style,
        platform,
        prompt: prompt || ''
    };
    const logKey = `log:${Date.now()}:${Math.random().toString(36).substring(2,8)}`;
    await redis.set(logKey, logEntry);
    await redis.expire(logKey, 60 * 60 * 24 * 30);

    return generateContent(platform, style, prompt, facts, res);
}
