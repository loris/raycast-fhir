import { ActionPanel, Action, List, Color, Detail, showToast, Toast, Icon } from "@raycast/api";
import { usePromise, useFetch, useCachedState } from "@raycast/utils";
import { useState } from "react";
import Fuse from "fuse.js";
import {
  getPackageContentsUrl,
  getPackageContentsOptions,
  parsePackageContentsResponse,
  getResourceDetailUrl,
  getResourceDetailOptions,
  parseResourceDetailResponse,
  FHIRPackageContent,
  FHIRResourceDetail,
} from "./utils/fhir-registry-api";
import { getSavedPackages, initializeDefaultPackages } from "./utils/storage";

export default function SearchDocumentation() {
  const [selectedPackageId, setSelectedPackageId] = useCachedState<string>("selected-package-id", "");
  const [selectedResource, setSelectedResource] = useState<FHIRPackageContent | null>(null);

  // Initialize default packages and get saved packages
  const { data: packages, isLoading: isLoadingPackages } = usePromise(async () => {
    await initializeDefaultPackages();
    return await getSavedPackages();
  }, []);

  const defaultPackageId = packages?.find((pkg) => pkg.id.includes("hl7.fhir.r5.core"))?.id || packages?.[0]?.id;

  // Get package contents when a package is selected
  const shouldFetchContents = Boolean(selectedPackageId);
  const { data: packageContentsData, isLoading: isLoadingResources } = useFetch(
    shouldFetchContents ? getPackageContentsUrl(selectedPackageId) : "",
    {
      ...getPackageContentsOptions(),
      keepPreviousData: true,
      execute: shouldFetchContents,
    },
  );

  // Search state
  const [searchText, setSearchText] = useState("");

  const resources = packageContentsData ? parsePackageContentsResponse(packageContentsData) : [];
  const handlePackageChange = (packageId: string) => {
    setSelectedPackageId(packageId);
    setSelectedResource(null);
  };

  const handleResourceSelect = (resource: FHIRPackageContent) => {
    setSelectedResource(resource);
  };

  const packageDropdownOptions =
    packages?.map((pkg) => ({
      id: pkg.id,
      title: pkg.title,
      value: pkg.id,
    })) || [];

  const selectedPackage = packages?.find((pkg) => pkg.id === selectedPackageId);

  // Resource type importance weighting
  const getResourceTypeWeight = (resourceType: string): number => {
    switch (resourceType?.toLowerCase()) {
      case "structuredefinition":
        return 3.0; // Most important - defines resource structures
      case "valueset":
      case "codesystem":
        return 2.5; // Very important - coding and terminology
      case "extension":
        return 2.0; // Important - widely used extensions
      case "searchparameter":
        return 1.5; // Useful for implementers
      case "operationdefinition":
        return 1.2; // Useful for advanced operations
      default:
        return 1.0; // Default weight
    }
  };

  // Enhanced search filtering with fuzzy matching and weighting
  let filteredResources = resources || [];

  if (searchText.trim()) {
    // Configure Fuse.js for fuzzy search
    const fuse = new Fuse(filteredResources, {
      keys: [
        {
          name: "title",
          weight: 1.0,
        },
      ],
      threshold: 0.4, // Lower = more strict matching
      distance: 100,
      includeScore: true,
    });

    const fuseResults = fuse.search(searchText);

    // Apply resource type weighting and sort
    const scoredResults = fuseResults.map((result) => ({
      item: result.item,
      combinedScore: (result.score || 0) / getResourceTypeWeight(result.item.resourceType),
    }));

    scoredResults.sort((a, b) => a.combinedScore - b.combinedScore);

    filteredResources = scoredResults.map((scored) => scored.item);
  } else {
    // When no search, sort by resource type importance
    filteredResources = filteredResources.sort((a, b) => {
      const weightA = getResourceTypeWeight(a.resourceType);
      const weightB = getResourceTypeWeight(b.resourceType);
      if (weightA !== weightB) {
        return weightB - weightA; // Higher weight first
      }
      return a.title.localeCompare(b.title); // Then alphabetical
    });
  }

  // Limit to 50 items max to prevent memory issues
  filteredResources = filteredResources.slice(0, 50);

  if (selectedResource) {
    return <ResourceDetail resource={selectedResource} onBack={() => setSelectedResource(null)} />;
  }

  return (
    <List
      isLoading={isLoadingPackages || isLoadingResources}
      searchBarPlaceholder="Search FHIR resources..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
      filtering={false}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Package"
          value={selectedPackageId}
          onChange={handlePackageChange}
          storeValue
          defaultValue={defaultPackageId}
        >
          {packageDropdownOptions.map((option) => (
            <List.Dropdown.Item key={option.id} title={option.title} value={option.value} />
          ))}
        </List.Dropdown>
      }
    >
      {filteredResources.length === 0 ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="No Resources Found"
          description={selectedPackage ? `No resources found in ${selectedPackage.title}` : "No resources available"}
        />
      ) : (
        filteredResources.map((resource) => (
          <FHIRResourceListItem key={resource.id} resource={resource} onSelect={() => handleResourceSelect(resource)} />
        ))
      )}
    </List>
  );
}

