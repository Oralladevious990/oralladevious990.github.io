import fs from 'node:fs/promises';

const TIME_ZONE = 'Asia/Shanghai';

const RSS_SOURCES = [
  { name: 'IT之家', url: 'https://www.ithome.com/rss/' },
  { name: '开源中国', url: 'https://www.oschina.net/news/rss' },
  { name: 'Solidot', url: 'https://www.solidot.org/index.rss' },
  { name: '少数派', url: 'https://sspai.com/feed' },
  { name: '36氪', url: 'https://36kr.com/feed' },
];

const CATEGORY_RULES = [
  {
    category: '大模型',
    keywords: [
      '人工智能',
      '大模型',
      '生成式AI',
      '生成式 AI',
      '多模态',
      'AI Agent',
      '智能体',
      '推理模型',
      'OpenAI',
      'ChatGPT',
      'GPT',
      'Anthropic',
      'Claude',
      'Gemini',
      'DeepMind',
      'xAI',
      'Grok',
      'Llama',
      'Mistral',
      'DeepSeek',
      '通义千问',
      '文心一言',
      '豆包',
      'Kimi',
    ],
  },
  {
    category: '芯片',
    keywords: [
      '芯片',
      '半导体',
      '算力',
      'GPU',
      'AI芯片',
      'AI 芯片',
      'HBM',
      '存储芯片',
      '光刻机',
      '晶圆',
      '封装',
      '台积电',
      '英伟达',
      'NVIDIA',
      'AMD',
      '英特尔',
      '高通',
      '博通',
      '三星电子',
      'SK海力士',
      '美光',
      '昇腾',
      '寒武纪',
      '海光信息',
      '长鑫科技',
      '中芯国际',
    ],
  },
  {
    category: '新产品',
    keywords: [
      '新产品',
      '发布',
      '上线',
      '应用',
      'AI产品',
      'AI 产品',
      'AI应用',
      'AI 应用',
      'AI手机',
      'AI PC',
      '智能硬件',
      '机器人',
      '人形机器人',
      '自动驾驶',
      '智能汽车',
      'AR眼镜',
      'XR',
      '可穿戴',
      '无人机',
      '具身智能',
      '脑机接口',
      'SaaS',
      '企业服务',
      '苹果',
      '特斯拉',
      '华为',
      '小米',
      '字节跳动',
      '阿里巴巴',
      '腾讯',
    ],
  },
];

const TAG_CANDIDATES = [
  'OpenAI',
  'ChatGPT',
  'Google',
  'Gemini',
  'Anthropic',
  'Claude',
  'DeepSeek',
  'Kimi',
  '英伟达',
  'NVIDIA',
  '台积电',
  '华为',
  '小米',
  '苹果',
  '特斯拉',
  '芯片',
  '半导体',
  '机器人',
  'AI',
];

function formatDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatWeekday(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: TIME_ZONE,
    weekday: 'long',
  }).format(date);
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripHtml(value = '') {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitText(value = '', maxLength = 120) {
  const text = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join('')}...` : text;
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function readLink(xml) {
  const rssLink = readTag(xml, 'link');
  if (rssLink) return rssLink;

  const atomLink = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return atomLink ? decodeXml(atomLink[1]) : '';
}

function formatPublishTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${formatDate()} 09:00`;

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(' ', ' ');
}

function scoreCategory(text, rule) {
  const normalized = text.toLowerCase();
  return rule.keywords.reduce((score, keyword) => {
    return normalized.includes(keyword.toLowerCase()) ? score + 1 : score;
  }, 0);
}

function classifyItem(title, summary) {
  const text = `${title} ${summary}`;
  const scored = CATEGORY_RULES.map((rule) => ({
    category: rule.category,
    score: scoreCategory(text, rule),
  })).sort((a, b) => b.score - a.score);

  return scored[0].score > 0 ? scored[0].category : '新产品';
}

function makeTags(title, summary, category) {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = [category];

  for (const candidate of TAG_CANDIDATES) {
    if (tags.length >= 4) break;
    if (text.includes(candidate.toLowerCase()) && !tags.includes(candidate)) {
      tags.push(candidate);
    }
  }

  return tags;
}

function parseItems(xml, source) {
  const matches = [
    ...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi),
  ];

  return matches.map((match) => {
    const item = match[1];
    const title = stripHtml(readTag(item, 'title'));
    const rawSummary = readTag(item, 'description') || readTag(item, 'summary') || readTag(item, 'content');
    const fullSummaryText = stripHtml(rawSummary);
    const summaryText = limitText(fullSummaryText);
    const link = readLink(item);
    const pubDate = readTag(item, 'pubDate') || readTag(item, 'published') || readTag(item, 'updated');
    const category = classifyItem(title, fullSummaryText);

    return {
      category,
      title,
      summary: summaryText || `${title}。来源：${source.name}。`,
      source: source.name,
      publish_time: formatPublishTime(pubDate),
      url: link,
      tags: makeTags(title, fullSummaryText, category),
    };
  }).filter((item) => item.title && item.url);
}

async function fetchSource(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        'user-agent': 'TechPulseBot/1.0 (+https://52lkj.github.io/)',
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const items = parseItems(xml, source);
    console.log(`${source.name}: ${items.length}`);
    return items;
  } catch (error) {
    console.warn(`${source.name} skipped: ${error.message}`);
    return [];
  }
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.title.replace(/\W+/g, '').toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const grouped = await Promise.all(RSS_SOURCES.map(fetchSource));
  const hotspots = uniqueItems(grouped.flat())
    .sort((a, b) => b.publish_time.localeCompare(a.publish_time))
    .map((item, index) => ({ id: index + 1, ...item }));

  if (hotspots.length < 10) {
    throw new Error(`Only generated ${hotspots.length} hotspots; refusing to publish sparse data.`);
  }

  const date = formatDate();
  const weekday = formatWeekday();
  const counts = Object.fromEntries(CATEGORY_RULES.map((rule) => [
    rule.category,
    hotspots.filter((item) => item.category === rule.category).length,
  ]));
  const topTitles = hotspots.slice(0, 5).map((item) => item.title).join('；');
  const data = {
    date,
    weekday,
    summary: `${date} 科技热点自动更新：共收录 ${hotspots.length} 条资讯，覆盖大模型 ${counts['大模型'] || 0} 条、芯片 ${counts['芯片'] || 0} 条、新产品 ${counts['新产品'] || 0} 条。重点包括：${topTitles}。`,
    keywords: [...new Set(hotspots.flatMap((item) => item.tags))].slice(0, 10),
    hotspots,
  };

  await fs.writeFile('data.json', `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  const html = await fs.readFile('index.html', 'utf8');
  const updatedHtml = html.replace(
    /let DATA = \{[\s\S]*?\n\};\n\n\/\/ 渲染/,
    `let DATA = ${JSON.stringify(data, null, 2)};\n\n// 渲染`,
  );
  if (updatedHtml === html) {
    throw new Error('Could not update inline DATA fallback in index.html');
  }
  await fs.writeFile('index.html', updatedHtml, 'utf8');

  console.log(`Generated ${hotspots.length} hotspots for ${date}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
