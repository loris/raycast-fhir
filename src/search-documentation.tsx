import { ActionPanel, Action, List, Color, Detail, showToast, Toast, Icon } from "@raycast/api";
import { usePromise, useFetch, useCachedState } from "@raycast/utils";
import { useState } from "react";
import Fuse from "fuse.js";
import {
  getPackageContentsUrl,
  getPackageContentsOptions,
  parsePackageContentsResponse,
  getResourceDetailOptions,
  parseResourceDetailResponse,
  FHIRPackageContent,
  FHIRResourceDetail,
} from "./utils/fhir-registry-api";
import { getSavedPackages, initializeDefaultPackages } from "./utils/storage";

export default function SearchDocumentation() {
  const [selectedPackageId, setSelectedPackageId] = useCachedState<string>("selected-package-id", "");

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
        return 3.0;
      case "valueset":
      case "codesystem":
        return 2.5;
      case "extension":
        return 2.0;
      case "searchparameter":
        return 1.5;
      case "operationdefinition":
        return 1.2;
      default:
        return 1.0;
    }
  };

  // Enhanced search filtering with fuzzy matching and weighting
  let filteredResources = resources || [];
  if (searchText.trim()) {
    // Configure Fuse.js for fuzzy search
    const fuse = new Fuse(filteredResources, {
      keys: [{ name: "title", weight: 1.0 }],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
    });

    const fuseResults = fuse.search(searchText);

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
        filteredResources.map((resource) => <FHIRResourceListItem key={resource.id} resource={resource} />)
      )}
    </List>
  );
}

function FHIRResourceListItem({ resource }: { resource: FHIRPackageContent }) {
  const title = resource.title;
  const keywords = [resource.title, resource.resourceType, resource.category, resource.fileName].filter(
    Boolean,
  ) as string[];

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
      subtitle={resource.url}
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
            <Action.Push title="Show Details" icon={Icon.Eye} target={<ResourceDetail resource={resource} />} />
            <Action.OpenInBrowser title="Open in Browser" url={resource.url} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy URL"
              content={resource.url}
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

function ResourceDetail({ resource }: { resource: FHIRPackageContent }) {
  console.log("resource", resource);
  const {
    data: detailData,
    isLoading,
    error,
  } = useFetch(resource.url, {
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
    return <Detail isLoading={true} navigationTitle={resource.title} />;
  }

  if (error) {
    return (
      <Detail
        markdown={`# Error Loading Resource\n\n${error.message}`}
        navigationTitle={resource.title}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser title="Open in Browser" url={resource.url} />
          </ActionPanel>
        }
      />
    );
  }

  return <ResourceDetailView resource={resource} detail={detail} />;
}

function ResourceDetailView({ resource, detail }: { resource: FHIRPackageContent; detail?: FHIRResourceDetail }) {
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
  let markdownContent = `## ${title}`;

  if (detail?.description) {
    markdownContent += `\n\n### Description\n\n${detail?.description}`;
  }

  if (detail?.purpose) {
    markdownContent += `\n\n### Purpose\n\n${detail?.purpose}`;
  }

  if (detail?.url) {
    markdownContent += `\n\n### URL\n\n${detail?.url}`;
  }

  return (
    <Detail
      markdown={markdownContent}
      navigationTitle={title}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Resource Type">
            <Detail.Metadata.TagList.Item text={detail?.resourceType || resource.resourceType || "Unknown"} />
          </Detail.Metadata.TagList>

          {detail?.status && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text={detail.status} color={getStatusColor(detail.status)} />
              {detail.experimental && <Detail.Metadata.TagList.Item text="experimental" color={Color.Red} />}
            </Detail.Metadata.TagList>
          )}

          <Detail.Metadata.Separator />

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
            <Detail.Metadata.TagList title="Mappings">
              {detail.mapping.map((m) => (
                <Detail.Metadata.TagList.Item key={m.name || m.identity} text={m.name || m.identity} />
              ))}
            </Detail.Metadata.TagList>
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in Browser" url={detail?.url || resource.url} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy URL"
              content={detail?.url || resource.url}
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