function FHIRResourceListItem({ resource, onSelect }: { resource: FHIRPackageContent; onSelect: () => void }) {
  const title = resource.title;
  const keywords = [
    resource.title,
    resource.canonical,
    resource.resourceType,
    resource.category,
    resource.fileName,
  ].filter(Boolean) as string[];

  const getResourceTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "structuredefinition":
        return Color.Blue;
      case "valueset":
        return Color.Green;
      case "codesystem":
        return Color.Orange;
      case "searchparameter":
        return Color.Purple;
      case "operationdefinition":
        return Color.Red;
      case "extension":
        return Color.Yellow;
      default:
        return Color.SecondaryText;
    }
  };

  return (
    <List.Item
      title={title}
      subtitle={resource.canonical}
      keywords={keywords}
      accessories={[
        {
          tag: {
            value: resource.resourceType || resource.category || "Unknown",
            color: getResourceTypeColor(resource.resourceType || resource.category || "Unknown"),
          },
        },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="View Details" icon={Icon.Eye} onAction={onSelect} />
            {resource.canonical && <Action.OpenInBrowser title="Open in Browser" url={resource.canonical} />}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Canonical URL"
              content={resource.canonical}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
            <Action.CopyToClipboard
              title="Copy Title"
              content={resource.title}
              shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function ResourceDetail({ resource, onBack }: { resource: FHIRPackageContent; onBack: () => void }) {
  const {
    data: detailData,
    isLoading,
    error,
  } = useFetch(getResourceDetailUrl(resource.canonical), {
    ...getResourceDetailOptions(),
    onError: async (error) => {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load resource details",
        message: error.message,
      });
    },
  });

  const detail = detailData ? parseResourceDetailResponse(detailData) : undefined;

  if (isLoading) {
    return (
      <Detail
        isLoading={true}
        navigationTitle={resource.title}
        actions={
          <ActionPanel>
            <Action title="Back" onAction={onBack} />
          </ActionPanel>
        }
      />
    );
  }

  if (error) {
    return (
      <Detail
        markdown={`# Error Loading Resource\n\n${error.message}`}
        navigationTitle={resource.title}
        actions={
          <ActionPanel>
            <Action title="Back" onAction={onBack} />
            {resource.canonical && <Action.OpenInBrowser title="Open in Browser" url={resource.canonical} />}
          </ActionPanel>
        }
      />
    );
  }

  return <ResourceDetailView resource={resource} detail={detail} onBack={onBack} />;
}

function ResourceDetailView({
  resource,
  detail,
  onBack,
}: {
  resource: FHIRPackageContent;
  detail?: FHIRResourceDetail;
  onBack: () => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return Color.Green;
      case "draft":
        return Color.Orange;
      case "retired":
        return Color.SecondaryText;
      case "unknown":
        return Color.Yellow;
      default:
        return undefined;
    }
  };

  const title = detail?.title || detail?.name || resource.title;
  const description = detail?.description || "No description available";

  const markdownContent = `# ${title}\n\n${description}`;

  return (
    <Detail
      markdown={markdownContent}
      navigationTitle={title}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Resource Type">
            <Detail.Metadata.TagList.Item text={detail?.resourceType || resource.resourceType || "Unknown"} />
          </Detail.Metadata.TagList>

          <Detail.Metadata.TagList title="ID">
            <Detail.Metadata.TagList.Item text={detail?.id || "Unknown"} />
          </Detail.Metadata.TagList>

          {detail?.status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text={detail.status} color={getStatusColor(detail.status)} />
              {detail.experimental && <Detail.Metadata.TagList.Item text="experimental" color={Color.Red} />}
            </Detail.Metadata.TagList>
          )}

          <Detail.Metadata.Separator />

          {detail?.url && <Detail.Metadata.Link title="URL" target={detail.url} text={detail.url} />}

          {resource.canonical && (
            <Detail.Metadata.Link title="Canonical URL" target={resource.canonical} text={resource.canonical} />
          )}

          {detail?.version && <Detail.Metadata.Label title="Version" text={detail.version} />}

          {detail?.publisher && <Detail.Metadata.Label title="Publisher" text={detail.publisher} />}

          {detail?.date && <Detail.Metadata.Label title="Date" text={new Date(detail.date).toLocaleDateString()} />}

          {detail?.contact && detail.contact.length > 0 && (
            <Detail.Metadata.Label
              title="Contact"
              text={detail.contact[0].name || detail.contact[0].telecom?.[0]?.value || "Available"}
            />
          )}

          {detail?.jurisdiction && detail.jurisdiction.length > 0 && (
            <Detail.Metadata.Label
              title="Jurisdiction"
              text={detail.jurisdiction
                .map((j) => j.coding?.[0]?.display || j.coding?.[0]?.code || "Specified")
                .join(", ")}
            />
          )}

          {detail?.mapping && detail.mapping.length > 0 && (
            <Detail.Metadata.Label title="Mappings" text={detail.mapping.map((m) => m.name || m.identity).join(", ")} />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Back" onAction={onBack} />
            {resource.canonical && (
              <Action.OpenInBrowser
                title="Open in Browser"
                url={resource.canonical}
                shortcut={{ modifiers: ["cmd"], key: "o" }}
              />
            )}
            {detail?.url && detail.url !== resource.canonical && (
              <Action.OpenInBrowser
                title="Open Resource URL"
                url={detail.url}
                shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Canonical URL"
              content={resource.canonical}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
            {detail?.id && (
              <Action.CopyToClipboard
                title="Copy Resource ID"
                content={detail.id}
                shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
