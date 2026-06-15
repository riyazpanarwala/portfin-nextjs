/**
 * SEO utilities for generating consistent metadata across pages
 * Used for both static and dynamic routes
 */

export const siteConfig = {
  name: 'PortFin',
  description: 'Track your Indian equity and mutual fund portfolio with real-time analytics, goal planning, and tax insights.',
  url: 'https://portfin.local',
  ogImage: 'https://portfin.local/og-image.png',
  twitter: '@portfin',
};

/**
 * Generate metadata for any page
 * @param {Object} options - Page-specific metadata
 * @returns {Object} Metadata object for Next.js metadata export
 */
export function generateMetadata(options = {}) {
  const {
    title = siteConfig.name,
    description = siteConfig.description,
    path = '/',
    ogType = 'website',
    image = siteConfig.ogImage,
  } = options;

  const url = `${siteConfig.url}${path}`;
  const fullTitle = title === siteConfig.name ? title : `${title} | ${siteConfig.name}`;

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      url,
      type: ogType,
      siteName: siteConfig.name,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      creator: siteConfig.twitter,
      images: [image],
    },
    canonical: url,
  };
}

/**
 * Generate breadcrumb schema for SEO
 * @param {Array} items - Breadcrumb items [{label, url}]
 * @returns {Object} BreadcrumbList schema
 */
export function generateBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: item.url,
    })),
  };
}

/**
 * Generate Article schema for blog/content pages
 * @param {Object} article - Article metadata
 * @returns {Object} Article schema
 */
export function generateArticleSchema(article) {
  const {
    title,
    description,
    publishedDate,
    modifiedDate,
    author = siteConfig.name,
    image = siteConfig.ogImage,
  } = article;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image,
    datePublished: publishedDate,
    dateModified: modifiedDate || publishedDate,
    author: {
      '@type': 'Organization',
      name: author,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

/**
 * Generate Organization schema
 * @returns {Object} Organization schema
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    sameAs: [`https://twitter.com/portfin`],
    contactPoint: {
      '@type': 'ContactPoint',
      url: siteConfig.url,
      contactType: 'Support',
    },
  };
}

/**
 * Generate FAQ schema
 * @param {Array} faqs - FAQ items [{question, answer}]
 * @returns {Object} FAQPage schema
 */
export function generateFaqSchema(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
