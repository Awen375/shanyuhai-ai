import { kv } from '@vercel/kv';

const defaultStyleGuides = {
    "情绪共鸣型": "你是感情细腻的体验者。用第一人称写小红书好评，抒发内心感动、放松与共鸣，带emoji和话题标签。",
    "宝藏发现型": "你是乐于分享隐藏好物的博主。用惊喜口吻突出产品或服务的独特、性价比，像发现秘密基地。",
    "氛围描绘型": "你是擅长描写环境的作家。着重刻画环境、氛围、细节，让读者身临其境。",
    "干货整理型": "你是信息整理达人。用分点或小标题介绍产品特点、服务、价格、位置等实用信息。",
    "攻略型": "你是攻略专家。结合产品或服务给出详细的使用/体验攻略。"
};

async function generateContent(style, prompt, facts, res) {
    const system = facts + '\n\n' + (defaultStyleGuides[style] || '请写一篇热情的小红书好评，带emoji和话题标签。');
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

    const { prompt, style, merchant: merchantId, token: qrToken } = req.body;
    if (!style) return res.status(400).json({ error: '请选择写作风格' });

    if (!merchantId) {
        return res.status(400).json({ error: '请通过商家二维码访问' });
    }

    const merchant = await kv.get(`merchant:${merchantId}`);
    if (!merchant) return res.status(400).json({ error: '无效商家' });
    if (merchant.status === 'banned') return res.status(403).json({ error: '该商家已被封禁' });
    if (merchant.token_val && merchant.token_val !== qrToken) {
        return res.status(400).json({ error: '二维码已失效，请获取最新二维码' });
    }
    if (merchant.balance < 2) return res.status(402).json({ error: '商家算力不足' });

    // 读取商家自定义设置
    const settings = await kv.get(`merchant:${merchantId}:settings`) || {};

    // 如果没有任何自定义信息，则拒绝生成
    if (!settings.industry && !settings.product) {
        return res.status(400).json({ error: '该商家尚未设置行业和产品信息，请联系商家完善' });
    }

    // 构建专属 prompt
    let facts = '你是一位专业的小红书好评写手。请为以下产品/服务写一篇好评：\n';
    if (settings.industry) facts += `行业：${settings.industry}\n`;
    if (settings.product) facts += `产品/服务名称：${settings.product}\n`;
    if (settings.keywords) facts += `关键词：${settings.keywords}\n`;
    if (settings.extraNote) facts += `补充信息：${settings.extraNote}\n`;
    facts += `\n请根据以上信息，生成一篇真诚、生动的小红书风格好评，包含emoji和话题标签。`;

    // 扣除算力
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '未知';
    merchant.balance -= 2;
    await kv.set(`merchant:${merchantId}`, merchant);

    // 记录消费流水
    await kv.set(`flow:${merchantId}:${Date.now()}`, JSON.stringify({
        type: 'consume',
        amount: 2,
        balanceAfter: merchant.balance,
        time: new Date().toISOString(),
        note: `生成好评消耗 - 使用者IP: ${userIP}`
    }));

    // 日志
    const logEntry = {
        time: new Date().toISOString(),
        ip: userIP,
        merchant: merchantId,
        style,
        prompt: prompt || ''
    };
    const logKey = `log:${Date.now()}:${Math.random().toString(36).substring(2,8)}`;
    await kv.set(logKey, JSON.stringify(logEntry));
    await kv.expire(logKey, 60*60*24*30);

    return generateContent(style, prompt, facts, res);
}
