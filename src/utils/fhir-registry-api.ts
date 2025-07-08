export interface FHIRPackage {
  id: string;
  name: string;
  title: string;
  version: string;
  description: string;
  canonical: string;
  url: string;
  publisher?: string;
  author?: string;
  fhirMajorVersion: number[];
  latest: boolean;
  totalDownloads: number;
  date: string;
}

export interface FHIRPackageContent {
  fileName?: string;
  canonical: string;
  id: number;
  title: string;
  category?: string;
  resourceType: string;
}

export interface FHIRPackageDetails {
  entity: {
    _source: {
      contents: FHIRPackageContent[];
    };
  };
}

export interface FHIRResourceDetail {
  resourceType: string;
  id: string;
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status?: string;
  experimental?: boolean;
  date?: string;
  publisher?: string;
  description?: string;
  contact?: Array<{
    name?: string;
    telecom?: Array<{
      system: string;
      value: string;
    }>;
  }>;
  jurisdiction?: Array<{
    coding: Array<{
      system: string;
      code: string;
      display?: string;
    }>;
  }>;
  mapping?: Array<{
    identity: string;
    uri?: string;
    name?: string;
  }>;
  [key: string]: unknown;
}

export function getSearchPackagesUrl(): string {
  return "https://registry.fhir.org/api/search/records/_msearch?";
}

export function getSearchPackagesOptions(query: string): RequestInit {
  // Multi-search format with NDJSON
  const header = JSON.stringify({ preference: "SearchResult" });
  const queryBody = JSON.stringify({
    query: {
      bool: {
        must: [
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        multi_match: {
                          query: query,
                          fields: ["canonical^5", "title^4", "description^4", "name^4"],
                          type: "best_fields",
                          operator: "and",
                          fuzziness: 1,
                        },
                      },
                    ],
                    minimum_should_match: "1",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    size: 10,
    _source: {
      includes: ["*"],
      excludes: [],
    },
    from: 0,
  });

  const requestBody = `${header}\n${queryBody}`;

  return {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-ndjson",
    },
    body: requestBody,
  };
}

export function parseSearchPackagesResponse(data: unknown): FHIRPackage[] {
  // Multi-search response structure
  const response = data as { responses?: Array<{ hits?: { hits?: Array<{ _source: FHIRPackage }> } }> };
  const results = response.responses?.[0]?.hits?.hits || [];

  return results.map((hit) => ({
    id: hit._source.id,
    name: hit._source.name,
    title: hit._source.title,
    version: hit._source.version,
    description: hit._source.description,
    canonical: hit._source.canonical,
    url: hit._source.url,
    publisher: hit._source.publisher,
    author: hit._source.author,
    fhirMajorVersion: hit._source.fhirMajorVersion || [],
    latest: hit._source.latest,
    totalDownloads: hit._source.totalDownloads,
    date: hit._source.date,
  }));
}

export function getPackageContentsUrl(packageId: string): string {
  const encodedPackageId = encodeURIComponent(packageId);
  return `https://registry.fhir.org/api/package/${encodedPackageId}`;
}

export function getPackageContentsOptions(): RequestInit {
  return {
    headers: {
      accept: "*/*",
    },
  };
}

export function parsePackageContentsResponse(data: unknown): FHIRPackageContent[] {
  const response = data as FHIRPackageDetails;
  return (
  response.entity._source.contents
      .filter((item) => item.canonical && item.canonical.startsWith("http"))
      .map((item) => ({
        id: item.id,
        canonical: item.canonical,
        title: item.title,
        resourceType: item.resourceType,
      })) || []
  );
}

export function getResourceDetailUrl(canonicalUrl: string): string {
  // For now, return the canonical URL - we'll handle redirects in the component
  return canonicalUrl;
}

export function getResourceDetailOptions(): RequestInit {
  return {
    redirect: "follow" as RequestRedirect,
  };
}

export function parseResourceDetailResponse(data: unknown): FHIRResourceDetail {
  return data as FHIRResourceDetail;
}
