interface BlogPostJsonLdProps {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  imageUrl?: string;
}

export function BlogPostJsonLd({
  title,
  description,
  slug,
  datePublished,
  dateModified,
  imageUrl,
}: BlogPostJsonLdProps) {
  const postUrl = `https://skyrate.ai/blog/${slug}`;

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    ...(imageUrl && { image: imageUrl }),
    author: {
      "@type": "Organization",
      name: "SkyRate AI",
    },
    publisher: {
      "@type": "Organization",
      name: "SkyRate AI",
      logo: {
        "@type": "ImageObject",
        url: "https://skyrate.ai/images/logos/logo-icon-transparent.png",
      },
    },
    datePublished,
    dateModified: dateModified || datePublished,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": postUrl,
    },
  };

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://skyrate.ai",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://skyrate.ai/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: postUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPosting) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }}
      />
    </>
  );
}
