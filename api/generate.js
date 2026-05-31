import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const defaultStyleGuides = {
    "情绪共鸣型": "你是一个感情细腻的真实游客，用第一人称讲述亲身经历，着重描述内心的感动与共鸣，让读者感同身受。",
    "宝藏发现型": "你是一个乐于分享冷门好物的探店达人，用惊喜的口吻突出这家店/产品的独特之处，仿佛发现了秘密基地。",
    "氛围描绘型": "你是一个对美学敏感的体验者，用生动的语言刻画环境氛围、光影、气味、声音，让读者仿佛置身其中。",
    "干货整理型": "你是一个逻辑清晰的攻略达人，以分点或小标题的形式整理实用信息（位置、价格、服务、必体验项目等），方便他人参考。",
    "攻略型": "你是一个旅游规划专家，结合该产品/服务给出详细的周边游玩或使用攻略，包含时间安排和注意事项。"
};

const platformGuides = {
    xiaohongshu: "请生成一篇小红书风格的笔记，语气亲切活泼，适当使用网络用语。",
    dianping: "请生成一篇大众点评风格的点评，客观真实，列出优点和不足，给出综合评分。",
    douyin: "请生成一段抖音风格的口播文案，节奏明快，使用短句和热门话题标签。"
};

// 辅助函数：从逗号分隔的字符串中随机选取指定数量的关键词
function pickRandomKeywords(keywordsStr, count = 2) {
    if (!keywordsStr) return [];
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) return [];
    // 随机打乱
    const shuffled = keywords.sort(() => Math.random() - 0.5);
    // 取 2~3 个（不能超过总数）
    const num = Math.min(count + Math.floor(Math.random() * 2), shuffled.length);
    return shuffled.slice(0, num);
}

// 处理补充说明：提取【着重介绍】部分，其余作为背景信息
function processExtraNote(extraNote) {
    if (!extraNote) return { background: '', highlights: [] };
    const highlights = [];
    const backgroundParts = [];
    const lines = extraNote.split('\n');
    let isHighlight = false;
    for (const line of lines) {
        if (line.trim().startsWith('【着重介绍】')) {
            isHighlight = true;
            highlights.push(line.trim().replace('【着重介绍】', '').trim());
        } else if (isHighlight) {
            highlights.push(line.trim());
        } else {
            backgroundParts.push(line.trim());
        }
    }
    return {
        background: backgroundParts.join('；'),
        highlights: highlights.filter(Boolean)
    };
}

async function generateContent(platform, useEmoji, style, prompt, facts, res) {
    const styleGuide = defaultStyleGuides[style] || '请写一篇热情的好评。';
    const platformGuide = platformGuides[platform] || platformGuides.xiaohongshu;
    
    let emojiInstruction = '';
    if (useEmoji) {
        emojiInstruction = '在文案中大量使用与内容相关的 emoji 表情符号，增加生动性和可读性。';
    } else {
        emojiInstruction = '请不要在文案中使用任何 emoji 表情符号，保持纯文字表达。';
    }

    const system = `你是一个专业的文案生成助手，必须严格按照以下要求生成文案：

1. 身份设定：${styleGuide}
2. 平台风格：${platformGuide}
3. 表情使用：${emojiInstruction}
4. 内容要求：
   - 必须基于以下商家信息进行创作，将随机选取的关键词自然地融入文案中，不要生硬罗列所有关键词。
   - 如果有门店位置，请像真实客人一样提及具体位置（如“从XX路拐进去就到”）。
   - 模拟真实客人的口吻，以第一人称叙述，加入具体的细节和真实的感受，避免空洞的套话。
   - 文案要流畅、真诚，避免明显的广告感，每次生成的表达方式应该有所变化，不要使用相同的模板。
   ${facts.highlights.length > 0 ? `需要着重介绍的部分：${facts.highlights.join('；')}` : ''}

商家基本信息：
${facts.basic}

补充要求：${prompt || '无'}`;

    const userMessage = prompt ? `请结合上述补充要点生成文案：${prompt}` : '请直接生成文案';

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
                    { role: 'user', content: userMessage }
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

    const { platform = 'xiaohongshu', useEmoji = true, style, prompt, merchant: merchantId, token: qrToken } = req.body;
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
    if (merchant.balance < 2) return res.status(402).json({ error: '商家算力不足，请充值后再试' });

    const settings = await redis.get(`merchant:${merchantId}:settings`) || {};

    if (!settings.industry && !settings.product) {
        return res.status(400).json({ error: '该商家尚未设置行业和产品信息，请联系商家完善' });
    }

    // 处理关键词：随机选取 2~3 个
    const selectedKeywords = pickRandomKeywords(settings.keywords);
    // 处理补充说明：分离【着重介绍】内容
    const extraInfo = processExtraNote(settings.extraNote);

    // 构建基本 facts 字符串（不含背景补充说明）
    let basicFacts = '';
    if (settings.industry) basicFacts += `行业：${settings.industry}\n`;
    if (settings.product) basicFacts += `产品/服务名称：${settings.product}\n`;
    if (settings.location) basicFacts += `门店位置：${settings.location}\n`;
    if (selectedKeywords.length > 0) basicFacts += `本次重点关键词：${selectedKeywords.join('、')}\n`;
    // 背景信息（不直接写入文案）作为额外的系统提示
    if (extraInfo.background) basicFacts += `其他背景（仅用于理解，不要生硬加入文案）：${extraInfo.background}\n`;

    const facts = {
        basic: basicFacts,
        highlights: extraInfo.highlights
    };

    // 扣除算力
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '未知';
    merchant.balance -= 2;
    await redis.set(`merchant:${merchantId}`, merchant);

    // 记录流水
    const flowKey = `flow:${merchantId}:${Date.now()}`;
    await redis.set(flowKey, {
        type: 'consume',
        amount: 2,
        balanceAfter: merchant.balance,
        time: new Date().toISOString(),
        note: `生成好评消耗 - 使用者IP: ${userIP}`
    });
    await redis.expire(flowKey, 60 * 60 * 24 * 30);

    // 日志
    const logEntry = {
        time: new Date().toISOString(),
        ip: userIP,
        merchant: merchantId,
        style,
        platform,
        useEmoji,
        prompt: prompt || ''
    };
    const logKey = `log:${Date.now()}:${Math.random().toString(36).substring(2,8)}`;
    await redis.set(logKey, logEntry);
    await redis.expire(logKey, 60 * 60 * 24 * 30);

    return generateContent(platform, useEmoji, style, prompt, facts, res);
}
