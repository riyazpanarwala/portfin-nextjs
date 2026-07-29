export default function sitemap() {
  const baseUrl = 'https://portfin-riyaz.panarwala.in';
  const currentDate = new Date().toISOString().split('T')[0];

  const views = [
    { url: '', changeFrequency: 'daily', priority: 1.0 },
    { url: '?view=overview', changeFrequency: 'daily', priority: 0.9 },
    { url: '?view=analytics', changeFrequency: 'daily', priority: 0.8 },
    { url: '?view=stocks', changeFrequency: 'daily', priority: 0.8 },
    { url: '?view=mf', changeFrequency: 'daily', priority: 0.8 },
    { url: '?view=goal', changeFrequency: 'weekly', priority: 0.7 },
    { url: '?view=vs-nifty', changeFrequency: 'daily', priority: 0.8 },
    { url: '?view=rebalancer', changeFrequency: 'weekly', priority: 0.7 },
    { url: '?view=ai-advisor', changeFrequency: 'weekly', priority: 0.7 },
  ];

  return views.map((item) => ({
    url: `${baseUrl}/${item.url}`,
    lastModified: currentDate,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));
}
