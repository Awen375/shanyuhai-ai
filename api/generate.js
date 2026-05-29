export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只支持POST请求' });
    }
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: '请提供 prompt 内容' });
    }
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
                    { role: 'system', content: '你是一个小红书文案专家，请生成热情洋溢的好评文案，带emoji和话题标签。' },
                    { role: 'user', content: prompt }
                ]
            })
        });
        const data = await response.json();
        res.status(200).json({ result: data.choices[0].message.content });
    } catch (err) {
        res.status(500).json({ error: 'AI生成失败，请稍后重试' });
    }
}
